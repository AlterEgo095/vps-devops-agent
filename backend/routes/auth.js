import express from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { generateToken } from '../middleware/auth.js';
import { getUserByUsername, updateUser } from '../services/database-sqlite.js';
import { loginLimiter, registerLimiter, sensitiveActionLimiter } from '../middleware/rate-limiter.js';
import { validateBody } from '../middleware/validate.js';
import { loginSchema, registerSchema, changePasswordSchema } from '../middleware/validation-schemas.js';
import { logFailedAuth, logSuccessAuth } from '../middleware/security-logger.js';

const router = express.Router();

// Login
router.post('/login', loginLimiter, validateBody(loginSchema), async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password required' });
    }

    // Get user from SQLite database
    const user = getUserByUsername(username);

    if (!user) {
      logFailedAuth(username, req.ip, 'User not found');
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    if (!user.is_active) {
      logFailedAuth(username, req.ip, 'Account inactive');
      return res.status(401).json({ error: 'Account inactive' });
    }

    // FIX: Utiliser 'password' au lieu de 'password_hash'
    // car la colonne dans la BDD s'appelle 'password'
    const passwordHash = user.password || user.password_hash;
    
    if (!passwordHash) {
      console.error('Authentication error: no password hash for user');
      return res.status(500).json({ error: 'Authentication error' });
    }

    const validPassword = await bcrypt.compare(password, passwordHash);
    
    if (!validPassword) {
      logFailedAuth(username, req.ip, 'Invalid password');
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Update last login
    try {
      updateUser(user.id, { last_login: new Date().toISOString() });
    } catch (updateError) {
      console.warn('⚠️ Failed to update last_login:', updateError.message);
      // Continue login even if update fails
    }

    const token = generateToken(user);
    logSuccessAuth(username, req.ip, user.id);

    res.json({
      success: true,
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role
      }
    });
  } catch (error) {
    console.error('Login error:', error.message);
    res.status(500).json({ error: 'Login failed' });
  }
});

// Vérifier token
router.get('/verify', (req, res) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ valid: false });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    res.json({ valid: true, user: decoded });
  } catch (error) {
    res.status(401).json({ valid: false });
  }
});

export default router;
