import express from 'express';
import { authenticateToken, requireAdmin } from '../middleware/auth.js';
import {
  getAllPlans,
  getPlanById,
  getSubscription,
  createSubscription,
  updateSubscription,
  getAllPaymentMethods,
  getPaymentMethodById,
  createPaymentTransaction,
  getPaymentTransaction,
  getSetting,
  createNotification
} from '../services/database-sqlite.js';

const router = express.Router();

/**
 * GET /api/subscription-v2/plans
 * Obtenir tous les plans disponibles (PUBLIC)
 */
router.get('/plans', (req, res) => {
  try {
    const plans = getAllPlans();
    
    // Format the plans for frontend
    const formattedPlans = plans.map(plan => ({
      id: plan.id,
      name: plan.name,
      displayName: plan.display_name,
      description: plan.description,
      priceUSD: plan.price_usd,
      priceCDF: plan.price_cdf,
      currency: plan.currency,
      features: {
        maxAICalls: plan.max_ai_calls,
        maxTasks: plan.max_tasks,
        maxStorageMB: plan.max_storage_mb,
        maxProjects: plan.max_projects,
        prioritySupport: plan.has_priority_support === 1,
        advancedAnalytics: plan.has_advanced_analytics === 1,
        customAIKeys: plan.has_custom_ai_keys === 1,
        teamAccess: plan.has_team_access === 1,
        maxTeamMembers: plan.max_team_members
      },
      billingPeriod: plan.billing_period,
      trialDays: plan.trial_days,
      isPopular: plan.name === 'pro'
    }));
    
    res.json({
      success: true,
      plans: formattedPlans
    });
  } catch (error) {
    console.error('Plans fetch error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to fetch plans',
      message: error.message 
    });
  }
});

/**
 * GET /api/subscription-v2/payment-methods
 * Obtenir tous les moyens de paiement (PUBLIC)
 */
router.get('/payment-methods', (req, res) => {
  try {
    const methods = getAllPaymentMethods();
    
    const formattedMethods = methods.map(method => ({
      id: method.id,
      name: method.name,
      code: method.code,
      displayName: method.display_name,
      iconUrl: method.icon_url,
      requiresPhone: method.requires_phone === 1,
      countryCodes: JSON.parse(method.country_codes || '[]'),
      instructions: method.instructions
    }));
    
    res.json({
      success: true,
      paymentMethods: formattedMethods
    });
  } catch (error) {
    console.error('Payment methods fetch error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to fetch payment methods',
      message: error.message 
    });
  }
});

/**
 * GET /api/subscription-v2/settings
 * Obtenir les paramètres publics (PUBLIC)
 */
router.get('/settings', (req, res) => {
  try {
    const paymentPhone = getSetting('payment_phone_number');
    const exchangeRate = getSetting('currency_exchange_rate_usd_cdf');
    
    res.json({
      success: true,
      settings: {
        paymentPhoneNumber: paymentPhone,
        exchangeRateUSDtoCDF: parseFloat(exchangeRate) || 2500
      }
    });
  } catch (error) {
    console.error('Settings fetch error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to fetch settings',
      message: error.message 
    });
  }
});

// Routes authentifiées
router.use(authenticateToken);

/**
 * GET /api/subscription-v2/current
 * Obtenir l'abonnement actuel de l'utilisateur
 */
router.get('/current', (req, res) => {
  try {
    const userId = req.user.id;
    const subscription = getSubscription(userId);
    
    if (!subscription) {
      return res.status(404).json({ 
        success: false,
        error: 'Subscription not found' 
      });
    }
    
    // Format subscription with plan details
    const formatted = {
      id: subscription.id,
      status: subscription.status,
      startDate: subscription.start_date,
      endDate: subscription.end_date,
      trialEndDate: subscription.trial_end_date,
      autoRenew: subscription.auto_renew === 1,
      plan: {
        id: subscription.plan_id,
        name: subscription.name,
        displayName: subscription.display_name,
        priceUSD: subscription.price_usd,
        priceCDF: subscription.price_cdf,
        features: {
          maxAICalls: subscription.max_ai_calls,
          maxTasks: subscription.max_tasks,
          maxStorageMB: subscription.max_storage_mb,
          maxProjects: subscription.max_projects,
          prioritySupport: subscription.has_priority_support === 1,
          advancedAnalytics: subscription.has_advanced_analytics === 1,
          customAIKeys: subscription.has_custom_ai_keys === 1,
          teamAccess: subscription.has_team_access === 1
        }
      }
    };
    
    res.json({
      success: true,
      subscription: formatted
    });
  } catch (error) {
    console.error('Current subscription error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to fetch subscription',
      message: error.message 
    });
  }
});

/**
 * POST /api/subscription-v2/subscribe
 * Initier une nouvelle souscription
 */
router.post('/subscribe', async (req, res) => {
  try {
    const userId = req.user.id;
    const { planId, paymentMethodId, phoneNumber, countryCode, currency } = req.body;
    
    // Validation
    if (!planId || !paymentMethodId || !phoneNumber || !countryCode) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields',
        required: ['planId', 'paymentMethodId', 'phoneNumber', 'countryCode']
      });
    }
    
    // Get plan details
    const plan = getPlanById(planId);
    if (!plan) {
      return res.status(404).json({
        success: false,
        error: 'Plan not found'
      });
    }
    
    // Get payment method details
    const paymentMethod = getPaymentMethodById(paymentMethodId);
    if (!paymentMethod) {
      return res.status(404).json({
        success: false,
        error: 'Payment method not found'
      });
    }
    
    // Check if plan is free
    if (plan.price_usd === 0 && plan.price_cdf === 0) {
      // Directly activate free plan
      updateSubscription(userId, planId, 'active');
      
      return res.json({
        success: true,
        message: 'Free plan activated successfully',
        subscription: getSubscription(userId)
      });
    }
    
    // Calculate amount based on currency
    let amount = plan.price_usd;
    let finalCurrency = currency || 'USD';
    
    if (finalCurrency === 'CDF') {
      amount = plan.price_cdf;
    }
    
    // Create pending subscription
    const subscriptionId = createSubscription(userId, planId);
    
    // Create payment transaction
    const transactionId = createPaymentTransaction({
      userId,
      subscriptionId,
      planId,
      paymentMethodId,
      amount,
      currency: finalCurrency,
      phoneNumber,
      countryCode
    });
    
    // Get transaction details
    const transaction = getPaymentTransaction(transactionId);
    
    // Create admin notification
    const whatsappNumber = getSetting('whatsapp_admin_number');
    
    createNotification({
      type: 'new_payment',
      title: 'Nouveau paiement en attente',
      message: `${req.user.username} (${transaction.email}) souhaite souscrire au plan ${transaction.plan_name}. Montant: ${amount} ${finalCurrency}. Téléphone: ${countryCode}${phoneNumber}`,
      relatedTransactionId: transactionId,
      priority: 'high'
    });
    
    // Generate WhatsApp link
    const whatsappMessage = encodeURIComponent(
      `🆕 NOUVEAU PAIEMENT\n\n` +
      `📦 Plan: ${transaction.plan_name}\n` +
      `👤 Utilisateur: ${req.user.username}\n` +
      `📧 Email: ${transaction.email}\n` +
      `💰 Montant: ${amount} ${finalCurrency}\n` +
      `📱 Téléphone: ${countryCode}${phoneNumber}\n` +
      `💳 Méthode: ${transaction.payment_method_name}\n\n` +
      `🔗 Transaction ID: ${transactionId}\n\n` +
      `Veuillez valider ce paiement dans le panneau d'administration.`
    );
    
    const whatsappLink = `https://wa.me/${whatsappNumber.replace(/\D/g, '')}?text=${whatsappMessage}`;
    
    res.json({
      success: true,
      message: 'Subscription initiated successfully',
      transaction: {
        id: transactionId,
        status: 'pending',
        amount,
        currency: finalCurrency,
        planName: transaction.plan_name,
        paymentMethod: transaction.payment_method_name
      },
      whatsappLink,
      instructions: paymentMethod.instructions
    });
    
  } catch (error) {
    console.error('Subscribe error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to initiate subscription',
      message: error.message 
    });
  }
});

/**
 * GET /api/subscription-v2/transactions
 * Obtenir les transactions de l'utilisateur
 */
router.get('/transactions', async (req, res) => {
  try {
    const userId = req.user.id;
    
    // Import here to avoid circular dependency
    const { db } = await import('../services/database-sqlite.js');
    
    const transactions = db.prepare(`
      SELECT pt.*, pm.display_name as payment_method_name, p.display_name as plan_name
      FROM payment_transactions pt
      JOIN payment_methods pm ON pt.payment_method_id = pm.id
      JOIN subscription_plans p ON pt.plan_id = p.id
      WHERE pt.user_id = ?
      ORDER BY pt.created_at DESC
    `).all(userId);
    
    const formatted = transactions.map(t => ({
      id: t.id,
      planName: t.plan_name,
      paymentMethod: t.payment_method_name,
      amount: t.amount,
      currency: t.currency,
      phoneNumber: t.phone_number,
      countryCode: t.country_code,
      status: t.status,
      validatedAt: t.validated_at,
      createdAt: t.created_at
    }));
    
    res.json({
      success: true,
      transactions: formatted
    });
  } catch (error) {
    console.error('Transactions fetch error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to fetch transactions',
      message: error.message 
    });
  }
});

/**
 * GET /api/subscription-v2/transaction/:transactionId
 * Obtenir les détails d'une transaction
 */
router.get('/transaction/:transactionId', (req, res) => {
  try {
    const userId = req.user.id;
    const { transactionId } = req.params;
    
    const transaction = getPaymentTransaction(transactionId);
    
    if (!transaction) {
      return res.status(404).json({
        success: false,
        error: 'Transaction not found'
      });
    }
    
    // Check if transaction belongs to user (unless admin)
    if (transaction.user_id !== userId && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        error: 'Access denied'
      });
    }
    
    res.json({
      success: true,
      transaction: {
        id: transaction.id,
        planName: transaction.plan_name,
        paymentMethod: transaction.payment_method_name,
        amount: transaction.amount,
        currency: transaction.currency,
        phoneNumber: transaction.phone_number,
        countryCode: transaction.country_code,
        status: transaction.status,
        validatedAt: transaction.validated_at,
        validatedBy: transaction.validated_by,
        validationNotes: transaction.validation_notes,
        createdAt: transaction.created_at
      }
    });
  } catch (error) {
    console.error('Transaction fetch error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to fetch transaction',
      message: error.message 
    });
  }
});

export default router;
