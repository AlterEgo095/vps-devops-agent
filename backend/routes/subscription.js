import express from 'express';
import { authenticateToken } from '../middleware/auth.js';
import { getUsageSummary } from '../middleware/subscription.js';
import { 
  getSubscription, 
  updateSubscription, 
  upgradeSubscription,
  cancelSubscription,
  getPaymentsByUser,
  createPayment
} from '../services/database.js';
import { 
  getAllPlans, 
  getPlanDetails, 
  comparePlans 
} from '../config/subscription-plans.js';

const router = express.Router();

/**
 * GET /api/subscription/plans
 * Obtenir tous les plans disponibles (PUBLIC)
 */
router.get('/plans', (req, res) => {
  try {
    const plans = getAllPlans();
    res.json({
      success: true,
      plans: plans.map(plan => ({
        id: plan.id,
        name: plan.name,
        price: plan.price,
        currency: plan.currency,
        interval: plan.interval,
        description: plan.description,
        features: plan.features,
        highlight: plan.highlight,
        popular: plan.popular,
        contactSales: plan.contactSales
      }))
    });
  } catch (error) {
    console.error('Plans fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch plans' });
  }
});

// Toutes les routes suivantes nécessitent l'authentification
router.use(authenticateToken);

/**
 * GET /api/subscription/current
 * Obtenir l'abonnement actuel de l'utilisateur
 */
router.get('/current', (req, res) => {
  try {
    const userId = req.user.id;
    const subscription = getSubscription(userId);
    
    if (!subscription) {
      return res.status(404).json({ error: 'Subscription not found' });
    }

    const plan = getPlanDetails(subscription.planId);

    res.json({
      success: true,
      subscription: {
        ...subscription,
        planDetails: plan
      }
    });
  } catch (error) {
    console.error('Current subscription error:', error);
    res.status(500).json({ error: 'Failed to fetch subscription' });
  }
});

/**
 * GET /api/subscription/usage
 * Obtenir l'usage actuel de l'utilisateur
 */
router.get('/usage', (req, res) => {
  try {
    const userId = req.user.id;
    const usageSummary = getUsageSummary(userId);

    res.json({
      success: true,
      usage: usageSummary
    });
  } catch (error) {
    console.error('Usage fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch usage' });
  }
});

/**
 * POST /api/subscription/upgrade
 * Mettre à niveau l'abonnement
 */
router.post('/upgrade', async (req, res) => {
  try {
    const userId = req.user.id;
    const { planId, paymentMethodId } = req.body;

    if (!planId) {
      return res.status(400).json({ error: 'Plan ID is required' });
    }

    const currentSubscription = getSubscription(userId);
    const newPlan = getPlanDetails(planId);

    if (!newPlan) {
      return res.status(404).json({ error: 'Plan not found' });
    }

    // Vérifier si c'est un upgrade ou downgrade
    const comparison = comparePlans(currentSubscription.planId, planId);
    
    if (comparison === 0) {
      return res.status(400).json({ 
        error: 'Same plan',
        message: 'Vous êtes déjà sur ce plan'
      });
    }

    if (comparison > 0) {
      return res.status(400).json({
        error: 'Downgrade not allowed',
        message: 'Veuillez nous contacter pour downgrader votre abonnement'
      });
    }

    // Plan Enterprise nécessite un contact commercial
    if (planId.toUpperCase() === 'ENTERPRISE') {
      return res.json({
        success: false,
        requiresContact: true,
        message: 'Le plan Enterprise nécessite un contact avec notre équipe commerciale',
        contactEmail: 'sales@vpsdevopsagent.com'
      });
    }

    // En production, intégrer Stripe ici
    // Pour la démo, on simule le paiement
    if (newPlan.price > 0) {
      // Créer un paiement
      const payment = createPayment(userId, {
        amount: newPlan.price * 100, // en centimes
        currency: newPlan.currency,
        status: 'succeeded', // Simulé
        planId: planId,
        stripePaymentIntentId: `pi_demo_${Date.now()}`
      });

      console.log(`💳 Payment simulated for user ${userId}: ${newPlan.price}€`);
    }

    // Mettre à jour l'abonnement
    const updatedSubscription = upgradeSubscription(userId, planId.toUpperCase(), {
      customerId: `cus_demo_${userId}`,
      subscriptionId: `sub_demo_${Date.now()}`
    });

    console.log(`🎉 User ${userId} upgraded to ${planId}`);

    res.json({
      success: true,
      message: `Abonnement mis à niveau vers ${newPlan.name}`,
      subscription: {
        ...updatedSubscription,
        planDetails: newPlan
      }
    });
  } catch (error) {
    console.error('Upgrade error:', error);
    res.status(500).json({ error: 'Failed to upgrade subscription' });
  }
});

/**
 * POST /api/subscription/cancel
 * Annuler l'abonnement
 */
router.post('/cancel', (req, res) => {
  try {
    const userId = req.user.id;
    const { reason } = req.body;

    const subscription = getSubscription(userId);
    
    if (subscription.planId === 'FREE') {
      return res.status(400).json({
        error: 'Cannot cancel free plan',
        message: 'Vous êtes déjà sur le plan gratuit'
      });
    }

    // Annuler l'abonnement
    const cancelledSubscription = cancelSubscription(userId);

    console.log(`❌ User ${userId} cancelled subscription. Reason: ${reason || 'Not provided'}`);

    res.json({
      success: true,
      message: 'Abonnement annulé avec succès',
      subscription: cancelledSubscription
    });
  } catch (error) {
    console.error('Cancel error:', error);
    res.status(500).json({ error: 'Failed to cancel subscription' });
  }
});

/**
 * GET /api/subscription/payments
 * Obtenir l'historique des paiements
 */
router.get('/payments', (req, res) => {
  try {
    const userId = req.user.id;
    const payments = getPaymentsByUser(userId);

    res.json({
      success: true,
      payments
    });
  } catch (error) {
    console.error('Payments fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch payments' });
  }
});

/**
 * GET /api/subscription/compare
 * Comparer le plan actuel avec un autre
 */
router.get('/compare/:planId', (req, res) => {
  try {
    const userId = req.user.id;
    const { planId } = req.params;

    const currentSubscription = getSubscription(userId);
    const currentPlan = getPlanDetails(currentSubscription.planId);
    const targetPlan = getPlanDetails(planId.toUpperCase());

    if (!targetPlan) {
      return res.status(404).json({ error: 'Plan not found' });
    }

    const comparison = comparePlans(currentSubscription.planId, planId);

    res.json({
      success: true,
      current: {
        id: currentPlan.id,
        name: currentPlan.name,
        price: currentPlan.price
      },
      target: {
        id: targetPlan.id,
        name: targetPlan.name,
        price: targetPlan.price
      },
      comparison: {
        isUpgrade: comparison < 0,
        isDowngrade: comparison > 0,
        isSame: comparison === 0,
        priceDifference: targetPlan.price - currentPlan.price
      },
      featuresDiff: {
        added: getFeaturesDiff(currentPlan, targetPlan).added,
        removed: getFeaturesDiff(currentPlan, targetPlan).removed,
        improved: getFeaturesDiff(currentPlan, targetPlan).improved
      }
    });
  } catch (error) {
    console.error('Compare error:', error);
    res.status(500).json({ error: 'Failed to compare plans' });
  }
});

/**
 * Utilitaire pour comparer les fonctionnalités
 */
function getFeaturesDiff(currentPlan, targetPlan) {
  const added = [];
  const removed = [];
  const improved = [];

  const currentFeatures = currentPlan.features;
  const targetFeatures = targetPlan.features;

  for (const [key, value] of Object.entries(targetFeatures)) {
    const currentValue = currentFeatures[key];
    
    // Nouvelle fonctionnalité
    if (currentValue === false && value === true) {
      added.push(key);
    }
    
    // Fonctionnalité retirée
    if (currentValue === true && value === false) {
      removed.push(key);
    }
    
    // Amélioration numérique
    if (typeof value === 'number' && typeof currentValue === 'number') {
      if (value > currentValue || value === -1) {
        improved.push({ feature: key, from: currentValue, to: value });
      }
    }
  }

  return { added, removed, improved };
}

export default router;
