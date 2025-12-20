import { EventEmitter } from 'events';

/**
 * Log Manager - Centralized logging with WebSocket support
 * Manages system logs and broadcasts them to connected clients
 */
class LogManager extends EventEmitter {
  constructor(maxLogs = 1000) {
    super();
    this.maxLogs = maxLogs;
    this.logs = [];
    this.logId = 0;
  }

  /**
   * Add a log entry
   * @param {string} level - Log level: info, success, warning, error
   * @param {string} message - Log message
   * @param {Object} metadata - Additional metadata
   */
  log(level, message, metadata = {}) {
    const logEntry = {
      id: this.logId++,
      level,
      message,
      metadata,
      timestamp: new Date().toISOString()
    };

    // Add to internal logs array
    this.logs.push(logEntry);

    // Keep only last maxLogs entries
    if (this.logs.length > this.maxLogs) {
      this.logs.shift();
    }

    // Emit event for WebSocket broadcast
    this.emit('log', logEntry);

    // Also console.log for debugging
    const icon = {
      info: 'ℹ️',
      success: '✅',
      warning: '⚠️',
      error: '❌'
    }[level] || '📝';
    console.log(`${icon} [${level.toUpperCase()}] ${message}`);

    return logEntry;
  }

  /**
   * Convenience methods
   */
  info(message, metadata) {
    return this.log('info', message, metadata);
  }

  success(message, metadata) {
    return this.log('success', message, metadata);
  }

  warning(message, metadata) {
    return this.log('warning', message, metadata);
  }

  error(message, metadata) {
    return this.log('error', message, metadata);
  }

  /**
   * Get recent logs
   * @param {number} limit - Maximum number of logs to return
   * @param {string} level - Filter by level (optional)
   */
  getLogs(limit = 100, level = null) {
    let filteredLogs = this.logs;
    
    if (level) {
      filteredLogs = this.logs.filter(log => log.level === level);
    }

    return filteredLogs.slice(-limit).reverse();
  }

  /**
   * Clear all logs
   */
  clearLogs() {
    this.logs = [];
    this.logId = 0;
    this.emit('logsCleared');
  }

  /**
   * Get log statistics
   */
  getStats() {
    const stats = {
      total: this.logs.length,
      byLevel: {}
    };

    this.logs.forEach(log => {
      stats.byLevel[log.level] = (stats.byLevel[log.level] || 0) + 1;
    });

    return stats;
  }
}

// Singleton instance
const logManager = new LogManager(1000);

export default logManager;
