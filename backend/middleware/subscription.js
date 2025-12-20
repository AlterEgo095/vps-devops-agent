import { getSubscription, getUsage, incrementUsage } from '../services/database.js';
import { getPlanDetails, canPerformAction, getLimit } from '../config/subscription-plans.js';

/**
 * Middleware pour vérifier les limitations d'abonnement
 */
export function checkSubscriptionLimits(limitType) {
  return async (req, res, next) => {
    try {
      const userId = req.user?.id;
      
      if (!userId) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      // Récupérer l'abonnement
      const subscription = getSubscription(userId);
      
      if (!subscription || subscription.status !== 'active') {
        return res.status(403).json({
          error: 'Subscription required',
          message: 'Votre abonnement est inactif. Veuillez mettre à jour votre abonnement.',
          upgradeUrl: '/pricing'
        });
      }

      // Récupérer le plan et l'usage
      const plan = getPlanDetails(subscription.planId);
      const usage = getUsage(userId);

      // Vérifier selon le type de limite
      let canProceed = true;
      let limitReached = null;
      let upgradeRequired = false;

      switch (limitType) {
        case 'task':
          // Vérifier les tâches quotidiennes
          const dailyTaskLimit = getLimit(subscription.planId, 'maxTasksPerDay');
          if (!canPerformAction(subscription.planId, usage.tasksToday, 'maxTasksPerDay')) {
            canProceed = false;
            limitReached = {
              type: 'daily_tasks',
              current: usage.tasksToday,
              limit: dailyTaskLimit,
              message: `Limite quotidienne atteinte (${usage.tasksToday}/${dailyTaskLimit} tâches)`
            };
            upgradeRequired = subscription.planId === 'FREE';
          }
          break;

        case 'aiCall':
          // Vérifier les appels IA quotidiens
          const dailyAILimit = getLimit(subscription.planId, 'maxAICallsPerDay');
          if (!canPerformAction(subscription.planId, usage.aiCallsToday, 'maxAICallsPerDay')) {
            canProceed = false;
            limitReached = {
              type: 'daily_ai_calls',
              current: usage.aiCallsToday,
              limit: dailyAILimit,
              message: `Limite quotidienne d'appels IA atteinte (${usage.aiCallsToday}/${dailyAILimit})`
            };
            upgradeRequired = true;
          }
          break;

        case 'project':
          // Vérifier le nombre de projets
          const projectLimit = getLimit(subscription.planId, 'maxProjects');
          if (!canPerformAction(subscription.planId, usage.projectsCount, 'maxProjects')) {
            canProceed = false;
            limitReached = {
              type: 'projects',
              current: usage.projectsCount,
              limit: projectLimit,
              message: `Nombre maximum de projets atteint (${usage.projectsCount}/${projectLimit})`
            };
            upgradeRequired = true;
          }
          break;

        case 'storage':
          // Vérifier le stockage
          const storageLimit = getLimit(subscription.planId, 'totalStorage');
          if (!canPerformAction(subscription.planId, usage.storageUsed, 'totalStorage')) {
            canProceed = false;
            limitReached = {
              type: 'storage',
              current: usage.storageUsed,
              limit: storageLimit,
              message: `Limite de stockage atteinte (${(usage.storageUsed / 1024).toFixed(2)}GB/${(storageLimit / 1024).toFixed(2)}GB)`
            };
            upgradeRequired = true;
          }
          break;

        case 'docker':
          // Vérifier si Docker est activé
          if (!plan.features.dockerEnabled) {
            canProceed = false;
            limitReached = {
              type: 'feature_not_available',
              message: 'Docker n\'est pas disponible dans votre plan'
            };
            upgradeRequired = true;
          }
          break;

        case 'monitoring':
          // Vérifier si le monitoring est activé
          if (!plan.features.monitoring) {
            canProceed = false;
            limitReached = {
              type: 'feature_not_available',
              message: 'Le monitoring n\'est pas disponible dans votre plan'
            };
            upgradeRequired = true;
          }
          break;

        default:
          // Pas de vérification spécifique
          break;
      }

      if (!canProceed) {
        return res.status(403).json({
          error: 'Limit reached',
          limit: limitReached,
          subscription: {
            planId: subscription.planId,
            planName: plan.name
          },
          upgradeRequired,
          upgradeUrl: upgradeRequired ? '/pricing' : null,
          message: limitReached.message
        });
      }

      // Ajouter les infos au request pour usage ultérieur
      req.subscription = subscription;
      req.plan = plan;
      req.usage = usage;

      next();
    } catch (error) {
      console.error('Subscription check error:', error);
      res.status(500).json({ error: 'Subscription check failed' });
    }
  };
}

/**
 * Middleware pour incrémenter l'usage après succès
 */
export function trackUsage(metricType) {
  return (req, res, next) => {
    // Intercepter la réponse pour tracker l'usage seulement si succès
    const originalJson = res.json.bind(res);
    
    res.json = (data) => {
      if (res.statusCode >= 200 && res.statusCode < 300) {
        const userId = req.user?.id;
        if (userId) {
          incrementUsage(userId, metricType);
        }
      }
      return originalJson(data);
    };

    next();
  };
}

/**
 * Middleware pour vérifier une fonctionnalité spécifique
 */
export function requireFeature(featureName) {
  return (req, res, next) => {
    const userId = req.user?.id;
    
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const subscription = getSubscription(userId);
    const plan = getPlanDetails(subscription.planId);

    if (!plan.features[featureName]) {
      return res.status(403).json({
        error: 'Feature not available',
        message: `La fonctionnalité "${featureName}" n'est pas disponible dans votre plan`,
        currentPlan: plan.name,
        upgradeUrl: '/pricing'
      });
    }

    next();
  };
}

/**
 * Obtenir le résumé de l'usage pour le dashboard
 */
export function getUsageSummary(userId) {
  const subscription = getSubscription(userId);
  const plan = getPlanDetails(subscription.planId);
  const usage = getUsage(userId);

  return {
    plan: {
      id: subscription.planId,
      name: plan.name,
      price: plan.price,
      status: subscription.status
    },
    usage: {
      tasks: {
        today: usage.tasksToday,
        todayLimit: getLimit(subscription.planId, 'maxTasksPerDay'),
        month: usage.tasksThisMonth,
        monthLimit: getLimit(subscription.planId, 'maxTasksPerMonth'),
        percentage: getLimit(subscription.planId, 'maxTasksPerDay') === Infinity 
          ? 0 
          : (usage.tasksToday / getLimit(subscription.planId, 'maxTasksPerDay')) * 100
      },
      aiCalls: {
        today: usage.aiCallsToday,
        todayLimit: getLimit(subscription.planId, 'maxAICallsPerDay'),
        month: usage.aiCallsThisMonth,
        monthLimit: getLimit(subscription.planId, 'maxAICallsPerMonth'),
        percentage: getLimit(subscription.planId, 'maxAICallsPerDay') === Infinity 
          ? 0 
          : (usage.aiCallsToday / getLimit(subscription.planId, 'maxAICallsPerDay')) * 100
      },
      projects: {
        count: usage.projectsCount,
        limit: getLimit(subscription.planId, 'maxProjects'),
        percentage: getLimit(subscription.planId, 'maxProjects') === Infinity 
          ? 0 
          : (usage.projectsCount / getLimit(subscription.planId, 'maxProjects')) * 100
      },
      storage: {
        used: usage.storageUsed,
        limit: getLimit(subscription.planId, 'totalStorage'),
        percentage: getLimit(subscription.planId, 'totalStorage') === Infinity 
          ? 0 
          : (usage.storageUsed / getLimit(subscription.planId, 'totalStorage')) * 100
      }
    },
    features: plan.features
  };
}
