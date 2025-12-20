import express from 'express';
import rbacDB from '../../services/rbac-database.js';

const router = express.Router();

// Middleware pour vérifier les permissions (sera amélioré plus tard)
const requireAdmin = (req, res, next) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ success: false, error: 'Admin access required' });
  }
  next();
};

// GET /api/v2/users - List users
router.get('/', requireAdmin, async (req, res) => {
  try {
    const { page, limit, role, isActive } = req.query;
    const result = rbacDB.listUsers({ 
      page: parseInt(page) || 1, 
      limit: parseInt(limit) || 20,
      role,
      isActive: isActive !== undefined ? isActive === 'true' : null
    });
    
    await rbacDB.createAuditLog({
      userId: req.user.id,
      action: 'read',
      resource: 'users',
      ipAddress: req.ip,
      userAgent: req.get('user-agent')
    });
    
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/v2/users - Create user
router.post('/', requireAdmin, async (req, res) => {
  try {
    const { username, email, password, role } = req.body;
    
    if (!username || !email || !password) {
      return res.status(400).json({ success: false, error: 'Missing required fields' });
    }
    
    const user = await rbacDB.createUser({ username, email, password, role });
    
    await rbacDB.createAuditLog({
      userId: req.user.id,
      action: 'create',
      resource: 'users',
      resourceId: user.id.toString(),
      details: { username, email, role },
      ipAddress: req.ip,
      userAgent: req.get('user-agent')
    });
    
    res.json({ success: true, data: user });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/v2/users/:id - Get user
router.get('/:id', async (req, res) => {
  try {
    const userId = parseInt(req.params.id);
    
    // Users can only view their own profile, admins can view all
    if (req.user.role !== 'admin' && req.user.id !== userId) {
      return res.status(403).json({ success: false, error: 'Forbidden' });
    }
    
    const user = rbacDB.getUserById(userId);
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }
    
    res.json({ success: true, data: user });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// PUT /api/v2/users/:id - Update user
router.put('/:id', async (req, res) => {
  try {
    const userId = parseInt(req.params.id);
    const { username, email, role, isActive } = req.body;
    
    // Users can update their own profile (except role), admins can update all
    if (req.user.role !== 'admin' && req.user.id !== userId) {
      return res.status(403).json({ success: false, error: 'Forbidden' });
    }
    
    if (req.user.role !== 'admin' && (role !== undefined || isActive !== undefined)) {
      return res.status(403).json({ success: false, error: 'Cannot modify role or status' });
    }
    
    const user = rbacDB.updateUser(userId, { username, email, role, isActive });
    
    await rbacDB.createAuditLog({
      userId: req.user.id,
      action: 'update',
      resource: 'users',
      resourceId: userId.toString(),
      details: { username, email, role, isActive },
      ipAddress: req.ip,
      userAgent: req.get('user-agent')
    });
    
    res.json({ success: true, data: user });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// DELETE /api/v2/users/:id - Delete user
router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    const userId = parseInt(req.params.id);
    
    // Cannot delete self
    if (req.user.id === userId) {
      return res.status(400).json({ success: false, error: 'Cannot delete your own account' });
    }
    
    const deleted = rbacDB.deleteUser(userId);
    if (!deleted) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }
    
    await rbacDB.createAuditLog({
      userId: req.user.id,
      action: 'delete',
      resource: 'users',
      resourceId: userId.toString(),
      ipAddress: req.ip,
      userAgent: req.get('user-agent')
    });
    
    res.json({ success: true, message: 'User deleted' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/v2/users/:id/activate - Toggle user active status
router.post('/:id/activate', requireAdmin, async (req, res) => {
  try {
    const userId = parseInt(req.params.id);
    const { isActive } = req.body;
    
    const user = rbacDB.updateUser(userId, { isActive });
    
    await rbacDB.createAuditLog({
      userId: req.user.id,
      action: isActive ? 'activate' : 'deactivate',
      resource: 'users',
      resourceId: userId.toString(),
      ipAddress: req.ip,
      userAgent: req.get('user-agent')
    });
    
    res.json({ success: true, data: user });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/v2/users/stats - Get user statistics
router.get('/stats/all', requireAdmin, async (req, res) => {
  try {
    const stats = rbacDB.getUserStats();
    res.json({ success: true, data: stats });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
