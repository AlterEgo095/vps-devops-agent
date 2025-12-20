import { getSubscription, db } from '../services/database-sqlite.js';

/**
 * Check if user has reached their AI call limit
 */
export function checkAICallLimit(req, res, next) {
  try {
    const userId = req.user.id;
    
    // Admin has unlimited access
    if (req.user.role === 'admin') {
      return next();
    }
    
    // Get user's subscription
    const subscription = getSubscription(userId);
    
    if (!subscription || subscription.status !== 'active') {
      return res.status(403).json({
        error: 'No active subscription',
        message: 'Vous devez avoir un abonnement actif pour utiliser cette fonctionnalité',
        requiresSubscription: true
      });
    }
    
    // Get current month usage
    const now = new Date();
    const periodStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
    const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];
    
    let usage = db.prepare(`
      SELECT * FROM user_usage 
      WHERE user_id = ? AND period_start = ? AND period_end = ?
    `).get(userId, periodStart, periodEnd);
    
    // Create usage record if not exists
    if (!usage) {
      const usageId = 'usage_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
      db.prepare(`
        INSERT INTO user_usage (
          id, user_id, subscription_id, period_start, period_end,
          ai_calls_used, ai_calls_limit, tasks_limit, storage_limit_mb, projects_limit
        ) VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?, ?)
      `).run(
        usageId, userId, subscription.id, periodStart, periodEnd,
        subscription.max_ai_calls, subscription.max_tasks, 
        subscription.max_storage_mb, subscription.max_projects
      );
      
      usage = db.prepare('SELECT * FROM user_usage WHERE id = ?').get(usageId);
    }
    
    // Check limit
    if (usage.ai_calls_used >= usage.ai_calls_limit) {
      return res.status(429).json({
        error: 'AI call limit reached',
        message: `Vous avez atteint votre limite de ${usage.ai_calls_limit} appels IA ce mois-ci`,
        limit: usage.ai_calls_limit,
        used: usage.ai_calls_used,
        upgradeRequired: true
      });
    }
    
    // Increment usage
    db.prepare(`
      UPDATE user_usage SET ai_calls_used = ai_calls_used + 1 WHERE id = ?
    `).run(usage.id);
    
    // Pass usage info to next middleware
    req.usage = {
      ...usage,
      ai_calls_used: usage.ai_calls_used + 1
    };
    
    next();
  } catch (error) {
    console.error('AI call limit check error:', error);
    res.status(500).json({ error: 'Failed to check AI call limit' });
  }
}

/**
 * Check if user has reached their task limit
 */
export function checkTaskLimit(req, res, next) {
  try {
    const userId = req.user.id;
    
    // Admin has unlimited access
    if (req.user.role === 'admin') {
      return next();
    }
    
    const subscription = getSubscription(userId);
    
    if (!subscription || subscription.status !== 'active') {
      return res.status(403).json({
        error: 'No active subscription',
        message: 'Vous devez avoir un abonnement actif pour exécuter des tâches',
        requiresSubscription: true
      });
    }
    
    // Get current month usage
    const now = new Date();
    const periodStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
    const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];
    
    let usage = db.prepare(`
      SELECT * FROM user_usage 
      WHERE user_id = ? AND period_start = ? AND period_end = ?
    `).get(userId, periodStart, periodEnd);
    
    if (!usage) {
      const usageId = 'usage_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
      db.prepare(`
        INSERT INTO user_usage (
          id, user_id, subscription_id, period_start, period_end,
          tasks_executed, ai_calls_limit, tasks_limit, storage_limit_mb, projects_limit
        ) VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?, ?)
      `).run(
        usageId, userId, subscription.id, periodStart, periodEnd,
        subscription.max_ai_calls, subscription.max_tasks, 
        subscription.max_storage_mb, subscription.max_projects
      );
      
      usage = db.prepare('SELECT * FROM user_usage WHERE id = ?').get(usageId);
    }
    
    // Check limit
    if (usage.tasks_executed >= usage.tasks_limit) {
      return res.status(429).json({
        error: 'Task limit reached',
        message: `Vous avez atteint votre limite de ${usage.tasks_limit} tâches ce mois-ci`,
        limit: usage.tasks_limit,
        used: usage.tasks_executed,
        upgradeRequired: true
      });
    }
    
    // Increment usage
    db.prepare(`
      UPDATE user_usage SET tasks_executed = tasks_executed + 1 WHERE id = ?
    `).run(usage.id);
    
    req.usage = {
      ...usage,
      tasks_executed: usage.tasks_executed + 1
    };
    
    next();
  } catch (error) {
    console.error('Task limit check error:', error);
    res.status(500).json({ error: 'Failed to check task limit' });
  }
}

/**
 * Check if user has reached their project limit
 */
export function checkProjectLimit(req, res, next) {
  try {
    const userId = req.user.id;
    
    // Admin has unlimited access
    if (req.user.role === 'admin') {
      return next();
    }
    
    const subscription = getSubscription(userId);
    
    if (!subscription || subscription.status !== 'active') {
      return res.status(403).json({
        error: 'No active subscription',
        message: 'Vous devez avoir un abonnement actif pour créer des projets',
        requiresSubscription: true
      });
    }
    
    // Get current month usage
    const now = new Date();
    const periodStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
    const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];
    
    let usage = db.prepare(`
      SELECT * FROM user_usage 
      WHERE user_id = ? AND period_start = ? AND period_end = ?
    `).get(userId, periodStart, periodEnd);
    
    if (!usage) {
      const usageId = 'usage_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
      db.prepare(`
        INSERT INTO user_usage (
          id, user_id, subscription_id, period_start, period_end,
          projects_created, ai_calls_limit, tasks_limit, storage_limit_mb, projects_limit
        ) VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?, ?)
      `).run(
        usageId, userId, subscription.id, periodStart, periodEnd,
        subscription.max_ai_calls, subscription.max_tasks, 
        subscription.max_storage_mb, subscription.max_projects
      );
      
      usage = db.prepare('SELECT * FROM user_usage WHERE id = ?').get(usageId);
    }
    
    // Check limit
    if (usage.projects_created >= usage.projects_limit) {
      return res.status(429).json({
        error: 'Project limit reached',
        message: `Vous avez atteint votre limite de ${usage.projects_limit} projets`,
        limit: usage.projects_limit,
        used: usage.projects_created,
        upgradeRequired: true
      });
    }
    
    // Increment usage
    db.prepare(`
      UPDATE user_usage SET projects_created = projects_created + 1 WHERE id = ?
    `).run(usage.id);
    
    req.usage = {
      ...usage,
      projects_created: usage.projects_created + 1
    };
    
    next();
  } catch (error) {
    console.error('Project limit check error:', error);
    res.status(500).json({ error: 'Failed to check project limit' });
  }
}

/**
 * Get usage summary for user
 */
export function getUserUsageSummary(userId) {
  const subscription = getSubscription(userId);
  
  if (!subscription) {
    return null;
  }
  
  const now = new Date();
  const periodStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
  const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];
  
  const usage = db.prepare(`
    SELECT * FROM user_usage 
    WHERE user_id = ? AND period_start = ? AND period_end = ?
  `).get(userId, periodStart, periodEnd);
  
  if (!usage) {
    return {
      aiCalls: { used: 0, limit: subscription.max_ai_calls },
      tasks: { used: 0, limit: subscription.max_tasks },
      storage: { used: 0, limit: subscription.max_storage_mb },
      projects: { used: 0, limit: subscription.max_projects },
      periodStart,
      periodEnd
    };
  }
  
  return {
    aiCalls: { 
      used: usage.ai_calls_used, 
      limit: usage.ai_calls_limit,
      percentage: (usage.ai_calls_used / usage.ai_calls_limit * 100).toFixed(1)
    },
    tasks: { 
      used: usage.tasks_executed, 
      limit: usage.tasks_limit,
      percentage: (usage.tasks_executed / usage.tasks_limit * 100).toFixed(1)
    },
    storage: { 
      used: usage.storage_used_mb, 
      limit: usage.storage_limit_mb,
      percentage: (usage.storage_used_mb / usage.storage_limit_mb * 100).toFixed(1)
    },
    projects: { 
      used: usage.projects_created, 
      limit: usage.projects_limit,
      percentage: (usage.projects_created / usage.projects_limit * 100).toFixed(1)
    },
    periodStart,
    periodEnd
  };
}
