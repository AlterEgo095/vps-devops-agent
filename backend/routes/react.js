/**
 * ============================================================
 * ReAct Agent API Routes
 * ============================================================
 * Iterative AI reasoning + action execution
 */

import express from 'express';
import { authenticateToken } from '../middleware/auth.js';
import reactOrchestrator from '../services/react/orchestrator.js';
import { db } from '../services/database-sqlite.js';
import crypto from 'crypto';

const router = express.Router();
router.use(authenticateToken);

/**
 * Helper: Decrypt server credentials
 */
function getServerConfig(server, userId) {
  const config = {
    host: server.host,
    port: server.port || 22,
    username: server.username
  };

  const secret = process.env.JWT_SECRET || 'default-secret';
  try {
    if (server.encrypted_credentials?.includes(':')) {
      const [ivHex, encryptedHex] = server.encrypted_credentials.split(':');
      const iv = Buffer.from(ivHex, 'hex');
      const key = crypto.scryptSync(secret, 'salt', 32);
      const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
      let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      config.password = decrypted;
    } else {
      config.password = Buffer.from(server.encrypted_credentials, 'base64').toString();
    }
  } catch {
    config.password = Buffer.from(server.encrypted_credentials || '', 'base64').toString();
  }

  return config;
}

/**
 * POST /api/ai/agent/react
 * Start a ReAct execution
 */
router.post('/', async (req, res) => {
  try {
    const userId = req.user?.id || 'unknown';
    const { request, serverId, maxIterations } = req.body;

    if (!request) {
      return res.status(400).json({ success: false, error: 'request is required' });
    }

    // Get server config if serverId provided
    let serverConfig = null;
    if (serverId) {
      const server = db.prepare('SELECT * FROM servers WHERE id = ? AND user_id = ?').get(serverId, userId);
      if (!server) {
        return res.status(404).json({ success: false, error: 'Server not found' });
      }
      serverConfig = getServerConfig(server, userId);
    }

    const result = await reactOrchestrator.execute(request, serverConfig, {
      userId,
      serverId,
      maxIterations: maxIterations || 10
    });

    res.json(result);
  } catch (error) {
    console.error('ReAct execution error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/ai/agent/react/:executionId
 * Get status/progress of a running ReAct execution
 */
router.get('/:executionId', (req, res) => {
  const { executionId } = req.params;
  const status = reactOrchestrator.getExecutionStatus(parseInt(executionId));

  if (!status) {
    return res.status(404).json({ success: false, error: 'Execution not found' });
  }

  res.json({ success: true, execution: status });
});

/**
 * GET /api/ai/agent/react/:executionId/iterations
 * Get all iterations of a ReAct execution
 */
router.get('/:executionId/iterations', (req, res) => {
  const { executionId } = req.params;
  const iterations = reactOrchestrator.getExecutionIterations(parseInt(executionId));

  res.json({ success: true, iterations, count: iterations.length });
});

export default router;
