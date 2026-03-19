import jwt from 'jsonwebtoken';
import logger from '../config/logger.js';

// [SECURITY] P1.2 — Plus de fallback hardcodé. JWT_SECRET est validé
// au démarrage dans server.js (process.exit si absent ou < 32 chars).
const JWT_SECRET = process.env.JWT_SECRET;

// [SECURITY] P1 — Durée du token réduite pour un outil admin
// Production: 1h par défaut, configurable via TOKEN_EXPIRY
const TOKEN_EXPIRY = process.env.TOKEN_EXPIRY || '1h';
const REFRESH_EXPIRY = process.env.REFRESH_EXPIRY || '7d';

export function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      logger.warn('[AUTH] Token invalide/expiré', { 
        ip: req.ip, 
        path: req.path,
        error: err.message 
      });
      return res.status(403).json({ error: 'Invalid or expired token' });
    }
    
    req.user = user;
    next();
  });
}

export function generateToken(user) {
  return jwt.sign(
    { 
      username: user.username,
      id: user.id,
      role: user.role 
    },
    JWT_SECRET,
    { expiresIn: TOKEN_EXPIRY }
  );
}

export function generateRefreshToken(user) {
  return jwt.sign(
    { 
      username: user.username,
      id: user.id,
      role: user.role,
      type: 'refresh'
    },
    JWT_SECRET,
    { expiresIn: REFRESH_EXPIRY }
  );
}

export function requireAdmin(req, res, next) {
  if (req.user.role !== 'admin') {
    logger.warn('[AUTH] Accès admin refusé', { 
      user: req.user.username, 
      path: req.path 
    });
    return res.status(403).json({ 
      error: 'Admin access required',
      message: 'This endpoint requires administrator privileges' 
    });
  }
  next();
}

// Alias for backward compatibility
export const verifyToken = authenticateToken;

