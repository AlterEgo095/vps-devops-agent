import jwt from 'jsonwebtoken';

// [SECURITY] P1.2 — Plus de fallback hardcodé. JWT_SECRET est validé
// au démarrage dans server.js (process.exit si absent ou < 32 chars).
const JWT_SECRET = process.env.JWT_SECRET;

export function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
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
    { expiresIn: '7d' }
  );
}

export function requireAdmin(req, res, next) {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ 
      error: 'Admin access required',
      message: 'This endpoint requires administrator privileges' 
    });
  }
  next();
}

// Alias for backward compatibility
export const verifyToken = authenticateToken;

