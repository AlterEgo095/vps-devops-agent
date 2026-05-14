/**
 * ============================================================
 * Tools API Routes
 * ============================================================
 * List, inspect, and execute registered tools
 */

import express from 'express';
import { decryptPassword } from '../services/crypto-manager.js';
import { authenticateToken } from '../middleware/auth.js';
import { registry, executor } from '../services/tools/index.js';

const router = express.Router();

// Apply authentication to all routes
router.use(authenticateToken);

/**
 * GET /api/tools
 * List all registered tools
 */
router.get('/', (req, res) => {
  const tools = registry.getAll().map(t => ({
    name: t.name,
    description: t.description,
    category: t.category,
    risk_level: t.risk_level,
    needs_approval: t.needs_approval,
    is_enabled: t.is_enabled,
    parameters: t.parameters
  }));

  res.json({
    success: true,
    tools,
    stats: registry.getStats()
  });
});

/**
 * GET /api/tools/:name
 * Get tool details + schema
 */
router.get('/:name', (req, res) => {
  const tool = registry.get(req.params.name);

  if (!tool) {
    return res.status(404).json({ success: false, error: 'Tool not found' });
  }

  res.json({
    success: true,
    tool: {
      name: tool.name,
      description: tool.description,
      category: tool.category,
      risk_level: tool.risk_level,
      needs_approval: tool.needs_approval,
      is_enabled: tool.is_enabled,
      parameters: tool.parameters
    },
    openai_format: {
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters
      }
    }
  });
});

/**
 * POST /api/tools/:name/execute
 * Execute a specific tool
 */
router.post('/:name/execute', async (req, res) => {
  try {
    const { name } = req.params;
    const { args, serverId, serverConfig } = req.body;
    const userId = req.user?.id || 'unknown';

    if (!registry.isAvailable(name)) {
      return res.status(404).json({
        success: false,
        error: registry.get(name) ? 'Tool is disabled' : 'Tool not found'
      });
    }

    const tool = registry.get(name);

    // Build server config
    let config = serverConfig;
    if (!config && serverId) {
      const { db } = await import('../services/database-sqlite.js');
      const server = db.prepare('SELECT * FROM servers WHERE id = ? AND user_id = ?').get(serverId, userId);
      if (!server) {
        return res.status(404).json({ success: false, error: 'Server not found' });
      }
      // Decrypt credentials
      config = { host: server.host, port: server.port || 22, username: server.username, password: decryptPassword(server.encrypted_credentials) };
    }

    const result = await executor.execute(name, args || {}, config, {
      userId,
      serverId,
      approvedBy: null
    });

    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * PUT /api/tools/:name/toggle
 * Enable/disable a tool
 */
router.put('/:name/toggle', (req, res) => {
  const { name } = req.params;
  const { enabled } = req.body;

  try {
    registry.toggle(name, enabled);
    res.json({ success: true, name, enabled });
  } catch (error) {
    res.status(404).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/tools/invocations
 * Get tool invocation history
 */
router.get('/invocations/history', async (req, res) => {
  try {
    const { db } = await import('../services/database-sqlite.js');
    const userId = req.user?.id || 'unknown';
    const { limit = 50 } = req.query;

    const history = db.prepare(`
      SELECT * FROM tool_invocations
      WHERE user_id = ?
      ORDER BY created_at DESC
      LIMIT ?
    `).all(userId, parseInt(limit));

    res.json({ success: true, history, count: history.length });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
