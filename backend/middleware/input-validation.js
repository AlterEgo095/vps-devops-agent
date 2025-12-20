/**
 * Input Validation Middleware
 * Utilise express-validator pour valider et sanitizer les entrées
 */

import { body, param, query, validationResult } from 'express-validator';

/**
 * Middleware pour exécuter les validations et retourner les erreurs
 */
export const validate = (validations) => {
  return async (req, res, next) => {
    // Exécuter toutes les validations
    await Promise.all(validations.map(validation => validation.run(req)));
    
    // Vérifier s'il y a des erreurs
    const errors = validationResult(req);
    if (errors.isEmpty()) {
      return next();
    }
    
    // Retourner les erreurs de validation
    return res.status(400).json({ 
      error: 'Validation failed', 
      details: errors.array().map(err => ({
        field: err.path,
        message: err.msg,
        value: err.value
      }))
    });
  };
};

/**
 * Validateurs réutilisables pour les routes communes
 */
export const validators = {
  // Auth
  username: body('username')
    .trim()
    .isLength({ min: 3, max: 30 }).withMessage('Username must be 3-30 characters')
    .isAlphanumeric().withMessage('Username must be alphanumeric'),
  
  password: body('password')
    .isLength({ min: 8 }).withMessage('Password must be at least 8 characters')
    .matches(/\d/).withMessage('Password must contain at least one number')
    .matches(/[a-z]/).withMessage('Password must contain at least one lowercase letter'),
  
  email: body('email')
    .trim()
    .isEmail().withMessage('Must be a valid email')
    .normalizeEmail(),
  
  // Servers
  serverId: param('id')
    .trim()
    .notEmpty().withMessage('Server ID is required')
    .isString().withMessage('Server ID must be a string'),
  
  serverName: body('name')
    .trim()
    .isLength({ min: 1, max: 100 }).withMessage('Server name must be 1-100 characters')
    .matches(/^[a-zA-Z0-9-_.]+$/).withMessage('Server name contains invalid characters'),
  
  serverHost: body('host')
    .trim()
    .notEmpty().withMessage('Host is required')
    .custom((value) => {
      // Validate IP or hostname
      const ipRegex = /^(\d{1,3}\.){3}\d{1,3}$/;
      const hostnameRegex = /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
      
      if (!ipRegex.test(value) && !hostnameRegex.test(value)) {
        throw new Error('Must be a valid IP address or hostname');
      }
      return true;
    }),
  
  serverPort: body('port')
    .optional()
    .isInt({ min: 1, max: 65535 }).withMessage('Port must be between 1 and 65535')
    .toInt(),
  
  // Commands
  command: body('command')
    .trim()
    .notEmpty().withMessage('Command is required')
    .isLength({ max: 5000 }).withMessage('Command too long (max 5000 characters)'),
  
  // Paths
  path: body('path')
    .trim()
    .notEmpty().withMessage('Path is required')
    .custom((value) => {
      // Interdire les path traversal
      if (value.includes('..') || value.includes('~')) {
        throw new Error('Path traversal not allowed');
      }
      return true;
    }),
  
  // Generic
  positiveInt: (field) => body(field)
    .optional()
    .isInt({ min: 0 }).withMessage(`${field} must be a positive integer`)
    .toInt(),
  
  boolean: (field) => body(field)
    .optional()
    .isBoolean().withMessage(`${field} must be a boolean`)
    .toBoolean(),
  
  // Query params
  queryLimit: query('limit')
    .optional()
    .isInt({ min: 1, max: 1000 }).withMessage('Limit must be between 1 and 1000')
    .toInt(),
  
  queryOffset: query('offset')
    .optional()
    .isInt({ min: 0 }).withMessage('Offset must be >= 0')
    .toInt(),
  
  querySearch: query('search')
    .optional()
    .trim()
    .isLength({ max: 200 }).withMessage('Search query too long (max 200 characters)')
    .escape() // Sanitize HTML
};

/**
 * Validation schemas pour routes spécifiques
 */
export const schemas = {
  // Auth
  login: [
    validators.username,
    body('password').notEmpty().withMessage('Password is required')
  ],
  
  register: [
    validators.username,
    validators.email,
    validators.password
  ],
  
  changePassword: [
    body('oldPassword').notEmpty().withMessage('Old password is required'),
    validators.password.withMessage('New password is invalid')
  ],
  
  // Servers
  createServer: [
    validators.serverName,
    validators.serverHost,
    validators.serverPort,
    body('username').trim().notEmpty().withMessage('SSH username is required')
  ],
  
  updateServer: [
    validators.serverId,
    validators.serverName.optional(),
    validators.serverHost.optional(),
    validators.serverPort,
    body('username').optional().trim().notEmpty()
  ],
  
  // Commands
  executeCommand: [
    validators.command,
    body('serverId').optional().trim().notEmpty()
  ],
  
  // Files
  readFile: [
    validators.path,
    validators.serverId.optional()
  ],
  
  writeFile: [
    validators.path,
    body('content').notEmpty().withMessage('Content is required')
      .isLength({ max: 10000000 }).withMessage('Content too large (max 10MB)'),
    validators.serverId.optional()
  ],
  
  // Docker
  createContainer: [
    body('image').trim().notEmpty().withMessage('Image is required')
      .matches(/^[a-z0-9_\-.:\/]+$/i).withMessage('Invalid image name'),
    body('name').optional().trim()
      .matches(/^[a-zA-Z0-9_\-]+$/).withMessage('Invalid container name')
  ]
};

export default { validate, validators, schemas };
