import express from 'express';
import SystemMonitor from '../services/system-monitor.js';
import AlertManager from '../services/alert-manager.js';
import { db } from '../services/database-sqlite.js';
import { cacheMiddleware } from '../middleware/cache.js';

const router = express.Router();

// Créer une instance de SystemMonitor avec la database
const systemMonitor = new SystemMonitor(db);

// GET /api/monitoring/metrics - Get current system metrics
// Cache: 10s (métriques temps réel changent rapidement)
router.get('/metrics', cacheMiddleware(10), async (req, res) => {
  try {
    const metrics = await systemMonitor.collectMetrics();
    
    // Get alert configuration for threshold checking
    const alertConfig = AlertManager.getAlertConfig();
    const alerts = systemMonitor.checkAlerts({
      cpu: alertConfig.threshold_cpu,
      memory: alertConfig.threshold_memory,
      disk: alertConfig.threshold_disk
    });

    res.json({
      success: true,
      data: {
        metrics,
        alerts: alerts.length > 0 ? alerts : null,
        timestamp: Date.now()
      }
    });
  } catch (error) {
    console.error('Error collecting metrics:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to collect system metrics',
      message: error.message
    });
  }
});

// GET /api/monitoring/metrics/history - Get historical metrics
// Cache: 60s (données historiques changent moins souvent)
router.get('/metrics/history', cacheMiddleware(60), async (req, res) => {
  try {
    const { period = '24h', limit = 100 } = req.query;
    
    // Calculate time range based on period
    let hoursBack = 24;
    if (period === '7d') hoursBack = 168;
    else if (period === '30d') hoursBack = 720;
    
    const since = Date.now() - (hoursBack * 3600 * 1000);
    const history = systemMonitor.getMetricsHistory(since, parseInt(limit));

    res.json({
      success: true,
      data: {
        period,
        count: history.length,
        metrics: history
      }
    });
  } catch (error) {
    console.error('Error fetching metrics history:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch metrics history',
      message: error.message
    });
  }
});

// POST /api/monitoring/metrics/save - Save current metrics to history
router.post('/metrics/save', async (req, res) => {
  try {
    const metrics = await systemMonitor.collectMetrics();
    systemMonitor.saveMetrics(metrics);

    res.json({
      success: true,
      message: 'Metrics saved successfully',
      timestamp: Date.now()
    });
  } catch (error) {
    console.error('Error saving metrics:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to save metrics',
      message: error.message
    });
  }
});

// GET /api/monitoring/alerts/config - Get alert configuration
router.get('/alerts/config', async (req, res) => {
  try {
    const config = AlertManager.getAlertConfig();
    
    // Remove sensitive data before sending to client
    const safeConfig = { ...config };
    if (safeConfig.smtp_pass) {
      safeConfig.smtp_pass = '********';
    }
    if (safeConfig.telegram_bot_token) {
      safeConfig.telegram_bot_token = safeConfig.telegram_bot_token.substring(0, 10) + '...';
    }

    res.json({
      success: true,
      data: safeConfig
    });
  } catch (error) {
    console.error('Error fetching alert config:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch alert configuration',
      message: error.message
    });
  }
});

// POST /api/monitoring/alerts/config - Save alert configuration
router.post('/alerts/config', async (req, res) => {
  try {
    const config = req.body;
    
    // Validate required fields
    if (config.email_enabled && !config.email_to) {
      return res.status(400).json({
        success: false,
        error: 'Email address is required when email alerts are enabled'
      });
    }

    if (config.telegram_enabled && (!config.telegram_bot_token || !config.telegram_chat_id)) {
      return res.status(400).json({
        success: false,
        error: 'Telegram bot token and chat ID are required when Telegram alerts are enabled'
      });
    }

    AlertManager.saveAlertConfig(config);

    res.json({
      success: true,
      message: 'Alert configuration saved successfully'
    });
  } catch (error) {
    console.error('Error saving alert config:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to save alert configuration',
      message: error.message
    });
  }
});

// POST /api/monitoring/alerts/test/email - Test email configuration
router.post('/alerts/test/email', async (req, res) => {
  try {
    const config = req.body;
    const result = await AlertManager.testEmailConfig(config);

    if (result.success) {
      res.json({
        success: true,
        message: 'Test email sent successfully'
      });
    } else {
      res.status(400).json({
        success: false,
        error: 'Failed to send test email',
        message: result.error
      });
    }
  } catch (error) {
    console.error('Error testing email config:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to test email configuration',
      message: error.message
    });
  }
});

// POST /api/monitoring/alerts/test/telegram - Test Telegram configuration
router.post('/alerts/test/telegram', async (req, res) => {
  try {
    const config = req.body;
    const result = await AlertManager.testTelegramConfig(config);

    if (result.success) {
      res.json({
        success: true,
        message: 'Test message sent to Telegram successfully'
      });
    } else {
      res.status(400).json({
        success: false,
        error: 'Failed to send test Telegram message',
        message: result.error
      });
    }
  } catch (error) {
    console.error('Error testing Telegram config:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to test Telegram configuration',
      message: error.message
    });
  }
});

// GET /api/monitoring/alerts/history - Get alert history
router.get('/alerts/history', async (req, res) => {
  try {
    const { limit = 50, type, level } = req.query;
    
    const filters = {};
    if (type) filters.type = type;
    if (level) filters.level = level;

    const history = AlertManager.getAlertHistory(filters, parseInt(limit));

    res.json({
      success: true,
      data: {
        count: history.length,
        alerts: history
      }
    });
  } catch (error) {
    console.error('Error fetching alert history:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch alert history',
      message: error.message
    });
  }
});

// DELETE /api/monitoring/alerts/history - Clear alert history
router.delete('/alerts/history', async (req, res) => {
  try {
    const { before } = req.query;
    
    if (before) {
      AlertManager.clearAlertHistory(parseInt(before));
      res.json({
        success: true,
        message: `Alert history cleared before ${new Date(parseInt(before)).toISOString()}`
      });
    } else {
      AlertManager.clearAlertHistory();
      res.json({
        success: true,
        message: 'All alert history cleared'
      });
    }
  } catch (error) {
    console.error('Error clearing alert history:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to clear alert history',
      message: error.message
    });
  }
});


// Importer SSHExecutor pour monitoring distant
import SSHExecutor from "../services/ssh-executor.js";

// POST /api/monitoring/remote - Get remote server metrics via SSH
router.post("/remote", async (req, res) => {
  try {
    const { host, port, username, password, serverId } = req.body;
    
    if (!host || !username || !password) {
      return res.status(400).json({
        success: false,
        error: "Missing required fields: host, username, password"
      });
    }

    const sshExecutor = new SSHExecutor({
      host,
      port: port || 22,
      username,
      password
    });

    await sshExecutor.connect();

    const commands = {
      cpu: "top -bn1 | grep Cpu | head -1 | awk '{print 100 - $8}'",
      memory: "free | grep Mem | awk '{print ($3/$2) * 100.0}'",
      disk: "df -h / | awk 'NR==2 {print $5}' | tr -d %",
      diskTotal: "df -h / | awk 'NR==2 {print $2}'",
      diskUsed: "df -h / | awk 'NR==2 {print $3}'",
      diskAvailable: "df -h / | awk 'NR==2 {print $4}'",
      networkRx: "cat /sys/class/net/eth0/statistics/rx_bytes 2>/dev/null || cat /sys/class/net/ens3/statistics/rx_bytes 2>/dev/null || echo 0",
      networkTx: "cat /sys/class/net/eth0/statistics/tx_bytes 2>/dev/null || cat /sys/class/net/ens3/statistics/tx_bytes 2>/dev/null || echo 0",
      uptime: "cat /proc/uptime | awk '{print $1}'",
      loadAvg: "cat /proc/loadavg | awk '{print $1, $2, $3}'",
      connections: "ss -tan | grep ESTAB | wc -l",
      processes: "ps aux | wc -l"
    };

    const results = {};
    for (const [key, command] of Object.entries(commands)) {
      try {
        const result = await sshExecutor.executeCommand(command);
        results[key] = result.stdout.trim();
      } catch (error) {
        console.error(`Error executing ${key}:`, error.message);
        results[key] = "0";
      }
    }

    await sshExecutor.disconnect();

    const metrics = {
      cpu: parseFloat(results.cpu) || 0,
      memory: parseFloat(results.memory) || 0,
      disk: parseFloat(results.disk) || 0,
      diskTotal: results.diskTotal || "0G",
      diskUsed: results.diskUsed || "0G",
      diskAvailable: results.diskAvailable || "0G",
      networkRx: parseInt(results.networkRx) || 0,
      networkTx: parseInt(results.networkTx) || 0,
      uptime: parseFloat(results.uptime) || 0,
      loadAvg: results.loadAvg || "0 0 0",
      connections: parseInt(results.connections) || 0,
      processes: parseInt(results.processes) || 0,
      timestamp: Date.now(),
      server: {
        id: serverId || null,
        host,
        port: port || 22,
        username,
        name: `${username}@${host}`
      }
    };

    res.json({
      success: true,
      data: { metrics, timestamp: Date.now() }
    });

  } catch (error) {
    console.error("Error collecting remote metrics:", error);
    res.status(500).json({
      success: false,
      error: "Failed to collect remote system metrics",
      message: error.message
    });
  }
});


export default router;
