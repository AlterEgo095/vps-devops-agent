import Database from 'better-sqlite3';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import bcrypt from 'bcrypt';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * RBAC Database Service
 * Gère users, sessions, audit_logs, permissions
 */
class RBACDatabase {
  constructor(dbPath = join(__dirname, '../../data/rbac.db')) {
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    this.initialize();
  }

  /**
   * Initialize database schema
   */
  initialize() {
    const schemaPath = join(__dirname, '../database/schema-rbac.sql');
    const schema = readFileSync(schemaPath, 'utf-8');
    
    // Execute schema
    this.db.exec(schema);
    
    console.log('✅ RBAC Database initialized');
  }

  // ============================================================
  // USER MANAGEMENT
  // ============================================================

  /**
   * Create a new user
   */
  async createUser({ username, email, password, role = 'user' }) {
    const passwordHash = await bcrypt.hash(password, 10);
    
    const stmt = this.db.prepare(`
      INSERT INTO users (username, email, password_hash, role)
      VALUES (?, ?, ?, ?)
    `);
    
    const result = stmt.run(username, email, passwordHash, role);
    return this.getUserById(result.lastInsertRowid);
  }

  /**
   * Get user by ID
   */
  getUserById(id) {
    const stmt = this.db.prepare(`
      SELECT id, username, email, role, is_active, created_at, updated_at, last_login, last_login_ip
      FROM users WHERE id = ?
    `);
    return stmt.get(id);
  }

  /**
   * Get user by username
   */
  getUserByUsername(username) {
    const stmt = this.db.prepare(`
      SELECT * FROM users WHERE username = ?
    `);
    return stmt.get(username);
  }

  /**
   * Get user by email
   */
  getUserByEmail(email) {
    const stmt = this.db.prepare(`
      SELECT * FROM users WHERE email = ?
    `);
    return stmt.get(email);
  }

  /**
   * List all users (with pagination)
   */
  listUsers({ page = 1, limit = 20, role = null, isActive = null } = {}) {
    const offset = (page - 1) * limit;
    let query = 'SELECT id, username, email, role, is_active, created_at, last_login FROM users WHERE 1=1';
    const params = [];

    if (role) {
      query += ' AND role = ?';
      params.push(role);
    }

    if (isActive !== null) {
      query += ' AND is_active = ?';
      params.push(isActive ? 1 : 0);
    }

    query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const stmt = this.db.prepare(query);
    const users = stmt.all(...params);

    // Count total
    const countStmt = this.db.prepare('SELECT COUNT(*) as total FROM users');
    const { total } = countStmt.get();

    return {
      users,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    };
  }

  /**
   * Update user
   */
  updateUser(id, { username, email, role, isActive }) {
    const fields = [];
    const params = [];

    if (username !== undefined) {
      fields.push('username = ?');
      params.push(username);
    }
    if (email !== undefined) {
      fields.push('email = ?');
      params.push(email);
    }
    if (role !== undefined) {
      fields.push('role = ?');
      params.push(role);
    }
    if (isActive !== undefined) {
      fields.push('is_active = ?');
      params.push(isActive ? 1 : 0);
    }

    if (fields.length === 0) return this.getUserById(id);

    params.push(id);
    const stmt = this.db.prepare(`
      UPDATE users SET ${fields.join(', ')} WHERE id = ?
    `);
    stmt.run(...params);

    return this.getUserById(id);
  }

  /**
   * Delete user
   */
  deleteUser(id) {
    const stmt = this.db.prepare('DELETE FROM users WHERE id = ?');
    const result = stmt.run(id);
    return result.changes > 0;
  }

  /**
   * Verify user password
   */
  async verifyPassword(username, password) {
    const user = this.getUserByUsername(username);
    if (!user) return null;

    const isValid = await bcrypt.compare(password, user.password_hash);
    if (!isValid) return null;

    return user;
  }

  /**
   * Update last login
   */
  updateLastLogin(userId, ipAddress) {
    const stmt = this.db.prepare(`
      UPDATE users 
      SET last_login = CURRENT_TIMESTAMP, last_login_ip = ?
      WHERE id = ?
    `);
    stmt.run(ipAddress, userId);
  }

  // ============================================================
  // SESSION MANAGEMENT
  // ============================================================

  /**
   * Create session
   */
  createSession({ userId, token, ipAddress, userAgent, expiresAt }) {
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const expiresAtStr = typeof expiresAt === 'string' ? expiresAt : expiresAt.toISOString();
    
    const stmt = this.db.prepare(`
      INSERT INTO sessions (user_id, token_hash, ip_address, user_agent, expires_at)
      VALUES (?, ?, ?, ?, ?)
    `);
    
    const result = stmt.run(userId, tokenHash, ipAddress, userAgent, expiresAtStr);
    
    return {
      id: result.lastInsertRowid,
      user_id: userId,
      ip_address: ipAddress,
      user_agent: userAgent,
      expires_at: expiresAtStr,
      is_active: 1,
      created_at: new Date().toISOString()
    };
  }

  /**
   * Get session by token
   */
  getSessionByToken(token) {
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    
    const stmt = this.db.prepare(`
      SELECT s.*, u.username, u.role, u.is_active as user_active
      FROM sessions s
      JOIN users u ON s.user_id = u.id
      WHERE s.token_hash = ? AND s.is_active = 1 AND s.expires_at > datetime('now')
    `);
    
    return stmt.get(tokenHash);
  }

  /**
   * List user sessions
   */
  listUserSessions(userId, activeOnly = false) {
    let query = 'SELECT * FROM sessions WHERE user_id = ?';
    
    if (activeOnly) {
      query += ' AND is_active = 1 AND expires_at > datetime(\'now\')';
    }
    
    query += ' ORDER BY created_at DESC';
    
    const stmt = this.db.prepare(query);
    return stmt.all(userId);
  }

  /**
   * List all active sessions
   */
  listActiveSessions() {
    const stmt = this.db.prepare('SELECT * FROM v_active_sessions');
    return stmt.all();
  }

  /**
   * Revoke session
   */
  revokeSession(sessionId, revokedBy) {
    const stmt = this.db.prepare(`
      UPDATE sessions 
      SET is_active = 0, revoked_at = CURRENT_TIMESTAMP, revoked_by = ?
      WHERE id = ?
    `);
    const result = stmt.run(revokedBy, sessionId);
    return result.changes > 0;
  }

  /**
   * Revoke all user sessions
   */
  revokeAllUserSessions(userId, revokedBy) {
    const stmt = this.db.prepare(`
      UPDATE sessions 
      SET is_active = 0, revoked_at = CURRENT_TIMESTAMP, revoked_by = ?
      WHERE user_id = ? AND is_active = 1
    `);
    const result = stmt.run(revokedBy, userId);
    return result.changes;
  }

  /**
   * Update session activity
   */
  updateSessionActivity(sessionId) {
    const stmt = this.db.prepare(`
      UPDATE sessions SET last_activity = CURRENT_TIMESTAMP WHERE id = ?
    `);
    stmt.run(sessionId);
  }

  /**
   * Clean expired sessions
   */
  cleanExpiredSessions() {
    const stmt = this.db.prepare(`
      DELETE FROM sessions WHERE expires_at < datetime('now', '-7 days')
    `);
    const result = stmt.run();
    return result.changes;
  }

  // ============================================================
  // AUDIT LOGS
  // ============================================================

  /**
   * Create audit log entry
   */
  createAuditLog({ userId, action, resource, resourceId, details, ipAddress, userAgent, status = 'success', errorMessage = null, durationMs = null }) {
    const stmt = this.db.prepare(`
      INSERT INTO audit_logs (user_id, action, resource, resource_id, details, ip_address, user_agent, status, error_message, duration_ms)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    const detailsJson = typeof details === 'object' ? JSON.stringify(details) : details;
    
    const result = stmt.run(
      userId,
      action,
      resource,
      resourceId,
      detailsJson,
      ipAddress,
      userAgent,
      status,
      errorMessage,
      durationMs
    );
    
    return result.lastInsertRowid;
  }

  /**
   * Get audit logs (with pagination and filters)
   */
  getAuditLogs({ page = 1, limit = 50, userId = null, action = null, resource = null, status = null, startDate = null, endDate = null } = {}) {
    const offset = (page - 1) * limit;
    let query = 'SELECT a.*, u.username FROM audit_logs a LEFT JOIN users u ON a.user_id = u.id WHERE 1=1';
    const params = [];

    if (userId) {
      query += ' AND a.user_id = ?';
      params.push(userId);
    }
    if (action) {
      query += ' AND a.action = ?';
      params.push(action);
    }
    if (resource) {
      query += ' AND a.resource = ?';
      params.push(resource);
    }
    if (status) {
      query += ' AND a.status = ?';
      params.push(status);
    }
    if (startDate) {
      query += ' AND a.created_at >= ?';
      params.push(startDate);
    }
    if (endDate) {
      query += ' AND a.created_at <= ?';
      params.push(endDate);
    }

    query += ' ORDER BY a.created_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const stmt = this.db.prepare(query);
    const logs = stmt.all(...params);

    // Count total
    let countQuery = 'SELECT COUNT(*) as total FROM audit_logs WHERE 1=1';
    const countParams = [];
    
    if (userId) {
      countQuery += ' AND user_id = ?';
      countParams.push(userId);
    }
    if (action) {
      countQuery += ' AND action = ?';
      countParams.push(action);
    }
    if (resource) {
      countQuery += ' AND resource = ?';
      countParams.push(resource);
    }
    if (status) {
      countQuery += ' AND status = ?';
      countParams.push(status);
    }

    const countStmt = this.db.prepare(countQuery);
    const { total } = countStmt.get(...countParams);

    return {
      logs,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    };
  }

  /**
   * Get audit summary
   */
  getAuditSummary() {
    const stmt = this.db.prepare('SELECT * FROM v_audit_summary LIMIT 30');
    return stmt.all();
  }

  // ============================================================
  // PERMISSIONS
  // ============================================================

  /**
   * Check if user has permission
   */
  hasPermission(role, resource, action) {
    const stmt = this.db.prepare(`
      SELECT COUNT(*) as count FROM permissions
      WHERE role = ? AND resource = ? AND action = ?
    `);
    const { count } = stmt.get(role, resource, action);
    return count > 0;
  }

  /**
   * Get all permissions for role
   */
  getRolePermissions(role) {
    const stmt = this.db.prepare(`
      SELECT resource, action FROM permissions WHERE role = ?
    `);
    return stmt.all(role);
  }

  /**
   * List all permissions
   */
  listAllPermissions() {
    const stmt = this.db.prepare('SELECT * FROM permissions ORDER BY role, resource, action');
    return stmt.all();
  }

  /**
   * Grant permission
   */
  grantPermission(role, resource, action) {
    const stmt = this.db.prepare(`
      INSERT OR IGNORE INTO permissions (role, resource, action)
      VALUES (?, ?, ?)
    `);
    const result = stmt.run(role, resource, action);
    return result.changes > 0;
  }

  /**
   * Revoke permission
   */
  revokePermission(role, resource, action) {
    const stmt = this.db.prepare(`
      DELETE FROM permissions WHERE role = ? AND resource = ? AND action = ?
    `);
    const result = stmt.run(role, resource, action);
    return result.changes > 0;
  }

  // ============================================================
  // STATISTICS & VIEWS
  // ============================================================

  /**
   * Get user statistics
   */
  getUserStats() {
    const stmt = this.db.prepare('SELECT * FROM v_user_stats');
    return stmt.all();
  }

  /**
   * Get dashboard statistics
   */
  getDashboardStats() {
    const totalUsers = this.db.prepare('SELECT COUNT(*) as count FROM users').get().count;
    const activeUsers = this.db.prepare('SELECT COUNT(*) as count FROM users WHERE is_active = 1').get().count;
    const activeSessions = this.db.prepare('SELECT COUNT(*) as count FROM sessions WHERE is_active = 1 AND expires_at > datetime(\'now\')').get().count;
    const totalAuditLogs = this.db.prepare('SELECT COUNT(*) as count FROM audit_logs').get().count;
    const todayActions = this.db.prepare('SELECT COUNT(*) as count FROM audit_logs WHERE DATE(created_at) = DATE(\'now\')').get().count;

    return {
      totalUsers,
      activeUsers,
      activeSessions,
      totalAuditLogs,
      todayActions
    };
  }

  /**
   * Close database connection
   */
  close() {
    this.db.close();
  }
}

// Export singleton instance
const rbacDB = new RBACDatabase();
export default rbacDB;
