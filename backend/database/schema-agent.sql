-- ============================================
-- Schema for VPS DevOps Agent - Phase 4
-- Tables for Command Execution & Server Management
-- ============================================

-- Table: servers
-- Stocke les informations des serveurs à gérer
CREATE TABLE IF NOT EXISTS servers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    host TEXT NOT NULL,
    port INTEGER DEFAULT 22,
    username TEXT NOT NULL,
    auth_type TEXT DEFAULT 'password', -- password, key, agent
    encrypted_credentials TEXT, -- Encrypted password or private key
    group_name TEXT DEFAULT 'default',
    status TEXT DEFAULT 'unknown', -- online, offline, error, unknown
    last_check_at DATETIME,
    metadata TEXT, -- JSON field for additional info
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Index pour recherche rapide par utilisateur
CREATE INDEX IF NOT EXISTS idx_servers_user_id ON servers(user_id);
CREATE INDEX IF NOT EXISTS idx_servers_status ON servers(status);
CREATE INDEX IF NOT EXISTS idx_servers_group ON servers(group_name);

-- Table: command_templates
-- Templates de commandes pré-définies et personnalisées
CREATE TABLE IF NOT EXISTS command_templates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER, -- NULL pour templates publics
    name TEXT NOT NULL,
    description TEXT,
    command TEXT NOT NULL,
    category TEXT DEFAULT 'custom', -- pm2, docker, git, nginx, system, custom
    parameters TEXT, -- JSON field pour paramètres dynamiques
    is_public BOOLEAN DEFAULT 0,
    usage_count INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

-- Index pour recherche rapide
CREATE INDEX IF NOT EXISTS idx_templates_user_id ON command_templates(user_id);
CREATE INDEX IF NOT EXISTS idx_templates_category ON command_templates(category);
CREATE INDEX IF NOT EXISTS idx_templates_public ON command_templates(is_public);

-- Table: command_history
-- Historique de toutes les exécutions de commandes
CREATE TABLE IF NOT EXISTS command_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    server_id INTEGER,
    command TEXT NOT NULL,
    template_id INTEGER, -- Référence au template utilisé si applicable
    output TEXT,
    error_output TEXT,
    exit_code INTEGER,
    duration_ms INTEGER,
    status TEXT DEFAULT 'pending', -- pending, running, success, error
    executed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (server_id) REFERENCES servers(id) ON DELETE SET NULL,
    FOREIGN KEY (template_id) REFERENCES command_templates(id) ON DELETE SET NULL
);

-- Index pour recherche rapide
CREATE INDEX IF NOT EXISTS idx_history_user_id ON command_history(user_id);
CREATE INDEX IF NOT EXISTS idx_history_server_id ON command_history(server_id);
CREATE INDEX IF NOT EXISTS idx_history_executed_at ON command_history(executed_at DESC);
CREATE INDEX IF NOT EXISTS idx_history_status ON command_history(status);

-- Table: server_metrics
-- Métriques des serveurs (CPU, RAM, Disk) pour le mode Gestion Serveurs
CREATE TABLE IF NOT EXISTS server_metrics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    server_id INTEGER NOT NULL,
    cpu_usage REAL,
    memory_usage REAL,
    memory_total INTEGER,
    disk_usage REAL,
    disk_total INTEGER,
    network_in INTEGER,
    network_out INTEGER,
    load_average TEXT, -- JSON: {"1min": 0.5, "5min": 0.3, "15min": 0.2}
    services_status TEXT, -- JSON: [{"name": "nginx", "status": "running"}]
    collected_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (server_id) REFERENCES servers(id) ON DELETE CASCADE
);

-- Index pour recherche rapide
CREATE INDEX IF NOT EXISTS idx_metrics_server_id ON server_metrics(server_id);
CREATE INDEX IF NOT EXISTS idx_metrics_collected_at ON server_metrics(collected_at DESC);

-- ============================================
-- Insertion des templates de commandes par défaut
-- ============================================

-- PM2 Commands
INSERT OR IGNORE INTO command_templates (user_id, name, description, command, category, is_public) VALUES
(NULL, 'PM2 Status', 'Afficher le statut de tous les processus PM2', 'pm2 status', 'pm2', 1),
(NULL, 'PM2 List', 'Lister tous les processus avec détails', 'pm2 list', 'pm2', 1),
(NULL, 'PM2 Restart All', 'Redémarrer tous les processus', 'pm2 restart all', 'pm2', 1),
(NULL, 'PM2 Logs', 'Afficher les logs en temps réel', 'pm2 logs --nostream --lines 50', 'pm2', 1),
(NULL, 'PM2 Monit', 'Monitorer les processus', 'pm2 monit', 'pm2', 1);

-- Docker Commands
INSERT OR IGNORE INTO command_templates (user_id, name, description, command, category, is_public) VALUES
(NULL, 'Docker PS', 'Lister tous les conteneurs', 'docker ps -a', 'docker', 1),
(NULL, 'Docker Images', 'Lister toutes les images', 'docker images', 'docker', 1),
(NULL, 'Docker Stats', 'Statistiques des conteneurs', 'docker stats --no-stream', 'docker', 1),
(NULL, 'Docker Compose Up', 'Démarrer docker-compose', 'docker-compose up -d', 'docker', 1),
(NULL, 'Docker Prune', 'Nettoyer les ressources inutilisées', 'docker system prune -f', 'docker', 1);

-- Git Commands
INSERT OR IGNORE INTO command_templates (user_id, name, description, command, category, is_public) VALUES
(NULL, 'Git Status', 'Afficher le statut du repository', 'git status', 'git', 1),
(NULL, 'Git Pull', 'Récupérer les dernières modifications', 'git pull origin main', 'git', 1),
(NULL, 'Git Log', 'Afficher l''historique des commits', 'git log --oneline -10', 'git', 1),
(NULL, 'Git Branch', 'Lister les branches', 'git branch -a', 'git', 1),
(NULL, 'Git Diff', 'Afficher les modifications', 'git diff', 'git', 1);

-- Nginx Commands
INSERT OR IGNORE INTO command_templates (user_id, name, description, command, category, is_public) VALUES
(NULL, 'Nginx Status', 'Vérifier le statut de Nginx', 'systemctl status nginx', 'nginx', 1),
(NULL, 'Nginx Reload', 'Recharger la configuration', 'nginx -s reload', 'nginx', 1),
(NULL, 'Nginx Test Config', 'Tester la configuration', 'nginx -t', 'nginx', 1),
(NULL, 'Nginx Restart', 'Redémarrer Nginx', 'systemctl restart nginx', 'nginx', 1),
(NULL, 'Nginx Error Logs', 'Afficher les logs d''erreur', 'tail -n 50 /var/log/nginx/error.log', 'nginx', 1);

-- System Commands
INSERT OR IGNORE INTO command_templates (user_id, name, description, command, category, is_public) VALUES
(NULL, 'System Info', 'Informations système', 'uname -a && cat /etc/os-release', 'system', 1),
(NULL, 'Disk Usage', 'Utilisation disque', 'df -h', 'system', 1),
(NULL, 'Memory Info', 'Informations mémoire', 'free -h', 'system', 1),
(NULL, 'Top Processes', 'Processus les plus gourmands', 'ps aux --sort=-%mem | head -10', 'system', 1),
(NULL, 'Network Interfaces', 'Interfaces réseau', 'ip addr show', 'system', 1),
(NULL, 'Active Connections', 'Connexions réseau actives', 'netstat -tunlp', 'system', 1),
(NULL, 'System Uptime', 'Uptime du système', 'uptime', 'system', 1);

-- ============================================
-- Triggers pour mise à jour automatique
-- ============================================

-- Trigger: updated_at pour servers
CREATE TRIGGER IF NOT EXISTS update_servers_timestamp 
AFTER UPDATE ON servers
BEGIN
    UPDATE servers SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

-- Trigger: updated_at pour command_templates
CREATE TRIGGER IF NOT EXISTS update_templates_timestamp 
AFTER UPDATE ON command_templates
BEGIN
    UPDATE command_templates SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

-- Trigger: incrémenter usage_count quand template utilisé
CREATE TRIGGER IF NOT EXISTS increment_template_usage
AFTER INSERT ON command_history
WHEN NEW.template_id IS NOT NULL
BEGIN
    UPDATE command_templates 
    SET usage_count = usage_count + 1 
    WHERE id = NEW.template_id;
END;

-- ============================================
-- Vues utiles
-- ============================================

-- Vue: Résumé des serveurs avec leurs dernières métriques
CREATE VIEW IF NOT EXISTS v_servers_summary AS
SELECT 
    s.id,
    s.name,
    s.host,
    s.port,
    s.username,
    s.group_name,
    s.status,
    s.last_check_at,
    sm.cpu_usage,
    sm.memory_usage,
    sm.disk_usage,
    sm.collected_at as last_metrics_at
FROM servers s
LEFT JOIN (
    SELECT server_id, cpu_usage, memory_usage, disk_usage, collected_at,
           ROW_NUMBER() OVER (PARTITION BY server_id ORDER BY collected_at DESC) as rn
    FROM server_metrics
) sm ON s.id = sm.server_id AND sm.rn = 1;

-- Vue: Historique récent des commandes par utilisateur
CREATE VIEW IF NOT EXISTS v_command_history_recent AS
SELECT 
    ch.id,
    ch.user_id,
    u.username,
    ch.server_id,
    s.name as server_name,
    ch.command,
    ct.name as template_name,
    ch.status,
    ch.exit_code,
    ch.duration_ms,
    ch.executed_at
FROM command_history ch
LEFT JOIN users u ON ch.user_id = u.id
LEFT JOIN servers s ON ch.server_id = s.id
LEFT JOIN command_templates ct ON ch.template_id = ct.id
ORDER BY ch.executed_at DESC
LIMIT 100;

-- ============================================
-- Fin du schema
-- ============================================
