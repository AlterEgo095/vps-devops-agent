import express from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { generateToken } from '../middleware/auth.js';
import { getUserByUsername, updateUser } from '../services/database-sqlite.js';
import { loginLimiter, registerLimiter, sensitiveActionLimiter } from '../middleware/rate-limiter.js';
import { validateBody } from '../middleware/validate.js';
import { loginSchema, registerSchema, changePasswordSchema } from '../middleware/validation-schemas.js';
import { logFailedAuth, logSuccessAuth } from '../middleware/security-logger.js';
import logger from '../config/logger.js';

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
      // [SECURITY] P1.1 — Log structuré sans donnée sensible, via Winston uniquement
      logger.warn('Authentication failed: user not found', { username });
      logFailedAuth(username, req.ip, 'User not found');
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    if (!user.is_active) {
      // [SECURITY] P1.1 — Pas de console.log exposant l'état du compte
      logger.warn('Authentication failed: account inactive', { username });
      logFailedAuth(username, req.ip, 'Account inactive');
      return res.status(401).json({ error: 'Account inactive' });
    }

    // Support colonne 'password' (ancienne migration) et 'password_hash' (nouvelle)
    const passwordHash = user.password || user.password_hash;

    if (!passwordHash) {
      // [SECURITY] P1.1 — Pas de détail technique exposé en console
      logger.error('Authentication error: no password hash found', { userId: user.id });
      return res.status(500).json({ error: 'Authentication error' });
    }

    // [SECURITY] P1.1 — SUPPRIMÉ: console.log("Hash length"), console.log("Password length"),
    //             console.log("validation result") — ces informations sont exploitables
    const validPassword = await bcrypt.compare(password, passwordHash);

    if (!validPassword) {
      logFailedAuth(username, req.ip, 'Invalid password');
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Update last login
    try {
      updateUser(user.id, { last_login: new Date().toISOString() });
    } catch (updateError) {
      logger.warn('Failed to update last_login', { userId: user.id, error: updateError.message });
      // Continue login even if update fails
    }

    const token = generateToken(user);
    logSuccessAuth(username, req.ip, user.id);

    // [SECURITY] P1.1 — Log structuré Winston uniquement, pas de console.log
    logger.info('Login successful', { username, role: user.role });

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
    // [SECURITY] P1.1 — En production, pas de stack trace exposée dans la réponse HTTP
    logger.error('Login error', { error: error.message, stack: error.stack });
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
    // [SECURITY] P1.2 — JWT_SECRET validé au démarrage dans server.js, pas de fallback ici
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    res.json({ valid: true, user: decoded });
  } catch (error) {
    res.status(401).json({ valid: false });
  }
});

export default router;
