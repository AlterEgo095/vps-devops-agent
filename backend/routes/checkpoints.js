/**
 * ============================================================
 * Checkpoints API Routes
 * ============================================================
 * Git checkpoint management for safe state management
 */

import express from 'express';
import { authenticateToken } from '../middleware/auth.js';
import checkpointManager from '../services/checkpoints/manager.js';
import { db } from '../services/database-sqlite.js';

const router = express.Router();
router.use(authenticateToken);

/**
 * GET /api/checkpoints/:serverId
 * List all checkpoints for a server
 */
router.get('/:serverId', (req, res) => {
  const { serverId } = req.params;
  const { limit, status } = req.query;

  const checkpoints = checkpointManager.list(parseInt(serverId), { limit: parseInt(limit) || 20, status });
  res.json({ success: true, checkpoints, count: checkpoints.length });
});

/**
 * POST /api/checkpoints/:serverId/create
 * Manually create a checkpoint
 */
router.post('/:serverId/create', async (req, res) => {
  try {
    const { serverId } = req.params;
    const userId = req.user?.id || 'unknown';

    // Get server config
    const server = db.prepare('SELECT * FROM servers WHERE id = ? AND user_id = ?').get(serverId, userId);
    if (!server) {
      return res.status(404).json({ success: false, error: 'Server not found' });
    }

    const serverConfig = {
      host: server.host,
      port: server.port || 22,
      username: server.username,
      password: Buffer.from(server.encrypted_credentials, 'base64').toString()
    };

    const result = await checkpointManager.create(serverConfig, {
      serverId: parseInt(serverId),
      toolName: 'manual',
      riskLevel: 'MANUAL',
      userId
    });

    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/checkpoints/:id/rollback
 * Rollback to a specific checkpoint
 */
router.post('/:id/rollback', async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id || 'unknown';

    // Get checkpoint to find server
    const checkpoint = db.prepare('SELECT * FROM git_checkpoints WHERE id = ?').get(id);
    if (!checkpoint) {
      return res.status(404).json({ success: false, error: 'Checkpoint not found' });
    }

    // Get server config
    const server = db.prepare('SELECT * FROM servers WHERE id = ?').get(checkpoint.server_id);
    if (!server) {
      return res.status(404).json({ success: false, error: 'Server not found' });
    }

    const serverConfig = {
      host: server.host,
      port: server.port || 22,
      username: server.username,
      password: Buffer.from(server.encrypted_credentials, 'base64').toString()
    };

    const result = await checkpointManager.rollback(parseInt(id), serverConfig, userId);
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/checkpoints/:serverId/latest
 * Get the most recent active checkpoint
 */
router.get('/:serverId/latest', (req, res) => {
  const { serverId } = req.params;

  try {
    const latest = db.prepare(`
      SELECT * FROM git_checkpoints
      WHERE server_id = ? AND status = 'active'
      ORDER BY created_at DESC LIMIT 1
    `).get(parseInt(serverId));

    res.json({ success: true, checkpoint: latest || null });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
