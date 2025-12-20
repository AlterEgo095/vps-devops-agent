-- Migration : Système d'abonnement complet
-- Date : 22 novembre 2025

-- Table des utilisateurs
CREATE TABLE IF NOT EXISTS users (
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

-- Table des plans d'abonnement
CREATE TABLE IF NOT EXISTS subscription_plans (
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

-- Table des abonnements utilisateurs
CREATE TABLE IF NOT EXISTS subscriptions (
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

-- Table des moyens de paiement
CREATE TABLE IF NOT EXISTS payment_methods (
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

-- Table des transactions de paiement
CREATE TABLE IF NOT EXISTS payment_transactions (
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

-- Table de l'usage utilisateur (pour les limites)
CREATE TABLE IF NOT EXISTS user_usage (
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

-- Table des clés IA (pour les admins et utilisateurs avec plans custom)
CREATE TABLE IF NOT EXISTS ai_keys (
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

-- Table de configuration de la plateforme
CREATE TABLE IF NOT EXISTS platform_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    value_type TEXT DEFAULT 'string', -- 'string', 'number', 'boolean', 'json'
    description TEXT,
    is_public BOOLEAN DEFAULT 0, -- Accessible sans auth
    category TEXT, -- 'payment', 'whatsapp', 'ai', 'general'
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_by TEXT -- ID de l'admin
);

-- Table des notifications admin
CREATE TABLE IF NOT EXISTS admin_notifications (
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

-- Indexes pour la performance
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

CREATE INDEX IF NOT EXISTS idx_subscriptions_user ON subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_subscriptions_dates ON subscriptions(start_date, end_date);

CREATE INDEX IF NOT EXISTS idx_transactions_user ON payment_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_status ON payment_transactions(status);
CREATE INDEX IF NOT EXISTS idx_transactions_created ON payment_transactions(created_at);

CREATE INDEX IF NOT EXISTS idx_usage_user ON user_usage(user_id);
CREATE INDEX IF NOT EXISTS idx_usage_period ON user_usage(period_start, period_end);

CREATE INDEX IF NOT EXISTS idx_notifications_unread ON admin_notifications(is_read, created_at);

-- Vues utiles pour l'admin
CREATE VIEW IF NOT EXISTS v_active_subscriptions AS
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
WHERE s.status = 'active';

CREATE VIEW IF NOT EXISTS v_pending_payments AS
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
ORDER BY pt.created_at DESC;

CREATE VIEW IF NOT EXISTS v_user_stats AS
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
GROUP BY u.id;
