/**
 * Security Logger Middleware
 * Logs all security-related events for audit purposes
 */

import fs from 'fs';
import path from 'path';

const LOG_DIR = '/opt/vps-devops-agent/logs';
const SECURITY_LOG = path.join(LOG_DIR, 'security-audit.log');
const FAILED_AUTH_LOG = path.join(LOG_DIR, 'failed-auth.log');

// Ensure log directory exists
if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

/**
 * Format log entry with timestamp
 */
function formatLogEntry(level, category, message, metadata = {}) {
  const timestamp = new Date().toISOString();
  const entry = {
    timestamp,
    level,
    category,
    message,
    ...metadata
  };
  return JSON.stringify(entry) + '\n';
}

/**
 * Write to log file
 */
function writeToLog(filePath, entry) {
  try {
    fs.appendFileSync(filePath, entry, 'utf8');
  } catch (error) {
    console.error('Failed to write to log:', error);
  }
}

/**
 * Log security event
 */
export function logSecurityEvent(category, message, metadata = {}) {
  const entry = formatLogEntry('SECURITY', category, message, metadata);
  writeToLog(SECURITY_LOG, entry);
  
  // Also log to console in development
  if (process.env.NODE_ENV !== 'production') {
    console.log('🔒 SECURITY:', category, message, metadata);
  }
}

/**
 * Log failed authentication attempt
 */
export function logFailedAuth(username, ip, reason, metadata = {}) {
  const entry = formatLogEntry('WARN', 'FAILED_AUTH', 'Failed authentication attempt', {
    username,
    ip,
    reason,
    ...metadata
  });
  
  writeToLog(FAILED_AUTH_LOG, entry);
  writeToLog(SECURITY_LOG, entry);
  
  console.warn('⚠️  FAILED AUTH:', username, 'from', ip, '-', reason);
}

/**
 * Log successful authentication
 */
export function logSuccessAuth(username, ip, userId) {
  logSecurityEvent('SUCCESS_AUTH', 'Successful authentication', {
    username,
    ip,
    userId
  });
}

/**
 * Log validation failure (possible attack)
 */
export function logValidationFailure(route, ip, errors, body = {}) {
  // Remove sensitive data
  const sanitizedBody = { ...body };
  delete sanitizedBody.password;
  delete sanitizedBody.apiKey;
  delete sanitizedBody.apiSecret;
  
  logSecurityEvent('VALIDATION_FAILED', 'Input validation failed', {
    route,
    ip,
    errors: errors.map(e => ({ field: e.field, type: e.type })),
    attemptedData: sanitizedBody
  });
}

/**
 * Log sensitive action
 */
export function logSensitiveAction(action, userId, username, ip, details = {}) {
  logSecurityEvent('SENSITIVE_ACTION', action, {
    userId,
    username,
    ip,
    ...details
  });
}

/**
 * Log potential attack
 */
export function logPotentialAttack(attackType, ip, route, details = {}) {
  const entry = formatLogEntry('CRITICAL', 'POTENTIAL_ATTACK', attackType, {
    ip,
    route,
    ...details
  });
  
  writeToLog(SECURITY_LOG, entry);
  console.error('🚨 POTENTIAL ATTACK:', attackType, 'from', ip, 'on', route);
}

/**
 * Middleware to log validation failures
 */
export function validationFailureLogger(req, res, next) {
  const originalJson = res.json.bind(res);
  
  res.json = function(data) {
    // Check if this is a validation error
    if (res.statusCode === 400 && data.error === 'Validation échouée') {
      const ip = req.ip || req.connection.remoteAddress;
      logValidationFailure(req.path, ip, data.details || [], req.body);
      
      // Check for potential SQL injection or XSS
      const bodyStr = JSON.stringify(req.body).toLowerCase();
      if (bodyStr.includes('select') || bodyStr.includes('union') || bodyStr.includes('drop')) {
        logPotentialAttack('SQL_INJECTION_ATTEMPT', ip, req.path, {
          body: req.body
        });
      }
      if (bodyStr.includes('<script>') || bodyStr.includes('onerror=')) {
        logPotentialAttack('XSS_ATTEMPT', ip, req.path, {
          body: req.body
        });
      }
    }
    
    return originalJson(data);
  };
  
  next();
}

/**
 * Get recent security events
 */
export function getRecentSecurityEvents(limit = 100) {
  try {
    const content = fs.readFileSync(SECURITY_LOG, 'utf8');
    const lines = content.trim().split('\n');
    const events = lines
      .slice(-limit)
      .map(line => {
        try {
          return JSON.parse(line);
        } catch {
          return null;
        }
      })
      .filter(e => e !== null);
    
    return events;
  } catch (error) {
    return [];
  }
}

/**
 * Get failed auth statistics
 */
export function getFailedAuthStats() {
  try {
    const content = fs.readFileSync(FAILED_AUTH_LOG, 'utf8');
    const lines = content.trim().split('\n');
    const events = lines.map(line => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    }).filter(e => e !== null);
    
    // Count by IP
    const byIP = {};
    const byUsername = {};
    
    events.forEach(event => {
      byIP[event.ip] = (byIP[event.ip] || 0) + 1;
      byUsername[event.username] = (byUsername[event.username] || 0) + 1;
    });
    
    return {
      total: events.length,
      byIP,
      byUsername,
      recent: events.slice(-10)
    };
  } catch (error) {
    return { total: 0, byIP: {}, byUsername: {}, recent: [] };
  }
}

export default {
  logSecurityEvent,
  logFailedAuth,
  logSuccessAuth,
  logValidationFailure,
  logSensitiveAction,
  logPotentialAttack,
  validationFailureLogger,
  getRecentSecurityEvents,
  getFailedAuthStats
};
