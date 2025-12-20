/**
 * 🛡️ RATE LIMITER MIDDLEWARE - VERSION SIMPLIFIÉE ET PROFESSIONNELLE
 * Protection contre les attaques brute-force et abus d'API
 */

import rateLimit from 'express-rate-limit';

/**
 * Rate limiter pour les tentatives de login
 * Limite stricte pour éviter les attaques brute-force
 */
export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // Maximum 10 tentatives par fenêtre (augmenté pour test)
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Trop de tentatives de connexion. Veuillez réessayer dans 15 minutes.',
    retryAfter: '15 minutes'
  },
  handler: (req, res) => {
    res.status(429).json({
      error: 'Trop de tentatives de connexion',
      message: 'Vous avez dépassé le nombre maximum de tentatives en 15 minutes.',
      retryAfter: Math.ceil((req.rateLimit.resetTime - Date.now()) / 1000 / 60) + ' minutes'
    });
  }
});

/**
 * Rate limiter général pour toutes les routes API
 */
export const apiLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 100, // Maximum 100 requêtes par minute
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Trop de requêtes. Veuillez ralentir.',
    retryAfter: '1 minute'
  }
});

/**
 * Rate limiter strict pour actions sensibles
 */
export const sensitiveActionLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 heure
  max: 20, // Maximum 20 actions sensibles par heure
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Limite d\'actions sensibles atteinte',
    retryAfter: '1 heure'
  }
});

/**
 * Rate limiter pour création de comptes
 */
export const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 heure
  max: 5, // Maximum 5 inscriptions par heure par IP
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Limite d\'inscriptions atteinte',
    retryAfter: '1 heure'
  }
});

export default {
  loginLimiter,
  apiLimiter,
  sensitiveActionLimiter,
  registerLimiter
};
