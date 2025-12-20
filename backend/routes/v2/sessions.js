import express from 'express';
import rbacDB from '../../services/rbac-database.js';

const router = express.Router();

const requireAdmin = (req, res, next) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ success: false, error: 'Admin access required' });
  }
  next();
};

// GET /api/v2/sessions - List sessions
router.get('/', async (req, res) => {
  try {
    let sessions;
    
    if (req.user.role === 'admin') {
      // Admin can see all sessions
      sessions = rbacDB.listActiveSessions();
    } else {
      // Users can only see their own sessions
      sessions = rbacDB.listUserSessions(req.user.id, true);
    }
    
    res.json({ success: true, data: sessions });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/v2/sessions/:id - Get specific session
router.get('/:id', async (req, res) => {
  try {
    const sessionId = parseInt(req.params.id);
    const sessions = rbacDB.listUserSessions(req.user.id);
    const session = sessions.find(s => s.id === sessionId);
    
    if (!session && req.user.role !== 'admin') {
      return res.status(404).json({ success: false, error: 'Session not found' });
    }
    
    res.json({ success: true, data: session });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// DELETE /api/v2/sessions/:id - Revoke session
router.delete('/:id', async (req, res) => {
  try {
    const sessionId = parseInt(req.params.id);
    
    // Check if user owns this session or is admin
    const sessions = rbacDB.listUserSessions(req.user.id);
    const ownsSession = sessions.some(s => s.id === sessionId);
    
    if (!ownsSession && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, error: 'Forbidden' });
    }
    
    const revoked = rbacDB.revokeSession(sessionId, req.user.id);
    
    if (revoked) {
      await rbacDB.createAuditLog({
        userId: req.user.id,
        action: 'revoke',
        resource: 'sessions',
        resourceId: sessionId.toString(),
        ipAddress: req.ip,
        userAgent: req.get('user-agent')
      });
    }
    
    res.json({ success: true, message: 'Session revoked' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/v2/sessions/revoke-all - Revoke all user sessions
router.post('/revoke-all', async (req, res) => {
  try {
    const { userId } = req.body;
    const targetUserId = userId || req.user.id;
    
    // Can only revoke all for self or if admin
    if (targetUserId !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, error: 'Forbidden' });
    }
    
    const count = rbacDB.revokeAllUserSessions(targetUserId, req.user.id);
    
    await rbacDB.createAuditLog({
      userId: req.user.id,
      action: 'revoke',
      resource: 'sessions',
      details: { count, targetUserId },
      ipAddress: req.ip,
      userAgent: req.get('user-agent')
    });
    
    res.json({ success: true, message: `${count} sessions revoked` });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/v2/sessions/clean - Clean expired sessions (admin only)
router.post('/clean', requireAdmin, async (req, res) => {
  try {
    const count = rbacDB.cleanExpiredSessions();
    
    await rbacDB.createAuditLog({
      userId: req.user.id,
      action: 'delete',
      resource: 'sessions',
      details: { cleaned: count },
      ipAddress: req.ip,
      userAgent: req.get('user-agent')
    });
    
    res.json({ success: true, message: `${count} expired sessions cleaned` });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
