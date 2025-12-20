import express from 'express';
import rbacDB from '../../services/rbac-database.js';

const router = express.Router();

const requireAdmin = (req, res, next) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ success: false, error: 'Admin access required' });
  }
  next();
};

// GET /api/v2/audit - Get audit logs
router.get('/', requireAdmin, async (req, res) => {
  try {
    const { page, limit, userId, action, resource, status, startDate, endDate } = req.query;
    
    const result = rbacDB.getAuditLogs({
      page: parseInt(page) || 1,
      limit: parseInt(limit) || 50,
      userId: userId ? parseInt(userId) : null,
      action,
      resource,
      status,
      startDate,
      endDate
    });
    
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/v2/audit/me - Get current user's audit logs
router.get('/me', async (req, res) => {
  try {
    const { page, limit, action, resource } = req.query;
    
    const result = rbacDB.getAuditLogs({
      page: parseInt(page) || 1,
      limit: parseInt(limit) || 50,
      userId: req.user.id,
      action,
      resource
    });
    
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/v2/audit/:userId - Get specific user audit logs
router.get('/:userId', async (req, res) => {
  try {
    const userId = parseInt(req.params.userId);
    
    // Users can only view their own audit, admins can view all
    if (req.user.role !== 'admin' && req.user.id !== userId) {
      return res.status(403).json({ success: false, error: 'Forbidden' });
    }
    
    const { page, limit, action, resource } = req.query;
    
    const result = rbacDB.getAuditLogs({
      page: parseInt(page) || 1,
      limit: parseInt(limit) || 50,
      userId,
      action,
      resource
    });
    
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/v2/audit/summary/all - Get audit summary
router.get('/summary/all', requireAdmin, async (req, res) => {
  try {
    const summary = rbacDB.getAuditSummary();
    res.json({ success: true, data: summary });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/v2/audit/stats/dashboard - Get dashboard stats
router.get('/stats/dashboard', requireAdmin, async (req, res) => {
  try {
    const stats = rbacDB.getDashboardStats();
    res.json({ success: true, data: stats });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
