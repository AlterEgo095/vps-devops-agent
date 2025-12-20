/**
 * 📊 HTTP LOGGING MIDDLEWARE
 * 
 * Middleware pour logger automatiquement toutes les requêtes HTTP
 * avec métriques de performance
 */

import morgan from 'morgan';
import logger from '../config/logger.js';

// Custom token pour la durée de réponse
morgan.token('response-time-ms', (req, res) => {
  if (!req._startAt || !res._startAt) return '0';
  
  const ms = (res._startAt[0] - req._startAt[0]) * 1e3 +
             (res._startAt[1] - req._startAt[1]) * 1e-6;
  
  return ms.toFixed(2);
});

// Custom token pour l'IP réelle (derrière proxy)
morgan.token('real-ip', (req) => {
  return req.ip || req.connection.remoteAddress;
});

// Format personnalisé
const morganFormat = ':method :url :status :response-time-ms ms - :real-ip';

// Middleware Morgan avec Winston stream
export const httpLogger = morgan(morganFormat, {
  stream: logger.stream,
  skip: (req, res) => {
    // Skip health checks et métriques internes
    return req.url === '/api/health' || req.url.startsWith('/api/monitoring/metrics');
  }
});

// Middleware pour ajouter métadonnées à req
export const requestLogger = (req, res, next) => {
  const start = Date.now();
  
  // Intercepter res.json pour logger la réponse
  const originalJson = res.json;
  res.json = function(body) {
    const duration = Date.now() - start;
    
    // Logger selon le status code
    if (res.statusCode >= 500) {
      logger.error('API Error', {
        method: req.method,
        path: req.path,
        statusCode: res.statusCode,
        duration,
        ip: req.ip,
        error: body.error || body.message
      });
    } else if (res.statusCode >= 400) {
      logger.warn('API Client Error', {
        method: req.method,
        path: req.path,
        statusCode: res.statusCode,
        duration,
        ip: req.ip
      });
    } else if (duration > 1000) {
      // Logger les requêtes lentes (> 1s)
      logger.warn('Slow API Response', {
        method: req.method,
        path: req.path,
        statusCode: res.statusCode,
        duration,
        ip: req.ip
      });
    }
    
    return originalJson.call(this, body);
  };
  
  next();
};

export default { httpLogger, requestLogger };
