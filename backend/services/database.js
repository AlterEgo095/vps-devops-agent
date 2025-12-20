import bcrypt from 'bcrypt';

/**
 * Base de données in-memory simple
 * En production, remplacer par PostgreSQL, MongoDB, ou SQLite
 */

export const database = {
  users: new Map(),
  subscriptions: new Map(),
  usage: new Map(),
  payments: new Map()
};

/**
 * Initialiser les données par défaut
 */
export function initializeDatabase() {
  // Admin par défaut
  const adminId = 'user_1';
  database.users.set(adminId, {
    id: adminId,
    username: process.env.ADMIN_USERNAME || 'admin',
    email: 'admin@example.com',
    passwordHash: bcrypt.hashSync(process.env.ADMIN_PASSWORD || 'admin123', 10),
    role: 'admin',
    createdAt: new Date().toISOString(),
    isActive: true
  });

  // Abonnement admin (Enterprise gratuit pour admin)
  database.subscriptions.set(adminId, {
    userId: adminId,
    planId: 'ENTERPRISE',
    status: 'active',
    startDate: new Date().toISOString(),
    endDate: null, // Jamais
    autoRenew: true,
    stripeCustomerId: null,
    stripeSubscriptionId: null
  });

  // Usage admin
  database.usage.set(adminId, {
    userId: adminId,
    tasksToday: 0,
    tasksThisMonth: 0,
    aiCallsToday: 0,
    aiCallsThisMonth: 0,
    storageUsed: 0,
    projectsCount: 0,
    lastReset: new Date().toISOString()
  });

  console.log('✅ Database initialized with admin user');
}

// Initialiser au démarrage
initializeDatabase();

/**
 * Utilisateurs
 */
export function createUser(userData) {
  const userId = `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  const user = {
    id: userId,
    username: userData.username,
    email: userData.email,
    passwordHash: bcrypt.hashSync(userData.password, 10),
    role: userData.role || 'user',
    createdAt: new Date().toISOString(),
    isActive: true
  };

  database.users.set(userId, user);

  // Créer abonnement Free par défaut
  database.subscriptions.set(userId, {
    userId,
    planId: 'FREE',
    status: 'active',
    startDate: new Date().toISOString(),
    endDate: null,
    autoRenew: false
  });

  // Initialiser l'usage
  database.usage.set(userId, {
    userId,
    tasksToday: 0,
    tasksThisMonth: 0,
    aiCallsToday: 0,
    aiCallsThisMonth: 0,
    storageUsed: 0,
    projectsCount: 0,
    lastReset: new Date().toISOString()
  });

  return user;
}

export function getUserById(userId) {
  return database.users.get(userId);
}

export function getUserByUsername(username) {
  for (const user of database.users.values()) {
    if (user.username === username) {
      return user;
    }
  }
  return null;
}

export function getUserByEmail(email) {
  for (const user of database.users.values()) {
    if (user.email === email) {
      return user;
    }
  }
  return null;
}

export function updateUser(userId, updates) {
  const user = database.users.get(userId);
  if (!user) return null;

  Object.assign(user, updates);
  database.users.set(userId, user);
  return user;
}

export function deleteUser(userId) {
  database.users.delete(userId);
  database.subscriptions.delete(userId);
  database.usage.delete(userId);
}

export function getAllUsers() {
  return Array.from(database.users.values());
}

/**
 * Abonnements
 */
export function getSubscription(userId) {
  return database.subscriptions.get(userId);
}

export function updateSubscription(userId, subscriptionData) {
  const existing = database.subscriptions.get(userId);
  
  const subscription = {
    ...existing,
    ...subscriptionData,
    updatedAt: new Date().toISOString()
  };

  database.subscriptions.set(userId, subscription);
  return subscription;
}

export function cancelSubscription(userId) {
  const subscription = database.subscriptions.get(userId);
  if (!subscription) return null;

  subscription.status = 'cancelled';
  subscription.endDate = new Date().toISOString();
  subscription.autoRenew = false;

  database.subscriptions.set(userId, subscription);
  return subscription;
}

export function upgradeSubscription(userId, newPlanId, stripeData = {}) {
  const subscription = database.subscriptions.get(userId);
  if (!subscription) return null;

  subscription.planId = newPlanId;
  subscription.status = 'active';
  subscription.startDate = new Date().toISOString();
  subscription.endDate = null;
  subscription.autoRenew = true;
  
  if (stripeData.customerId) {
    subscription.stripeCustomerId = stripeData.customerId;
  }
  if (stripeData.subscriptionId) {
    subscription.stripeSubscriptionId = stripeData.subscriptionId;
  }

  database.subscriptions.set(userId, subscription);
  return subscription;
}

/**
 * Usage tracking
 */
export function getUsage(userId) {
  return database.usage.get(userId) || {
    userId,
    tasksToday: 0,
    tasksThisMonth: 0,
    aiCallsToday: 0,
    aiCallsThisMonth: 0,
    storageUsed: 0,
    projectsCount: 0,
    lastReset: new Date().toISOString()
  };
}

export function incrementUsage(userId, metric) {
  const usage = getUsage(userId);
  
  // Vérifier si on doit reset (nouveau jour/mois)
  const lastReset = new Date(usage.lastReset);
  const now = new Date();
  
  if (now.getDate() !== lastReset.getDate()) {
    // Nouveau jour
    usage.tasksToday = 0;
    usage.aiCallsToday = 0;
  }
  
  if (now.getMonth() !== lastReset.getMonth()) {
    // Nouveau mois
    usage.tasksThisMonth = 0;
    usage.aiCallsThisMonth = 0;
  }

  // Incrémenter le metric
  if (metric === 'task') {
    usage.tasksToday++;
    usage.tasksThisMonth++;
  } else if (metric === 'aiCall') {
    usage.aiCallsToday++;
    usage.aiCallsThisMonth++;
  } else if (metric === 'project') {
    usage.projectsCount++;
  }

  usage.lastReset = now.toISOString();
  database.usage.set(userId, usage);
  
  return usage;
}

export function updateStorage(userId, storageUsed) {
  const usage = getUsage(userId);
  usage.storageUsed = storageUsed;
  database.usage.set(userId, usage);
  return usage;
}

export function resetDailyUsage(userId) {
  const usage = getUsage(userId);
  usage.tasksToday = 0;
  usage.aiCallsToday = 0;
  usage.lastReset = new Date().toISOString();
  database.usage.set(userId, usage);
  return usage;
}

export function resetMonthlyUsage(userId) {
  const usage = getUsage(userId);
  usage.tasksThisMonth = 0;
  usage.aiCallsThisMonth = 0;
  usage.lastReset = new Date().toISOString();
  database.usage.set(userId, usage);
  return usage;
}

/**
 * Paiements
 */
export function createPayment(userId, paymentData) {
  const paymentId = `payment_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  const payment = {
    id: paymentId,
    userId,
    amount: paymentData.amount,
    currency: paymentData.currency || 'EUR',
    status: paymentData.status || 'pending',
    planId: paymentData.planId,
    stripePaymentIntentId: paymentData.stripePaymentIntentId,
    createdAt: new Date().toISOString()
  };

  database.payments.set(paymentId, payment);
  return payment;
}

export function getPaymentsByUser(userId) {
  const payments = [];
  for (const payment of database.payments.values()) {
    if (payment.userId === userId) {
      payments.push(payment);
    }
  }
  return payments.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

export function updatePayment(paymentId, updates) {
  const payment = database.payments.get(paymentId);
  if (!payment) return null;

  Object.assign(payment, updates);
  database.payments.set(paymentId, payment);
  return payment;
}

/**
 * Stats globales
 */
export function getGlobalStats() {
  return {
    totalUsers: database.users.size,
    activeSubscriptions: Array.from(database.subscriptions.values())
      .filter(s => s.status === 'active').length,
    totalRevenue: Array.from(database.payments.values())
      .filter(p => p.status === 'succeeded')
      .reduce((sum, p) => sum + p.amount, 0),
    planDistribution: {
      FREE: Array.from(database.subscriptions.values())
        .filter(s => s.planId === 'FREE' && s.status === 'active').length,
      PRO: Array.from(database.subscriptions.values())
        .filter(s => s.planId === 'PRO' && s.status === 'active').length,
      ENTERPRISE: Array.from(database.subscriptions.values())
        .filter(s => s.planId === 'ENTERPRISE' && s.status === 'active').length
    }
  };
}
