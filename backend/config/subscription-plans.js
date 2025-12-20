/**
 * Plans d'abonnement VPS DevOps Agent
 */

export const SUBSCRIPTION_PLANS = {
  FREE: {
    id: 'free',
    name: 'Free',
    price: 0,
    currency: 'EUR',
    interval: 'month',
    features: {
      // Limitations générales
      maxProjects: 3,
      maxTasksPerDay: 10,
      maxTasksPerMonth: 100,
      
      // Capacités Docker
      dockerEnabled: true,
      maxContainersPerProject: 2,
      maxImageSize: 500, // MB
      
      // Capacités AI
      aiProvider: 'deepseek', // Moins cher
      maxAICallsPerDay: 5,
      maxAICallsPerMonth: 50,
      aiModel: 'deepseek-chat',
      
      // Capacités de stockage
      maxStoragePerProject: 1024, // MB (1GB)
      totalStorage: 3072, // MB (3GB)
      
      // Fonctionnalités
      nginxConfig: true,
      scriptsCreation: true,
      backupScripts: false,
      monitoring: false,
      analytics: false,
      prioritySupport: false,
      customDomains: 0,
      
      // Limitations d'exécution
      maxExecutionTime: 60, // secondes
      parallelTasks: 1,
      
      // Support
      supportLevel: 'community',
      responseTime: null,
    },
    description: 'Parfait pour débuter et tester l\'agent',
    highlight: false
  },

  PRO: {
    id: 'pro',
    name: 'Pro',
    price: 29,
    currency: 'EUR',
    interval: 'month',
    features: {
      // Limitations générales
      maxProjects: 20,
      maxTasksPerDay: 100,
      maxTasksPerMonth: 2000,
      
      // Capacités Docker
      dockerEnabled: true,
      maxContainersPerProject: 10,
      maxImageSize: 2048, // MB (2GB)
      
      // Capacités AI
      aiProvider: 'openai', // GPT-4o-mini
      maxAICallsPerDay: 50,
      maxAICallsPerMonth: 1000,
      aiModel: 'gpt-4o-mini',
      
      // Capacités de stockage
      maxStoragePerProject: 10240, // MB (10GB)
      totalStorage: 102400, // MB (100GB)
      
      // Fonctionnalités
      nginxConfig: true,
      scriptsCreation: true,
      backupScripts: true,
      monitoring: true,
      analytics: true,
      prioritySupport: true,
      customDomains: 5,
      
      // Limitations d'exécution
      maxExecutionTime: 300, // secondes (5min)
      parallelTasks: 5,
      
      // Support
      supportLevel: 'priority',
      responseTime: '24h',
    },
    description: 'Pour les développeurs et équipes qui veulent automatiser sérieusement',
    highlight: true,
    popular: true
  },

  ENTERPRISE: {
    id: 'enterprise',
    name: 'Enterprise',
    price: 199,
    currency: 'EUR',
    interval: 'month',
    features: {
      // Limitations générales
      maxProjects: -1, // Illimité
      maxTasksPerDay: -1, // Illimité
      maxTasksPerMonth: -1, // Illimité
      
      // Capacités Docker
      dockerEnabled: true,
      maxContainersPerProject: -1, // Illimité
      maxImageSize: -1, // Illimité
      
      // Capacités AI
      aiProvider: 'openai', // GPT-4o ou GPT-4
      maxAICallsPerDay: -1, // Illimité
      maxAICallsPerMonth: -1, // Illimité
      aiModel: 'gpt-4o',
      
      // Capacités de stockage
      maxStoragePerProject: -1, // Illimité
      totalStorage: -1, // Illimité
      
      // Fonctionnalités
      nginxConfig: true,
      scriptsCreation: true,
      backupScripts: true,
      monitoring: true,
      analytics: true,
      prioritySupport: true,
      customDomains: -1, // Illimité
      dedicatedSupport: true,
      customIntegrations: true,
      sla: '99.9%',
      whiteLabel: true,
      
      // Limitations d'exécution
      maxExecutionTime: -1, // Illimité
      parallelTasks: -1, // Illimité
      
      // Support
      supportLevel: 'dedicated',
      responseTime: '1h',
      dedicatedSlack: true,
    },
    description: 'Solution complète pour grandes entreprises avec besoins illimités',
    highlight: true,
    contactSales: true
  }
};

/**
 * Vérifier si une fonctionnalité est disponible pour un plan
 */
export function hasFeature(planId, featureName) {
  const plan = SUBSCRIPTION_PLANS[planId.toUpperCase()];
  if (!plan) return false;
  
  const featureValue = plan.features[featureName];
  
  // -1 signifie illimité (toujours vrai)
  if (featureValue === -1) return true;
  
  // Pour les booléens
  if (typeof featureValue === 'boolean') return featureValue;
  
  // Pour les nombres (limites)
  if (typeof featureValue === 'number') return featureValue > 0;
  
  return !!featureValue;
}

/**
 * Obtenir la limite d'une fonctionnalité
 */
export function getLimit(planId, limitName) {
  const plan = SUBSCRIPTION_PLANS[planId.toUpperCase()];
  if (!plan) return 0;
  
  const limit = plan.features[limitName];
  return limit === -1 ? Infinity : (limit || 0);
}

/**
 * Vérifier si un utilisateur peut effectuer une action
 */
export function canPerformAction(planId, usage, limitName) {
  const limit = getLimit(planId, limitName);
  
  // Illimité
  if (limit === Infinity) return true;
  
  // Comparer l'usage avec la limite
  return usage < limit;
}

/**
 * Obtenir les détails d'un plan
 */
export function getPlanDetails(planId) {
  return SUBSCRIPTION_PLANS[planId.toUpperCase()];
}

/**
 * Obtenir tous les plans
 */
export function getAllPlans() {
  return Object.values(SUBSCRIPTION_PLANS);
}

/**
 * Comparer deux plans
 */
export function comparePlans(plan1Id, plan2Id) {
  const plans = ['FREE', 'PRO', 'ENTERPRISE'];
  const index1 = plans.indexOf(plan1Id.toUpperCase());
  const index2 = plans.indexOf(plan2Id.toUpperCase());
  
  if (index1 === -1 || index2 === -1) return 0;
  
  return index1 - index2;
}

/**
 * Vérifier si un upgrade est nécessaire
 */
export function requiresUpgrade(currentPlan, requiredPlan) {
  return comparePlans(currentPlan, requiredPlan) < 0;
}
