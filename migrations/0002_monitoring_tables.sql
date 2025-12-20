-- Migration: Add monitoring tables
-- Date: 2025-11-23
-- Description: Creates tables for system metrics, alert configuration, and alert history

-- Table: metrics_history
-- Stores time-series system metrics data
CREATE TABLE IF NOT EXISTS metrics_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp INTEGER NOT NULL,
  cpu_usage REAL,
  cpu_cores INTEGER,
  cpu_temperature REAL,
  memory_used INTEGER,
  memory_total INTEGER,
  memory_percent REAL,
  disk_used INTEGER,
  disk_total INTEGER,
  disk_percent REAL,
  network_rx INTEGER,
  network_tx INTEGER,
  network_rx_sec INTEGER,
  network_tx_sec INTEGER,
  docker_containers INTEGER,
  docker_running INTEGER,
  docker_images INTEGER,
  uptime INTEGER,
  load_avg_1 REAL,
  load_avg_5 REAL,
  load_avg_15 REAL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Table: alert_config
-- Stores alert notification configuration
CREATE TABLE IF NOT EXISTS alert_config (
  id INTEGER PRIMARY KEY DEFAULT 1,
  email_enabled INTEGER DEFAULT 0,
  email_to TEXT,
  smtp_host TEXT,
  smtp_port INTEGER DEFAULT 587,
  smtp_secure INTEGER DEFAULT 0,
  smtp_user TEXT,
  smtp_pass TEXT,
  smtp_from TEXT,
  telegram_enabled INTEGER DEFAULT 0,
  telegram_bot_token TEXT,
  telegram_chat_id TEXT,
  threshold_cpu REAL DEFAULT 80.0,
  threshold_memory REAL DEFAULT 85.0,
  threshold_disk REAL DEFAULT 90.0,
  check_interval INTEGER DEFAULT 30,
  server_name TEXT DEFAULT 'VPS Server',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Table: alert_history
-- Stores historical alerts
CREATE TABLE IF NOT EXISTS alert_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL,
  level TEXT NOT NULL,
  message TEXT NOT NULL,
  value REAL,
  threshold REAL,
  details TEXT,
  sent_via TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance optimization
CREATE INDEX IF NOT EXISTS idx_metrics_timestamp ON metrics_history(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_metrics_created ON metrics_history(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_alerts_type ON alert_history(type);
CREATE INDEX IF NOT EXISTS idx_alerts_level ON alert_history(level);
CREATE INDEX IF NOT EXISTS idx_alerts_created ON alert_history(created_at DESC);

-- Insert default alert configuration
INSERT OR IGNORE INTO alert_config (id, server_name, threshold_cpu, threshold_memory, threshold_disk)
VALUES (1, 'VPS DevOps Server', 80.0, 85.0, 90.0);
