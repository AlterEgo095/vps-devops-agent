CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user', -- admin, user, readonly
  is_active BOOLEAN NOT NULL DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  last_login DATETIME,
  last_login_ip TEXT,
  CONSTRAINT check_role CHECK (role IN ('admin', 'user', 'readonly'))
);
CREATE TABLE sqlite_sequence(name,seq);
CREATE INDEX idx_users_username ON users(username);
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_users_active ON users(is_active);
CREATE TABLE sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  token_hash TEXT UNIQUE NOT NULL,
  ip_address TEXT,
  user_agent TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  expires_at DATETIME NOT NULL,
  last_activity DATETIME DEFAULT CURRENT_TIMESTAMP,
  is_active BOOLEAN NOT NULL DEFAULT 1,
  revoked_at DATETIME,
  revoked_by INTEGER, -- user_id qui a révoqué
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (revoked_by) REFERENCES users(id)
);
CREATE INDEX idx_sessions_user_id ON sessions(user_id);
CREATE INDEX idx_sessions_token_hash ON sessions(token_hash);
CREATE INDEX idx_sessions_active ON sessions(is_active);
CREATE INDEX idx_sessions_expires ON sessions(expires_at);
CREATE TABLE audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  action TEXT NOT NULL, -- login, logout, create, read, update, delete, execute
  resource TEXT NOT NULL, -- users, capabilities, sessions, projects, etc.
  resource_id TEXT,
  details TEXT, -- JSON avec détails complets
  ip_address TEXT,
  user_agent TEXT,
  status TEXT NOT NULL DEFAULT 'success', -- success, failure, error
  error_message TEXT,
  duration_ms INTEGER, -- Temps d'exécution
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT check_action CHECK (action IN ('login', 'logout', 'create', 'read', 'update', 'delete', 'execute', 'revoke', 'activate', 'deactivate')),
  CONSTRAINT check_status CHECK (status IN ('success', 'failure', 'error'))
);
CREATE INDEX idx_audit_user_id ON audit_logs(user_id);
CREATE INDEX idx_audit_action ON audit_logs(action);
CREATE INDEX idx_audit_resource ON audit_logs(resource);
CREATE INDEX idx_audit_status ON audit_logs(status);
CREATE INDEX idx_audit_created_at ON audit_logs(created_at);
CREATE TABLE permissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  role TEXT NOT NULL,
  resource TEXT NOT NULL, -- capabilities, users, projects, logs, sessions, audit, settings
  action TEXT NOT NULL, -- read, write, execute, delete, manage
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT check_role CHECK (role IN ('admin', 'user', 'readonly')),
  CONSTRAINT check_action CHECK (action IN ('read', 'write', 'execute', 'delete', 'manage')),
  UNIQUE(role, resource, action)
);
CREATE INDEX idx_permissions_role ON permissions(role);
CREATE INDEX idx_permissions_resource ON permissions(resource);
CREATE TRIGGER update_users_timestamp 
AFTER UPDATE ON users
BEGIN
  UPDATE users SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;
CREATE TRIGGER update_sessions_activity
AFTER UPDATE ON sessions
BEGIN
  UPDATE sessions SET last_activity = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;
CREATE VIEW v_active_sessions AS
SELECT 
  s.id,
  s.user_id,
  u.username,
  u.role,
  s.ip_address,
  s.created_at,
  s.last_activity,
  CAST((julianday('now') - julianday(s.last_activity)) * 24 * 60 AS INTEGER) as idle_minutes
FROM sessions s
JOIN users u ON s.user_id = u.id
WHERE s.is_active = 1 AND s.expires_at > datetime('now')
ORDER BY s.last_activity DESC
/* v_active_sessions(id,user_id,username,role,ip_address,created_at,last_activity,idle_minutes) */;
CREATE VIEW v_user_stats AS
SELECT 
  u.id,
  u.username,
  u.email,
  u.role,
  u.is_active,
  u.created_at,
  u.last_login,
  COUNT(DISTINCT s.id) as total_sessions,
  COUNT(DISTINCT CASE WHEN s.is_active = 1 THEN s.id END) as active_sessions,
  COUNT(DISTINCT a.id) as total_actions
FROM users u
LEFT JOIN sessions s ON u.id = s.user_id
LEFT JOIN audit_logs a ON u.id = a.user_id
GROUP BY u.id
/* v_user_stats(id,username,email,role,is_active,created_at,last_login,total_sessions,active_sessions,total_actions) */;
CREATE VIEW v_audit_summary AS
SELECT 
  DATE(created_at) as date,
  action,
  resource,
  status,
  COUNT(*) as count
FROM audit_logs
GROUP BY DATE(created_at), action, resource, status
ORDER BY date DESC, count DESC
/* v_audit_summary(date,"action",resource,status,count) */;
