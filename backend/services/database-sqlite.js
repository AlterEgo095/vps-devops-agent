import Database from 'better-sqlite3';
import bcrypt from 'bcrypt';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Path for SQLite database
const DB_PATH = join(__dirname, '../../data/devops-agent.db');

// Ensure data directory exists
const dataDir = join(__dirname, '../../data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// Initialize database
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL'); // Better performance

console.log(`📁 SQLite database initialized at: ${DB_PATH}`);

/**
 * Initialize database schema
 */
export function initializeDatabase() {
  console.log('🔧 Initializing database schema...');

  // Read and execute migrations
  const migrationsPath = join(__dirname, '../../migrations/0001_subscription_system.sql');
  
  if (fs.existsSync(migrationsPath)) {
    const migrationSQL = fs.readFileSync(migrationsPath, 'utf8');
    
    try {
      // Execute the entire SQL file at once
      db.exec(migrationSQL);
      console.log('✅ Database schema migrated successfully');
    } catch (error) {
      // Ignore "table already exists" errors
      if (!error.message.includes('already exists')) {
        console.error('❌ Migration error:', error.message);
        throw error;
      } else {
        console.log('ℹ️  Tables already exist, skipping migration');
      }
    }
  } else {
    console.error('❌ Migration file not found:', migrationsPath);
  }

  // Initialize subscription plans FIRST (needed for foreign keys)
  initializeSubscriptionPlans();
  
  // Initialize payment methods
  initializePaymentMethods();
  
  // Initialize platform settings
  initializePlatformSettings();
  
  // Initialize admin user LAST (needs plans to exist)
  initializeAdminUser();
  
  console.log('✅ Database initialized with default data');
}

/**
 * Initialize admin user
 */
function initializeAdminUser() {
  const adminUsername = process.env.ADMIN_USERNAME || 'admin';
  const adminPassword = process.env.ADMIN_PASSWORD || 'Admin2024';
  
  // Check if admin already exists
  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(adminUsername);
  
  if (!existing) {
    const adminId = 'user_admin_' + Date.now();
    const passwordHash = bcrypt.hashSync(adminPassword, 10);
    
    db.prepare(`
      INSERT INTO users (id, username, email, password_hash, role, is_active)
      VALUES (?, ?, ?, ?, 'admin', 1)
    `).run(adminId, adminUsername, 'admin@devops-agent.com', passwordHash);
    
    // Give admin Enterprise plan (unlimited)
    const planId = 'plan_enterprise';
    const subscriptionId = 'sub_admin_' + Date.now();
    
    db.prepare(`
      INSERT INTO subscriptions (id, user_id, plan_id, status, start_date, auto_renew)
      VALUES (?, ?, ?, 'active', datetime('now'), 1)
    `).run(subscriptionId, adminId, planId);
    
    console.log(`✅ Admin user created: ${adminUsername}`);
  } else {
    console.log(`ℹ️  Admin user already exists: ${adminUsername}`);
  }
}

/**
 * Initialize subscription plans
 */
function initializeSubscriptionPlans() {
  const plans = [
    {
      id: 'plan_free',
      name: 'free',
      display_name: 'Gratuit',
      description: 'Pour découvrir la plateforme',
      price_usd: 0,
      price_cdf: 0,
      max_ai_calls: 50,
      max_tasks: 10,
      max_storage_mb: 100,
      max_projects: 3,
      has_priority_support: 0,
      has_advanced_analytics: 0,
      has_custom_ai_keys: 0,
      has_team_access: 0,
      sort_order: 1
    },
    {
      id: 'plan_pro',
      name: 'pro',
      display_name: 'Professionnel',
      description: 'Pour les utilisateurs réguliers',
      price_usd: 29,
      price_cdf: 72500,
      max_ai_calls: 500,
      max_tasks: 100,
      max_storage_mb: 1000,
      max_projects: 20,
      has_priority_support: 1,
      has_advanced_analytics: 1,
      has_custom_ai_keys: 0,
      has_team_access: 0,
      trial_days: 7,
      sort_order: 2
    },
    {
      id: 'plan_enterprise',
      name: 'enterprise',
      display_name: 'Entreprise',
      description: 'Pour les équipes et entreprises',
      price_usd: 99,
      price_cdf: 247500,
      max_ai_calls: 99999,
      max_tasks: 99999,
      max_storage_mb: 10000,
      max_projects: 999,
      has_priority_support: 1,
      has_advanced_analytics: 1,
      has_custom_ai_keys: 1,
      has_team_access: 1,
      trial_days: 14,
      sort_order: 3
    }
  ];
  
  for (const plan of plans) {
    const existing = db.prepare('SELECT id FROM subscription_plans WHERE id = ?').get(plan.id);
    
    if (!existing) {
      db.prepare(`
        INSERT INTO subscription_plans (
          id, name, display_name, description, price_usd, price_cdf,
          max_ai_calls, max_tasks, max_storage_mb, max_projects,
          has_priority_support, has_advanced_analytics, has_custom_ai_keys, has_team_access,
          trial_days, display_order, is_active
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
      `).run(
        plan.id, plan.name, plan.display_name, plan.description,
        plan.price_usd, plan.price_cdf,
        plan.max_ai_calls, plan.max_tasks, plan.max_storage_mb, plan.max_projects,
        plan.has_priority_support, plan.has_advanced_analytics, 
        plan.has_custom_ai_keys, plan.has_team_access,
        plan.trial_days || null, plan.sort_order
      );
    }
  }
  
  console.log('✅ Subscription plans initialized');
}

/**
 * Initialize payment methods
 */
function initializePaymentMethods() {
  const methods = [
    {
      id: 'pm_mpesa',
      name: 'M-Pesa',
      code: 'mpesa',
      display_name: 'M-Pesa',
      icon_url: 'https://cdn.jsdelivr.net/npm/simple-icons@v9/icons/mpesa.svg',
      requires_phone: 1,
      country_codes: JSON.stringify(['+254', '+243']),
      instructions: 'Envoyez le montant au numéro +243XXXXXXXXX avec votre numéro de téléphone comme référence.',
      sort_order: 1
    },
    {
      id: 'pm_orange',
      name: 'Orange Money',
      code: 'orange',
      display_name: 'Orange Money',
      icon_url: 'https://www.orange.com/themes/custom/orange_theme/logo.svg',
      requires_phone: 1,
      country_codes: JSON.stringify(['+243', '+225', '+221']),
      instructions: 'Composez #150# et suivez les instructions pour payer au numéro +243XXXXXXXXX.',
      sort_order: 2
    },
    {
      id: 'pm_airtel',
      name: 'Airtel Money',
      code: 'airtel',
      display_name: 'Airtel Money',
      icon_url: 'https://www.airtel.in/airtel-money-logo.png',
      requires_phone: 1,
      country_codes: JSON.stringify(['+243', '+254', '+255']),
      instructions: 'Composez *150# et suivez les instructions pour payer au numéro +243XXXXXXXXX.',
      sort_order: 3
    }
  ];
  
  for (const method of methods) {
    const existing = db.prepare('SELECT id FROM payment_methods WHERE id = ?').get(method.id);
    
    if (!existing) {
      db.prepare(`
        INSERT INTO payment_methods (
          id, name, code, display_name, icon_url, requires_phone, 
          country_codes, instructions, display_order, is_active
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
      `).run(
        method.id, method.name, method.code, method.display_name, method.icon_url,
        method.requires_phone, method.country_codes, method.instructions, method.sort_order
      );
    }
  }
  
  console.log('✅ Payment methods initialized');
}

/**
 * Initialize platform settings
 */
function initializePlatformSettings() {
  const settings = [
    {
      key: 'whatsapp_admin_number',
      value: '+243XXXXXXXXX',
      value_type: 'string',
      description: 'Numéro WhatsApp de l\'administrateur pour les notifications de paiement',
      category: 'whatsapp'
    },
    {
      key: 'payment_phone_number',
      value: '+243XXXXXXXXX',
      value_type: 'string',
      description: 'Numéro de téléphone pour recevoir les paiements',
      category: 'payment',
      is_public: 1
    },
    {
      key: 'currency_exchange_rate_usd_cdf',
      value: '2500',
      value_type: 'number',
      description: 'Taux de change USD vers CDF',
      category: 'payment'
    },
    {
      key: 'openai_api_key',
      value: process.env.OPENAI_API_KEY || '',
      value_type: 'string',
      description: 'Clé API OpenAI par défaut',
      category: 'ai'
    },
    {
      key: 'auto_approve_payments',
      value: 'false',
      value_type: 'boolean',
      description: 'Approuver automatiquement les paiements (désactivé par défaut)',
      category: 'payment'
    }
  ];
  
  for (const setting of settings) {
    const existing = db.prepare('SELECT key FROM platform_settings WHERE key = ?').get(setting.key);
    
    if (!existing) {
      db.prepare(`
        INSERT INTO platform_settings (key, value, value_type, description, category, is_public)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        setting.key, setting.value, setting.value_type, 
        setting.description, setting.category, setting.is_public || 0
      );
    }
  }
  
  console.log('✅ Platform settings initialized');
}

// Initialize database on module load
initializeDatabase();

/**
 * User management
 */
export function createUser(userData) {
  const userId = 'user_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  const passwordHash = bcrypt.hashSync(userData.password, 10);
  
  db.prepare(`
    INSERT INTO users (id, username, email, password_hash, role, phone_number, country_code)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    userId, 
    userData.username, 
    userData.email, 
    passwordHash,
    userData.role || 'user',
    userData.phone_number || null,
    userData.country_code || '+243'
  );
  
  // Create free subscription
  const subscriptionId = 'sub_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  db.prepare(`
    INSERT INTO subscriptions (id, user_id, plan_id, status, start_date)
    VALUES (?, ?, 'plan_free', 'active', datetime('now'))
  `).run(subscriptionId, userId);
  
  return getUserById(userId);
}

export function getUserById(userId) {
  return db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
}

export function getUserByUsername(username) {
  return db.prepare('SELECT * FROM users WHERE username = ?').get(username);
}

export function getUserByEmail(email) {
  return db.prepare('SELECT * FROM users WHERE email = ?').get(email);
}

export function getAllUsers() {
  return db.prepare('SELECT * FROM users ORDER BY created_at DESC').all();
}

export function updateUser(userId, updates) {
  const fields = [];
  const values = [];
  
  for (const [key, value] of Object.entries(updates)) {
    fields.push(`${key} = ?`);
    values.push(value);
  }
  
  values.push(userId);
  
  db.prepare(`
    UPDATE users SET ${fields.join(', ')} WHERE id = ?
  `).run(...values);
  
  return getUserById(userId);
}

/**
 * Subscription management
 */
export function getSubscription(userId) {
  return db.prepare(`
    SELECT s.*, p.* 
    FROM subscriptions s
    JOIN subscription_plans p ON s.plan_id = p.id
    WHERE s.user_id = ?
    ORDER BY s.created_at DESC
    LIMIT 1
  `).get(userId);
}

export function createSubscription(userId, planId) {
  const subscriptionId = 'sub_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  
  db.prepare(`
    INSERT INTO subscriptions (id, user_id, plan_id, status, start_date)
    VALUES (?, ?, ?, 'pending', datetime('now'))
  `).run(subscriptionId, userId, planId);
  
  return subscriptionId;
}

export function updateSubscription(userId, planId, status = 'active') {
  db.prepare(`
    UPDATE subscriptions 
    SET plan_id = ?, status = ?, start_date = datetime('now')
    WHERE user_id = ?
  `).run(planId, status, userId);
  
  return getSubscription(userId);
}

export function activateSubscription(subscriptionId) {
  const subscription = db.prepare('SELECT * FROM subscriptions WHERE id = ?').get(subscriptionId);
  
  if (!subscription) {
    throw new Error('Subscription not found');
  }
  
  const plan = db.prepare('SELECT * FROM subscription_plans WHERE id = ?').get(subscription.plan_id);
  
  let endDate = null;
  if (plan.trial_days) {
    const end = new Date();
    end.setDate(end.getDate() + plan.trial_days);
    endDate = end.toISOString();
  }
  
  db.prepare(`
    UPDATE subscriptions 
    SET status = 'active', 
        start_date = datetime('now'),
        end_date = ?
    WHERE id = ?
  `).run(endDate, subscriptionId);
  
  return db.prepare('SELECT * FROM subscriptions WHERE id = ?').get(subscriptionId);
}

/**
 * Payment transactions
 */
export function createPaymentTransaction(data) {
  const transactionId = 'txn_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  
  db.prepare(`
    INSERT INTO payment_transactions (
      id, user_id, subscription_id, plan_id, payment_method_id,
      amount, currency, phone_number, country_code, status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')
  `).run(
    transactionId,
    data.userId,
    data.subscriptionId || null,
    data.planId,
    data.paymentMethodId,
    data.amount,
    data.currency || 'USD',
    data.phoneNumber,
    data.countryCode
  );
  
  return transactionId;
}

export function getPaymentTransaction(transactionId) {
  return db.prepare(`
    SELECT pt.*, u.username, u.email, p.display_name as plan_name, pm.display_name as payment_method_name
    FROM payment_transactions pt
    JOIN users u ON pt.user_id = u.id
    JOIN subscription_plans p ON pt.plan_id = p.id
    JOIN payment_methods pm ON pt.payment_method_id = pm.id
    WHERE pt.id = ?
  `).get(transactionId);
}

export function getPendingPayments() {
  return db.prepare(`
    SELECT pt.*, u.username, u.email, p.display_name as plan_name, pm.display_name as payment_method_name
    FROM payment_transactions pt
    JOIN users u ON pt.user_id = u.id
    JOIN subscription_plans p ON pt.plan_id = p.id
    JOIN payment_methods pm ON pt.payment_method_id = pm.id
    WHERE pt.status = 'pending'
    ORDER BY pt.created_at DESC
  `).all();
}

export function validatePayment(transactionId, adminId, notes = null) {
  db.prepare(`
    UPDATE payment_transactions
    SET status = 'validated',
        validated_by = ?,
        validated_at = datetime('now'),
        validation_notes = ?
    WHERE id = ?
  `).run(adminId, notes, transactionId);
  
  const transaction = db.prepare('SELECT * FROM payment_transactions WHERE id = ?').get(transactionId);
  
  // Activate subscription
  if (transaction.subscription_id) {
    activateSubscription(transaction.subscription_id);
  }
  
  return getPaymentTransaction(transactionId);
}

export function rejectPayment(transactionId, adminId, notes = null) {
  db.prepare(`
    UPDATE payment_transactions
    SET status = 'rejected',
        validated_by = ?,
        validated_at = datetime('now'),
        validation_notes = ?
    WHERE id = ?
  `).run(adminId, notes, transactionId);
  
  return getPaymentTransaction(transactionId);
}

/**
 * Subscription plans
 */
export function getAllPlans() {
  return db.prepare('SELECT * FROM subscription_plans WHERE is_active = 1 ORDER BY display_order').all();
}

export function getPlanById(planId) {
  return db.prepare('SELECT * FROM subscription_plans WHERE id = ?').get(planId);
}

/**
 * Payment methods
 */
export function getAllPaymentMethods() {
  return db.prepare('SELECT * FROM payment_methods WHERE is_active = 1 ORDER BY display_order').all();
}

export function getPaymentMethodById(methodId) {
  return db.prepare('SELECT * FROM payment_methods WHERE id = ?').get(methodId);
}

/**
 * Platform settings
 */
export function getSetting(key) {
  const setting = db.prepare('SELECT * FROM platform_settings WHERE key = ?').get(key);
  return setting ? setting.value : null;
}

export function updateSetting(key, value, updatedBy = null) {
  db.prepare(`
    UPDATE platform_settings
    SET value = ?, updated_by = ?, updated_at = datetime('now')
    WHERE key = ?
  `).run(value, updatedBy, key);
}

export function getAllSettings(isPublic = null) {
  if (isPublic !== null) {
    return db.prepare('SELECT * FROM platform_settings WHERE is_public = ?').all(isPublic ? 1 : 0);
  }
  return db.prepare('SELECT * FROM platform_settings').all();
}

/**
 * Admin notifications
 */
export function createNotification(data) {
  const notificationId = 'notif_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  
  db.prepare(`
    INSERT INTO admin_notifications (id, type, title, message, related_transaction_id, priority)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    notificationId,
    data.type,
    data.title,
    data.message,
    data.relatedTransactionId || null,
    data.priority || 'normal'
  );
  
  return notificationId;
}

export function getUnreadNotifications() {
  return db.prepare(`
    SELECT * FROM admin_notifications 
    WHERE is_read = 0 
    ORDER BY priority DESC, created_at DESC
  `).all();
}

export function markNotificationAsRead(notificationId) {
  db.prepare('UPDATE admin_notifications SET is_read = 1 WHERE id = ?').run(notificationId);
}

/**
 * Statistics
 */
export function getDashboardStats() {
  const totalUsers = db.prepare('SELECT COUNT(*) as count FROM users').get().count;
  const activeSubscriptions = db.prepare("SELECT COUNT(*) as count FROM subscriptions WHERE status = 'active'").get().count;
  const pendingPayments = db.prepare("SELECT COUNT(*) as count FROM payment_transactions WHERE status = 'pending'").get().count;
  const totalRevenue = db.prepare("SELECT SUM(amount) as total FROM payment_transactions WHERE status = 'validated'").get().total || 0;
  
  const planDistribution = db.prepare(`
    SELECT p.display_name, COUNT(*) as count
    FROM subscriptions s
    JOIN subscription_plans p ON s.plan_id = p.id
    WHERE s.status = 'active'
    GROUP BY p.id
  `).all();
  
  return {
    totalUsers,
    activeSubscriptions,
    pendingPayments,
    totalRevenue,
    planDistribution
  };
}

export { db };
