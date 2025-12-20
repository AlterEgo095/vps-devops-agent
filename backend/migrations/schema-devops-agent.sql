CREATE TABLE users (
    id TEXT PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'user', -- 'admin' ou 'user'
    phone_number TEXT,
    country_code TEXT DEFAULT '+243',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_login DATETIME,
    is_active BOOLEAN DEFAULT 1,
    email_verified BOOLEAN DEFAULT 0
);
CREATE TABLE subscription_plans (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL, -- 'Free', 'Pro', 'Enterprise'
    display_name TEXT NOT NULL,
    description TEXT,
    price_usd REAL NOT NULL DEFAULT 0,
    price_cdf REAL NOT NULL DEFAULT 0,
    currency TEXT DEFAULT 'USD',
    
    -- Limites du plan
    max_ai_calls INTEGER DEFAULT 50, -- Requêtes IA par mois
    max_tasks INTEGER DEFAULT 20, -- Tâches simultanées
    max_storage_mb INTEGER DEFAULT 100, -- Stockage en MB
    max_projects INTEGER DEFAULT 5, -- Nombre de projets
    
    -- Fonctionnalités
    has_priority_support BOOLEAN DEFAULT 0,
    has_advanced_analytics BOOLEAN DEFAULT 0,
    has_custom_ai_keys BOOLEAN DEFAULT 0,
    has_team_access BOOLEAN DEFAULT 0,
    max_team_members INTEGER DEFAULT 1,
    
    -- Période
    billing_period TEXT DEFAULT 'monthly', -- 'monthly', 'yearly'
    trial_days INTEGER DEFAULT 0,
    
    is_active BOOLEAN DEFAULT 1,
    display_order INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE subscriptions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    plan_id TEXT NOT NULL,
    
    status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'active', 'expired', 'cancelled'
    
    start_date DATETIME,
    end_date DATETIME,
    trial_end_date DATETIME,
    
    auto_renew BOOLEAN DEFAULT 1,
    cancelled_at DATETIME,
    cancellation_reason TEXT,
    
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (plan_id) REFERENCES subscription_plans(id)
);
CREATE TABLE payment_methods (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL, -- 'M-Pesa', 'Orange Money', 'Airtel Money'
    code TEXT UNIQUE NOT NULL, -- 'mpesa', 'orange', 'airtel'
    display_name TEXT NOT NULL,
    icon_url TEXT,
    
    -- Configuration
    is_active BOOLEAN DEFAULT 1,
    requires_phone BOOLEAN DEFAULT 1,
    country_codes TEXT, -- JSON array: ['+243', '+254']
    instructions TEXT, -- Instructions pour l'utilisateur
    
    -- API Configuration (crypté)
    api_key TEXT,
    api_secret TEXT,
    merchant_id TEXT,
    webhook_url TEXT,
    
    display_order INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE payment_transactions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    subscription_id TEXT,
    plan_id TEXT NOT NULL,
    
    -- Informations de paiement
    payment_method_id TEXT NOT NULL,
    payment_method_code TEXT NOT NULL, -- 'mpesa', 'orange', 'airtel'
    
    amount REAL NOT NULL,
    currency TEXT DEFAULT 'USD',
    amount_local REAL, -- Montant en monnaie locale
    currency_local TEXT, -- 'CDF', 'KES', etc.
    
    phone_number TEXT NOT NULL,
    country_code TEXT NOT NULL,
    
    -- Statut
    status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'validated', 'rejected', 'expired'
    
    -- Validation admin
    validated_by TEXT, -- ID de l'admin qui a validé
    validated_at DATETIME,
    validation_notes TEXT,
    
    -- Référence externe
    transaction_reference TEXT,
    external_reference TEXT, -- Référence du provider (M-Pesa, etc.)
    
    -- WhatsApp
    whatsapp_message_sent BOOLEAN DEFAULT 0,
    whatsapp_message_id TEXT,
    whatsapp_sent_at DATETIME,
    
    -- Metadata
    user_agent TEXT,
    ip_address TEXT,
    
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (subscription_id) REFERENCES subscriptions(id),
    FOREIGN KEY (plan_id) REFERENCES subscription_plans(id),
    FOREIGN KEY (payment_method_id) REFERENCES payment_methods(id)
);
CREATE TABLE user_usage (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    subscription_id TEXT NOT NULL,
    
    -- Compteurs mensuels
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    
    ai_calls_used INTEGER DEFAULT 0,
    tasks_executed INTEGER DEFAULT 0,
    storage_used_mb INTEGER DEFAULT 0,
    projects_created INTEGER DEFAULT 0,
    
    -- Limites actuelles (copiées du plan)
    ai_calls_limit INTEGER,
    tasks_limit INTEGER,
    storage_limit_mb INTEGER,
    projects_limit INTEGER,
    
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (subscription_id) REFERENCES subscriptions(id)
);
CREATE TABLE ai_keys (
    id TEXT PRIMARY KEY,
    user_id TEXT, -- NULL = clé globale de la plateforme
    
    provider TEXT NOT NULL, -- 'openai', 'deepseek', 'anthropic'
    api_key TEXT NOT NULL,
    api_secret TEXT,
    
    name TEXT, -- Nom donné par l'utilisateur
    
    is_active BOOLEAN DEFAULT 1,
    is_default BOOLEAN DEFAULT 0, -- Clé par défaut pour ce provider
    
    -- Limites et usage
    monthly_limit_usd REAL, -- Budget mensuel max
    usage_this_month_usd REAL DEFAULT 0,
    
    last_used_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE TABLE platform_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    value_type TEXT DEFAULT 'string', -- 'string', 'number', 'boolean', 'json'
    description TEXT,
    is_public BOOLEAN DEFAULT 0, -- Accessible sans auth
    category TEXT, -- 'payment', 'whatsapp', 'ai', 'general'
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_by TEXT -- ID de l'admin
);
CREATE TABLE admin_notifications (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL, -- 'new_payment', 'new_user', 'subscription_expiring', etc.
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    
    related_user_id TEXT,
    related_transaction_id TEXT,
    related_subscription_id TEXT,
    
    is_read BOOLEAN DEFAULT 0,
    read_at DATETIME,
    read_by TEXT,
    
    priority TEXT DEFAULT 'normal', -- 'low', 'normal', 'high', 'urgent'
    
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (related_user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (related_transaction_id) REFERENCES payment_transactions(id) ON DELETE CASCADE,
    FOREIGN KEY (related_subscription_id) REFERENCES subscriptions(id) ON DELETE CASCADE
);
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_username ON users(username);
CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_subscriptions_user ON subscriptions(user_id);
CREATE INDEX idx_subscriptions_status ON subscriptions(status);
CREATE INDEX idx_subscriptions_dates ON subscriptions(start_date, end_date);
CREATE INDEX idx_transactions_user ON payment_transactions(user_id);
CREATE INDEX idx_transactions_status ON payment_transactions(status);
CREATE INDEX idx_transactions_created ON payment_transactions(created_at);
CREATE INDEX idx_usage_user ON user_usage(user_id);
CREATE INDEX idx_usage_period ON user_usage(period_start, period_end);
CREATE INDEX idx_notifications_unread ON admin_notifications(is_read, created_at);
CREATE VIEW v_active_subscriptions AS
SELECT 
    s.*,
    u.username,
    u.email,
    u.phone_number,
    p.name as plan_name,
    p.display_name as plan_display_name,
    p.price_usd
FROM subscriptions s
JOIN users u ON s.user_id = u.id
JOIN subscription_plans p ON s.plan_id = p.id
WHERE s.status = 'active'
/* v_active_subscriptions(id,user_id,plan_id,status,start_date,end_date,trial_end_date,auto_renew,cancelled_at,cancellation_reason,created_at,updated_at,username,email,phone_number,plan_name,plan_display_name,price_usd) */;
CREATE VIEW v_pending_payments AS
SELECT 
    pt.*,
    u.username,
    u.email,
    u.phone_number as user_phone,
    p.name as plan_name,
    pm.display_name as payment_method_name
FROM payment_transactions pt
JOIN users u ON pt.user_id = u.id
JOIN subscription_plans p ON pt.plan_id = p.id
JOIN payment_methods pm ON pt.payment_method_id = pm.id
WHERE pt.status = 'pending'
ORDER BY pt.created_at DESC
/* v_pending_payments(id,user_id,subscription_id,plan_id,payment_method_id,payment_method_code,amount,currency,amount_local,currency_local,phone_number,country_code,status,validated_by,validated_at,validation_notes,transaction_reference,external_reference,whatsapp_message_sent,whatsapp_message_id,whatsapp_sent_at,user_agent,ip_address,created_at,updated_at,username,email,user_phone,plan_name,payment_method_name) */;
CREATE VIEW v_user_stats AS
SELECT 
    u.id,
    u.username,
    u.email,
    u.role,
    u.created_at,
    s.plan_id,
    sp.name as current_plan,
    s.status as subscription_status,
    s.end_date as subscription_end_date,
    uu.ai_calls_used,
    uu.ai_calls_limit,
    uu.tasks_executed,
    uu.tasks_limit,
    COUNT(DISTINCT pt.id) as total_transactions,
    SUM(CASE WHEN pt.status = 'validated' THEN pt.amount ELSE 0 END) as total_paid
FROM users u
LEFT JOIN subscriptions s ON u.id = s.user_id AND s.status = 'active'
LEFT JOIN subscription_plans sp ON s.plan_id = sp.id
LEFT JOIN user_usage uu ON u.id = uu.user_id AND uu.period_end >= DATE('now')
LEFT JOIN payment_transactions pt ON u.id = pt.user_id
GROUP BY u.id
/* v_user_stats(id,username,email,role,created_at,plan_id,current_plan,subscription_status,subscription_end_date,ai_calls_used,ai_calls_limit,tasks_executed,tasks_limit,total_transactions,total_paid) */;
CREATE TABLE sqlite_sequence(name,seq);
CREATE TABLE command_templates (
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
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP, is_favorite BOOLEAN DEFAULT 0,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX idx_templates_user_id ON command_templates(user_id);
CREATE INDEX idx_templates_category ON command_templates(category);
CREATE INDEX idx_templates_public ON command_templates(is_public);
CREATE TABLE command_history (
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
CREATE INDEX idx_history_user_id ON command_history(user_id);
CREATE INDEX idx_history_server_id ON command_history(server_id);
CREATE INDEX idx_history_executed_at ON command_history(executed_at DESC);
CREATE INDEX idx_history_status ON command_history(status);
CREATE TABLE server_metrics (
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
CREATE INDEX idx_metrics_server_id ON server_metrics(server_id);
CREATE INDEX idx_metrics_collected_at ON server_metrics(collected_at DESC);
CREATE TRIGGER update_templates_timestamp 
AFTER UPDATE ON command_templates
BEGIN
    UPDATE command_templates SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;
CREATE TRIGGER increment_template_usage
AFTER INSERT ON command_history
WHEN NEW.template_id IS NOT NULL
BEGIN
    UPDATE command_templates 
    SET usage_count = usage_count + 1 
    WHERE id = NEW.template_id;
END;
CREATE VIEW v_command_history_recent AS
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
LIMIT 100
/* v_command_history_recent(id,user_id,username,server_id,server_name,command,template_name,status,exit_code,duration_ms,executed_at) */;
CREATE TABLE ai_agent_config (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    key TEXT UNIQUE NOT NULL,
    value TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE ai_conversations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    server_id INTEGER,
    title TEXT,
    context TEXT,
    status TEXT DEFAULT 'active',
    started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_message_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    ended_at DATETIME,
    message_count INTEGER DEFAULT 0,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (server_id) REFERENCES servers(id) ON DELETE SET NULL
);
CREATE TABLE ai_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    conversation_id INTEGER NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('user', 'assistant', 'system')),
    content TEXT NOT NULL,
    tokens_used INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP, actions TEXT, context_snapshot TEXT, token_count INTEGER,
    FOREIGN KEY (conversation_id) REFERENCES ai_conversations(id) ON DELETE CASCADE
);
CREATE INDEX idx_ai_conversations_user_id ON ai_conversations(user_id);
CREATE INDEX idx_ai_conversations_status ON ai_conversations(status);
CREATE INDEX idx_ai_messages_conversation_id ON ai_messages(conversation_id);
CREATE TABLE servers_new (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    name TEXT NOT NULL,
    host TEXT NOT NULL,
    port INTEGER DEFAULT 22,
    username TEXT NOT NULL,
    auth_type TEXT DEFAULT 'password',
    encrypted_credentials TEXT,
    description TEXT,
    tags TEXT,
    status TEXT DEFAULT 'active',
    last_check DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE TABLE servers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    name TEXT NOT NULL,
    host TEXT NOT NULL,
    port INTEGER DEFAULT 22,
    username TEXT NOT NULL,
    auth_type TEXT DEFAULT 'password',
    encrypted_credentials TEXT,
    description TEXT,
    tags TEXT,
    status TEXT DEFAULT 'active',
    last_check DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX idx_servers_user_id ON servers(user_id);
CREATE INDEX idx_servers_status ON servers(status);
CREATE VIEW v_servers_summary AS
SELECT 
    s.id,
    s.user_id,
    s.name,
    s.host,
    s.port,
    s.username,
    s.status,
    s.last_check,
    u.username as owner_username
FROM servers s
LEFT JOIN users u ON s.user_id = u.id
/* v_servers_summary(id,user_id,name,host,port,username,status,last_check,owner_username) */;
CREATE TABLE ai_actions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    conversation_id INTEGER,
    message_id INTEGER,
    action_type TEXT NOT NULL,
    command TEXT NOT NULL,
    risk_level TEXT CHECK(risk_level IN ('SAFE', 'MODERATE', 'CRITICAL')),
    status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'rejected', 'executing', 'completed', 'failed')),
    output TEXT,
    error TEXT,
    executed_at DATETIME,
    completed_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (conversation_id) REFERENCES ai_conversations(id) ON DELETE CASCADE,
    FOREIGN KEY (message_id) REFERENCES ai_messages(id) ON DELETE SET NULL
);
CREATE INDEX idx_ai_actions_conversation_id ON ai_actions(conversation_id);
CREATE INDEX idx_ai_actions_status ON ai_actions(status);
CREATE INDEX idx_templates_user ON command_templates(user_id);
CREATE TABLE template_categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT,
    name TEXT NOT NULL UNIQUE,
    icon TEXT,
    color TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE autonomous_executions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    server_id INTEGER NOT NULL,
    plan TEXT NOT NULL,
    results TEXT NOT NULL,
    success BOOLEAN DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (server_id) REFERENCES servers(id)
);
CREATE TABLE metrics_history (
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
CREATE TABLE alert_config (
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
CREATE TABLE alert_history (
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
CREATE INDEX idx_metrics_timestamp ON metrics_history(timestamp DESC);
CREATE INDEX idx_metrics_created ON metrics_history(created_at DESC);
CREATE INDEX idx_alerts_type ON alert_history(type);
CREATE INDEX idx_alerts_level ON alert_history(level);
CREATE INDEX idx_alerts_created ON alert_history(created_at DESC);
CREATE VIEW v_ai_conversations_summary AS
SELECT 
    c.id,
    c.user_id,
    c.server_id,
    c.title,
    c.status,
    c.message_count,
    c.started_at,
    c.last_message_at,
    c.ended_at,
    COUNT(DISTINCT a.id) as action_count,
    SUM(CASE WHEN a.status = 'completed' THEN 1 ELSE 0 END) as completed_actions,
    SUM(CASE WHEN a.status = 'failed' THEN 1 ELSE 0 END) as failed_actions
FROM ai_conversations c
LEFT JOIN ai_actions a ON c.id = a.conversation_id
GROUP BY c.id
/* v_ai_conversations_summary(id,user_id,server_id,title,status,message_count,started_at,last_message_at,ended_at,action_count,completed_actions,failed_actions) */;
CREATE TABLE autonomous_tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    natural_command TEXT NOT NULL,
    server_id INTEGER,
    safety_level TEXT DEFAULT 'MODERATE',
    status TEXT DEFAULT 'pending',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    started_at DATETIME,
    completed_at DATETIME,
    error_message TEXT,
    steps_completed INTEGER DEFAULT 0,
    steps_total INTEGER DEFAULT 0,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (server_id) REFERENCES servers(id)
);
CREATE INDEX idx_autonomous_tasks_user_id ON autonomous_tasks(user_id);
CREATE INDEX idx_autonomous_tasks_status ON autonomous_tasks(status);
CREATE INDEX idx_autonomous_tasks_created_at ON autonomous_tasks(created_at DESC);
