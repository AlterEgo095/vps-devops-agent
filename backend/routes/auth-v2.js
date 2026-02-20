/**
 * Authentication routes for RBAC system
 */

import express from 'express';
import jwt from 'jsonwebtoken';
import rbacDB from '../services/rbac-database.js';
import logManager from '../services/logManager.js';

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET || JWT_SECRET.length < 32) {
  throw new Error('FATAL: JWT_SECRET environment variable must be set and be at least 32 characters long');
}

/**
 * POST /api/auth/login
 * Login with username/password and get JWT token
 */
router.post('/login', async (req, res) => {
  const startTime = Date.now();
  const ipAddress = req.ip;
  const userAgent = req.get('user-agent');

  try {
    const { username, password } = req.body;

    if (!username || !password) {
      logManager.log('warn', 'Login attempt without username or password', { ipAddress });
      return res.status(400).json({ 
        success: false,
        error: 'Username and password required' 
      });
    }

    // Verify credentials with RBAC database
    const user = await rbacDB.verifyPassword(username, password);

    if (!user) {
      // Create audit log for failed login
      rbacDB.createAuditLog({
        userId: null,
        action: 'login',
        resource: 'auth',
        resourceId: null,
        details: { username, reason: 'Invalid credentials' },
        ipAddress,
        userAgent,
        status: 'failure',
        errorMessage: 'Invalid username or password',
        durationMs: Date.now() - startTime
      });

      logManager.log('warn', `Failed login attempt for username: ${username}`, { ipAddress });
      
      return res.status(401).json({ 
        success: false,
        error: 'Invalid credentials' 
      });
    }

    // Check if user is active
    if (!user.is_active) {
      rbacDB.createAuditLog({
        userId: user.id,
        action: 'login',
        resource: 'auth',
        resourceId: null,
        details: { username, reason: 'Account inactive' },
        ipAddress,
        userAgent,
        status: 'failure',
        errorMessage: 'Account is inactive',
        durationMs: Date.now() - startTime
      });

      logManager.log('warn', `Login attempt for inactive user: ${username}`, { ipAddress });
      
      return res.status(401).json({ 
        success: false,
        error: 'Account inactive' 
      });
    }

    // Generate JWT token
    const token = jwt.sign(
      { 
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role 
      },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    // Create session in database
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
    const session = rbacDB.createSession({
      userId: user.id,
      token,
      ipAddress,
      userAgent,
      expiresAt
    });

    // Update last login timestamp
    rbacDB.updateUser(user.id, {
      last_login: new Date().toISOString()
    });

    // Create audit log for successful login
    rbacDB.createAuditLog({
      userId: user.id,
      action: 'login',
      resource: 'auth',
      resourceId: null,
      details: { username },
      ipAddress,
      userAgent,
      status: 'success',
      durationMs: Date.now() - startTime
    });

    logManager.log('info', `Successful login for user: ${username} (${user.role})`, { userId: user.id, ipAddress });

    res.json({
      success: true,
      token,
      expiresIn: '24h',
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role
      },
      session: {
        id: session.id,
        expiresAt: session.expires_at
      }
    });

  } catch (error) {
    logManager.log('error', `Login error: ${error.message}`, { 
      error: error.stack,
      ipAddress 
    });
    
    res.status(500).json({ 
      success: false,
      error: 'Login failed' 
    });
  }
});

/**
 * POST /api/auth/logout
 * Logout and revoke current session
 */
router.post('/logout', async (req, res) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      return res.status(401).json({ 
        success: false,
        error: 'No token provided' 
      });
    }

    // Verify token
    const decoded = jwt.verify(token, JWT_SECRET);

    // Revoke session
    const session = rbacDB.getSessionByToken(token);
    if (session) {
      rbacDB.revokeSession(session.id);
    }

    // Create audit log
    rbacDB.createAuditLog({
      userId: decoded.id,
      action: 'logout',
      resource: 'auth',
      resourceId: null,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
      status: 'success'
    });

    logManager.log('info', `User logged out: ${decoded.username}`, { userId: decoded.id });

    res.json({
      success: true,
      message: 'Logged out successfully'
    });

  } catch (error) {
    logManager.log('error', `Logout error: ${error.message}`, { error: error.stack });
    
    res.status(500).json({ 
      success: false,
      error: 'Logout failed' 
    });
  }
});

/**
 * GET /api/auth/verify
 * Verify JWT token and get user info
 */
router.get('/verify', async (req, res) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      return res.status(401).json({ 
        success: false,
        valid: false,
        error: 'No token provided' 
      });
    }

    // Verify JWT
    const decoded = jwt.verify(token, JWT_SECRET);

    // Check session
    const session = rbacDB.getSessionByToken(token);
    if (!session || !session.is_active) {
      return res.status(401).json({ 
        success: false,
        valid: false,
        error: 'Session expired or revoked' 
      });
    }

    // Get fresh user data
    const user = rbacDB.getUserById(decoded.id);
    if (!user || !user.is_active) {
      return res.status(401).json({ 
        success: false,
        valid: false,
        error: 'User not found or inactive' 
      });
    }

    res.json({ 
      success: true,
      valid: true,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role
      }
    });

  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ 
        success: false,
        valid: false,
        error: 'Token expired' 
      });
    }

    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ 
        success: false,
        valid: false,
        error: 'Invalid token' 
      });
    }

    logManager.log('error', `Token verification error: ${error.message}`, { error: error.stack });
    
    res.status(500).json({ 
      success: false,
      valid: false,
      error: 'Verification failed' 
    });
  }
});

export default router;
