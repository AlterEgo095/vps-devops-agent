-- ============================================
-- Migration 0003: CI/CD Pipeline Tables
-- ============================================

-- Table: projects
-- Stocke les configurations de projets pour le CI/CD
CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  repo_url TEXT NOT NULL,
  branch_filter TEXT DEFAULT 'main',
  deployment_type TEXT DEFAULT 'pm2' CHECK(deployment_type IN ('pm2', 'docker')),
  build_command TEXT,
  test_command TEXT,
  start_command TEXT DEFAULT 'server.js',
  health_check_url TEXT,
  enabled INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Table: webhook_configs
-- Configuration des webhooks par projet
CREATE TABLE IF NOT EXISTS webhook_configs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL,
  provider TEXT NOT NULL CHECK(provider IN ('github', 'gitlab')),
  webhook_secret TEXT NOT NULL,
  enabled INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

-- Table: webhook_events
-- Historique de tous les webhooks reçus
CREATE TABLE IF NOT EXISTS webhook_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER,
  provider TEXT NOT NULL,
  event_type TEXT NOT NULL,
  payload TEXT NOT NULL,
  branch TEXT,
  commit_sha TEXT,
  author TEXT,
  message TEXT,
  triggered_deployment INTEGER DEFAULT 0,
  received_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL
);

-- Table: deployments
-- Enregistrement de chaque déploiement
CREATE TABLE IF NOT EXISTS deployments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL,
  commit_sha TEXT NOT NULL,
  branch TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'running', 'success', 'failed')),
  triggered_by TEXT DEFAULT 'webhook',
  webhook_event_id INTEGER,
  error_message TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  completed_at DATETIME,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (webhook_event_id) REFERENCES webhook_events(id) ON DELETE SET NULL
);

-- Table: build_logs
-- Logs détaillés de chaque étape de build
CREATE TABLE IF NOT EXISTS build_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  deployment_id INTEGER NOT NULL,
  step TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('running', 'success', 'failed', 'skipped')),
  message TEXT,
  output TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (deployment_id) REFERENCES deployments(id) ON DELETE CASCADE
);

-- Table: pipeline_jobs
-- Queue de jobs de déploiement
CREATE TABLE IF NOT EXISTS pipeline_jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL,
  webhook_event_id INTEGER,
  commit_sha TEXT NOT NULL,
  branch TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued' CHECK(status IN ('queued', 'running', 'completed', 'failed', 'cancelled')),
  deployment_id INTEGER,
  queued_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  started_at DATETIME,
  completed_at DATETIME,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (webhook_event_id) REFERENCES webhook_events(id) ON DELETE SET NULL,
  FOREIGN KEY (deployment_id) REFERENCES deployments(id) ON DELETE SET NULL
);

-- ============================================
-- INDEXES pour optimisation
-- ============================================

CREATE INDEX IF NOT EXISTS idx_webhook_events_project_id ON webhook_events(project_id);
CREATE INDEX IF NOT EXISTS idx_webhook_events_received_at ON webhook_events(received_at);
CREATE INDEX IF NOT EXISTS idx_webhook_events_provider ON webhook_events(provider);

CREATE INDEX IF NOT EXISTS idx_deployments_project_id ON deployments(project_id);
CREATE INDEX IF NOT EXISTS idx_deployments_status ON deployments(status);
CREATE INDEX IF NOT EXISTS idx_deployments_created_at ON deployments(created_at);

CREATE INDEX IF NOT EXISTS idx_build_logs_deployment_id ON build_logs(deployment_id);
CREATE INDEX IF NOT EXISTS idx_build_logs_step ON build_logs(step);

CREATE INDEX IF NOT EXISTS idx_pipeline_jobs_project_id ON pipeline_jobs(project_id);
CREATE INDEX IF NOT EXISTS idx_pipeline_jobs_status ON pipeline_jobs(status);
CREATE INDEX IF NOT EXISTS idx_pipeline_jobs_queued_at ON pipeline_jobs(queued_at);

CREATE INDEX IF NOT EXISTS idx_webhook_configs_project_id ON webhook_configs(project_id);

-- ============================================
-- Projet de démonstration (optionnel)
-- ============================================

INSERT OR IGNORE INTO projects (id, name, repo_url, branch_filter, deployment_type, build_command, start_command, enabled)
VALUES (
  1,
  'Demo Project',
  'https://github.com/user/demo-project.git',
  'main',
  'pm2',
  'npm run build',
  'server.js',
  0
);
