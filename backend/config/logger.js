/**
 * 📊 LOGGER PROFESSIONNEL - Winston Configuration
 * 
 * Fonctionnalités:
 * - Rotation quotidienne des logs
 * - Niveaux: error, warn, info, http, debug
 * - Format JSON structuré pour parsing
 * - Timestamps ISO 8601
 * - Métadonnées contextuelles
 * - Console colorée en développement
 * - Fichiers séparés par niveau
 */

import winston from 'winston';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration des formats
const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.splat(),
  winston.format.json()
);

const consoleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({ format: 'HH:mm:ss' }),
  winston.format.printf(({ timestamp, level, message, service, ...meta }) => {
    const metaStr = Object.keys(meta).length ? JSON.stringify(meta) : '';
    return `${timestamp} [${level}] ${service || 'app'}: ${message} ${metaStr}`;
  })
);

// Création du logger
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: logFormat,
  defaultMeta: { 
    service: 'vps-devops-agent',
    environment: process.env.NODE_ENV || 'development'
  },
  transports: [
    // Logs erreurs - Fichier séparé
    new winston.transports.File({
      filename: path.join(__dirname, '../../logs/error.log'),
      level: 'error',
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    }),

    // Logs warning - Fichier séparé
    new winston.transports.File({
      filename: path.join(__dirname, '../../logs/warn.log'),
      level: 'warn',
      maxsize: 5242880, // 5MB
      maxFiles: 3,
    }),

    // Logs combinés - Tous les niveaux
    new winston.transports.File({
      filename: path.join(__dirname, '../../logs/combined.log'),
      maxsize: 10485760, // 10MB
      maxFiles: 7,
    }),

    // Logs HTTP - Requêtes API
    new winston.transports.File({
      filename: path.join(__dirname, '../../logs/http.log'),
      level: 'http',
      maxsize: 10485760, // 10MB
      maxFiles: 3,
    }),
  ],
  // Ne pas quitter sur erreur
  exitOnError: false,
});

// Console en développement
if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: consoleFormat,
    level: 'debug'
  }));
}

// Helper methods pour logging structuré
logger.api = (method, path, statusCode, duration, meta = {}) => {
  logger.http('API Request', {
    method,
    path,
    statusCode,
    duration: `${duration}ms`,
    ...meta
  });
};

logger.security = (event, details = {}) => {
  logger.warn('Security Event', {
    event,
    ...details,
    timestamp: Date.now()
  });
};

logger.performance = (metric, value, unit = 'ms', meta = {}) => {
  logger.info('Performance Metric', {
    metric,
    value,
    unit,
    ...meta
  });
};

logger.database = (operation, table, duration, meta = {}) => {
  logger.debug('Database Operation', {
    operation,
    table,
    duration: `${duration}ms`,
    ...meta
  });
};

// Stream pour Morgan (HTTP logging middleware)
logger.stream = {
  write: (message) => {
    logger.http(message.trim());
  },
};

export default logger;
