import express from 'express';
import { authenticateToken, requireAdmin } from '../middleware/auth.js';
import { validateBody, validateParams } from '../middleware/validate.js';
import { updateUserSchema, validatePaymentSchema, updateSettingSchema, createAiKeySchema, userIdParamSchema, transactionIdParamSchema, settingKeyParamSchema, aiKeyIdParamSchema } from '../middleware/validation-schemas.js';
import {
  getAllUsers,
  getUserById,
  updateUser,
  getAllPlans,
  getPlanById,
  getPendingPayments,
  validatePayment,
  rejectPayment,
  getPaymentTransaction,
  getAllPaymentMethods,
  getAllSettings,
  updateSetting,
  getSetting,
  getDashboardStats,
  getUnreadNotifications,
  markNotificationAsRead,
  db
} from '../services/database-sqlite.js';

const router = express.Router();

// All routes require admin authentication
router.use(authenticateToken);
router.use(requireAdmin);

/**
 * GET /api/admin/dashboard
 * Get dashboard statistics
 */
router.get('/dashboard', (req, res) => {
  try {
    const stats = getDashboardStats();
    
    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    console.error('Dashboard stats error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to fetch dashboard stats',
      message: error.message 
    });
  }
});

/**
 * GET /api/admin/users
 * Get all users with their subscription details
 */
router.get('/users', (req, res) => {
  try {
    const { page = 1, limit = 50, search, role, status } = req.query;
    
    let query = `
      SELECT u.*, s.plan_id, s.status as subscription_status, sp.display_name as plan_name
      FROM users u
      LEFT JOIN subscriptions s ON u.id = s.user_id AND s.status = 'active'
      LEFT JOIN subscription_plans sp ON s.plan_id = sp.id
      WHERE 1=1
    `;
    const params = [];
    
    if (search) {
      query += ` AND (u.username LIKE ? OR u.email LIKE ?)`;
      params.push(`%${search}%`, `%${search}%`);
    }
    
    if (role) {
      query += ` AND u.role = ?`;
      params.push(role);
    }
    
    if (status) {
      query += ` AND u.is_active = ?`;
      params.push(status === 'active' ? 1 : 0);
    }
    
    query += ` ORDER BY u.created_at DESC`;
    
    // Pagination
    const offset = (page - 1) * limit;
    query += ` LIMIT ? OFFSET ?`;
    params.push(parseInt(limit), offset);
    
    const users = db.prepare(query).all(...params);
    
    // Get total count
    let countQuery = `SELECT COUNT(*) as total FROM users WHERE 1=1`;
    const countParams = [];
    
    if (search) {
      countQuery += ` AND (username LIKE ? OR email LIKE ?)`;
      countParams.push(`%${search}%`, `%${search}%`);
    }
    
    if (role) {
      countQuery += ` AND role = ?`;
      countParams.push(role);
    }
    
    if (status) {
      countQuery += ` AND is_active = ?`;
      countParams.push(status === 'active' ? 1 : 0);
    }
    
    const { total } = db.prepare(countQuery).get(...countParams);
    
    res.json({
      success: true,
      data: {
        users: users.map(u => ({
        id: u.id,
        username: u.username,
        email: u.email,
        role: u.role,
        phoneNumber: u.phone_number,
        countryCode: u.country_code,
        isActive: u.is_active === 1,
        createdAt: u.created_at,
        lastLogin: u.last_login,
        currentPlan: u.plan_name || 'Aucun',
        subscriptionStatus: u.subscription_status || 'inactive'
      })),
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / limit)
      }
      }
    });
  } catch (error) {
    console.error('Users fetch error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to fetch users',
      message: error.message 
    });
  }
});

/**
 * GET /api/admin/users/:userId
 * Get detailed user information
 */
router.get('/users/:userId', (req, res) => {
  try {
    const { userId } = req.params;
    
    const user = getUserById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }
    
    // Get user's subscription
    const subscription = db.prepare(`
      SELECT s.*, sp.*
      FROM subscriptions s
      JOIN subscription_plans sp ON s.plan_id = sp.id
      WHERE s.user_id = ?
      ORDER BY s.created_at DESC
      LIMIT 1
    `).get(userId);
    
    // Get user's transactions
    const transactions = db.prepare(`
      SELECT pt.*, pm.display_name as payment_method_name, sp.display_name as plan_name
      FROM payment_transactions pt
      JOIN payment_methods pm ON pt.payment_method_id = pm.id
      JOIN subscription_plans sp ON pt.plan_id = sp.id
      WHERE pt.user_id = ?
      ORDER BY pt.created_at DESC
    `).all(userId);
    
    res.json({
      success: true,
      user: {
        ...user,
        password_hash: undefined // Remove sensitive data
      },
      subscription,
      transactions
    });
  } catch (error) {
    console.error('User detail error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to fetch user details',
      message: error.message 
    });
  }
});

/**
 * PUT /api/admin/users/:userId
 * Update user details
 */
router.put('/users/:userId', validateParams(userIdParamSchema), validateBody(updateUserSchema), (req, res) => {
  try {
    const { userId } = req.params;
    const updates = req.body;
    
    // Remove fields that shouldn't be updated directly
    delete updates.id;
    delete updates.password_hash;
    delete updates.created_at;
    
    const updatedUser = updateUser(userId, updates);
    
    if (!updatedUser) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }
    
    res.json({
      success: true,
      message: 'User updated successfully',
      user: {
        ...updatedUser,
        password_hash: undefined
      }
    });
  } catch (error) {
    console.error('User update error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to update user',
      message: error.message 
    });
  }
});

/**
 * GET /api/admin/payments/pending
 * Get all pending payments
 */
router.get('/payments/pending', (req, res) => {
  try {
    const payments = getPendingPayments();
    
    const formatted = payments.map(p => ({
      id: p.id,
      user: {
        id: p.user_id,
        username: p.username,
        email: p.email
      },
      plan: {
        id: p.plan_id,
        name: p.plan_name
      },
      paymentMethod: p.payment_method_name,
      amount: p.amount,
      currency: p.currency,
      phoneNumber: `${p.country_code}${p.phone_number}`,
      status: p.status,
      createdAt: p.created_at
    }));
    
    res.json({
      success: true,
      payments: formatted
    });
  } catch (error) {
    console.error('Pending payments error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to fetch pending payments',
      message: error.message 
    });
  }
});

/**
 * POST /api/admin/payments/:transactionId/validate
 * Validate a payment and activate subscription
 */
router.post('/payments/:transactionId/validate', validateParams(transactionIdParamSchema), validateBody(validatePaymentSchema), (req, res) => {
  try {
    const { transactionId } = req.params;
    const { notes } = req.body;
    const adminId = req.user.id;
    
    const transaction = getPaymentTransaction(transactionId);
    
    if (!transaction) {
      return res.status(404).json({
        success: false,
        error: 'Transaction not found'
      });
    }
    
    if (transaction.status !== 'pending') {
      return res.status(400).json({
        success: false,
        error: 'Transaction is not pending',
        currentStatus: transaction.status
      });
    }
    
    const validatedTransaction = validatePayment(transactionId, adminId, notes);
    
    res.json({
      success: true,
      message: 'Payment validated and subscription activated',
      transaction: validatedTransaction
    });
  } catch (error) {
    console.error('Payment validation error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to validate payment',
      message: error.message 
    });
  }
});

/**
 * POST /api/admin/payments/:transactionId/reject
 * Reject a payment
 */
router.post('/payments/:transactionId/reject', validateParams(transactionIdParamSchema), validateBody(validatePaymentSchema), (req, res) => {
  try {
    const { transactionId } = req.params;
    const { notes } = req.body;
    const adminId = req.user.id;
    
    const transaction = getPaymentTransaction(transactionId);
    
    if (!transaction) {
      return res.status(404).json({
        success: false,
        error: 'Transaction not found'
      });
    }
    
    if (transaction.status !== 'pending') {
      return res.status(400).json({
        success: false,
        error: 'Transaction is not pending',
        currentStatus: transaction.status
      });
    }
    
    const rejectedTransaction = rejectPayment(transactionId, adminId, notes);
    
    res.json({
      success: true,
      message: 'Payment rejected',
      transaction: rejectedTransaction
    });
  } catch (error) {
    console.error('Payment rejection error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to reject payment',
      message: error.message 
    });
  }
});

/**
 * GET /api/admin/payments
 * Get all payment transactions with filters
 */
router.get('/payments', (req, res) => {
  try {
    const { status, userId, page = 1, limit = 50 } = req.query;
    
    let query = `
      SELECT pt.*, u.username, u.email, pm.display_name as payment_method_name, sp.display_name as plan_name
      FROM payment_transactions pt
      JOIN users u ON pt.user_id = u.id
      JOIN payment_methods pm ON pt.payment_method_id = pm.id
      JOIN subscription_plans sp ON pt.plan_id = sp.id
      WHERE 1=1
    `;
    const params = [];
    
    if (status) {
      query += ` AND pt.status = ?`;
      params.push(status);
    }
    
    if (userId) {
      query += ` AND pt.user_id = ?`;
      params.push(userId);
    }
    
    query += ` ORDER BY pt.created_at DESC`;
    
    // Pagination
    const offset = (page - 1) * limit;
    query += ` LIMIT ? OFFSET ?`;
    params.push(parseInt(limit), offset);
    
    const payments = db.prepare(query).all(...params);
    
    res.json({
      success: true,
      payments
    });
  } catch (error) {
    console.error('Payments fetch error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to fetch payments',
      message: error.message 
    });
  }
});

/**
 * GET /api/admin/settings
 * Get all platform settings
 */
router.get('/settings', (req, res) => {
  try {
    const settings = getAllSettings();
    
    // Group by category
    const grouped = settings.reduce((acc, setting) => {
      const category = setting.category || 'general';
      if (!acc[category]) {
        acc[category] = [];
      }
      acc[category].push(setting);
      return acc;
    }, {});
    
    res.json({
      success: true,
      settings: grouped
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

/**
 * PUT /api/admin/settings/:key
 * Update a platform setting
 */
router.put('/settings/:key', validateParams(settingKeyParamSchema), validateBody(updateSettingSchema), (req, res) => {
  try {
    const { key } = req.params;
    const { value } = req.body;
    const adminId = req.user.id;
    
    if (value === undefined) {
      return res.status(400).json({
        success: false,
        error: 'Value is required'
      });
    }
    
    updateSetting(key, value, adminId);
    
    res.json({
      success: true,
      message: 'Setting updated successfully',
      setting: {
        key,
        value
      }
    });
  } catch (error) {
    console.error('Setting update error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to update setting',
      message: error.message 
    });
  }
});

/**
 * GET /api/admin/payment-methods
 * Get all payment methods (including inactive)
 */
router.get('/payment-methods', (req, res) => {
  try {
    const methods = db.prepare('SELECT * FROM payment_methods ORDER BY display_order').all();
    
    res.json({
      success: true,
      paymentMethods: methods
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
 * PUT /api/admin/payment-methods/:methodId
 * Update payment method
 */
router.put('/payment-methods/:methodId', (req, res) => {
  try {
    const { methodId } = req.params;
    const updates = req.body;
    
    // Whitelist allowed columns to prevent SQL injection via column names
    const allowedFields = ['name', 'code', 'display_name', 'icon_url', 'requires_phone', 'country_codes', 'instructions', 'display_order', 'is_active'];
    const fields = [];
    const values = [];
    
    for (const [key, value] of Object.entries(updates)) {
      if (allowedFields.includes(key)) {
        fields.push(`${key} = ?`);
        values.push(value);
      }
    }
    
    if (fields.length === 0) {
      return res.status(400).json({ success: false, error: 'No valid fields to update' });
    }
    
    values.push(methodId);
    
    db.prepare(`
      UPDATE payment_methods SET ${fields.join(', ')}, updated_at = datetime('now') WHERE id = ?
    `).run(...values);
    
    const updated = db.prepare('SELECT * FROM payment_methods WHERE id = ?').get(methodId);
    
    res.json({
      success: true,
      message: 'Payment method updated successfully',
      paymentMethod: updated
    });
  } catch (error) {
    console.error('Payment method update error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to update payment method',
      message: error.message 
    });
  }
});

/**
 * GET /api/admin/plans
 * Get all subscription plans
 */
router.get('/plans', (req, res) => {
  try {
    const plans = db.prepare('SELECT * FROM subscription_plans ORDER BY display_order').all();
    
    res.json({
      success: true,
      plans
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
 * PUT /api/admin/plans/:planId
 * Update subscription plan
 */
router.put('/plans/:planId', (req, res) => {
  try {
    const { planId } = req.params;
    const updates = req.body;
    
    // Whitelist allowed columns to prevent SQL injection via column names
    const allowedFields = ['name', 'display_name', 'description', 'price_usd', 'price_cdf', 'max_ai_calls', 'max_tasks', 'max_storage_mb', 'max_projects', 'has_priority_support', 'has_advanced_analytics', 'has_custom_ai_keys', 'has_team_access', 'trial_days', 'display_order', 'is_active'];
    const fields = [];
    const values = [];
    
    for (const [key, value] of Object.entries(updates)) {
      if (allowedFields.includes(key)) {
        fields.push(`${key} = ?`);
        values.push(value);
      }
    }
    
    if (fields.length === 0) {
      return res.status(400).json({ success: false, error: 'No valid fields to update' });
    }
    
    values.push(planId);
    
    db.prepare(`
      UPDATE subscription_plans SET ${fields.join(', ')}, updated_at = datetime('now') WHERE id = ?
    `).run(...values);
    
    const updated = db.prepare('SELECT * FROM subscription_plans WHERE id = ?').get(planId);
    
    res.json({
      success: true,
      message: 'Plan updated successfully',
      plan: updated
    });
  } catch (error) {
    console.error('Plan update error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to update plan',
      message: error.message 
    });
  }
});

/**
 * GET /api/admin/notifications
 * Get admin notifications
 */
router.get('/notifications', (req, res) => {
  try {
    const notifications = getUnreadNotifications();
    
    res.json({
      success: true,
      notifications
    });
  } catch (error) {
    console.error('Notifications fetch error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to fetch notifications',
      message: error.message 
    });
  }
});

/**
 * PUT /api/admin/notifications/:notificationId/read
 * Mark notification as read
 */
router.put('/notifications/:notificationId/read', (req, res) => {
  try {
    const { notificationId } = req.params;
    
    markNotificationAsRead(notificationId);
    
    res.json({
      success: true,
      message: 'Notification marked as read'
    });
  } catch (error) {
    console.error('Notification update error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to update notification',
      message: error.message 
    });
  }
});

/**
 * GET /api/admin/ai-keys
 * Get all AI keys
 */
router.get('/ai-keys', (req, res) => {
  try {
    const keys = db.prepare(`
      SELECT ak.*, u.username
      FROM ai_keys ak
      LEFT JOIN users u ON ak.user_id = u.id
      ORDER BY ak.is_default DESC, ak.created_at DESC
    `).all();
    
    // Mask API keys for security
    const masked = keys.map(k => ({
      ...k,
      api_key: k.api_key ? k.api_key.substring(0, 10) + '...' : null,
      api_secret: k.api_secret ? '***' : null
    }));
    
    res.json({
      success: true,
      aiKeys: masked
    });
  } catch (error) {
    console.error('AI keys fetch error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to fetch AI keys',
      message: error.message 
    });
  }
});

/**
 * POST /api/admin/ai-keys
 * Add new AI key
 */
router.post('/ai-keys', validateBody(createAiKeySchema), (req, res) => {
  try {
    const { provider, apiKey, apiSecret, name, userId, isDefault, monthlyLimitUSD } = req.body;
    
    if (!provider || !apiKey) {
      return res.status(400).json({
        success: false,
        error: 'Provider and API key are required'
      });
    }
    
    const keyId = 'aikey_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    
    db.prepare(`
      INSERT INTO ai_keys (id, user_id, provider, api_key, api_secret, name, is_default, monthly_limit_usd)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(keyId, userId || null, provider, apiKey, apiSecret || null, name || null, isDefault ? 1 : 0, monthlyLimitUSD || null);
    
    res.json({
      success: true,
      message: 'AI key added successfully',
      keyId
    });
  } catch (error) {
    console.error('AI key creation error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to add AI key',
      message: error.message 
    });
  }
});

/**
 * DELETE /api/admin/ai-keys/:keyId
 * Delete AI key
 */
router.delete('/ai-keys/:keyId', validateParams(aiKeyIdParamSchema), (req, res) => {
  try {
    const { keyId } = req.params;
    
    db.prepare('DELETE FROM ai_keys WHERE id = ?').run(keyId);
    
    res.json({
      success: true,
      message: 'AI key deleted successfully'
    });
  } catch (error) {
    console.error('AI key deletion error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to delete AI key',
      message: error.message 
    });
  }
});

export default router;
