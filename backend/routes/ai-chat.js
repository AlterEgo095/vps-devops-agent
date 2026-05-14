/**
 * ============================================================
 * AI Chat Routes — Natural Language → ReAct Orchestrator
 * ============================================================
 *
 * V2: Uses the ReAct orchestrator + structured tools instead of
 * raw Bash generation. The AI agent now operates fully autonomously
 * through the tool system — never executing raw Bash directly.
 *
 * @module AiChatRoutes
 * @version 2.1.0
 */

import express from 'express';
import { decryptPassword } from '../services/crypto-manager.js';
import { db } from '../services/database-sqlite.js';
import { authenticateToken } from '../middleware/auth.js';
import reactOrchestrator from '../services/react/orchestrator.js';
import logger from '../config/logger.js';

const router = express.Router();

// Apply authentication
router.use(authenticateToken);

/**
 * Decrypt server credentials
 * @param {string} encryptedCredentials
 * @param {string} secret
 * @returns {string}
 */
// decryptPassword imported from crypto-manager.js

/**
 * Build serverConfig from a server DB row
 * @param {Object} server
 * @returns {Object} serverConfig
 */
function buildServerConfig(server) {
  return {
    host: server.host,
    port: server.port || 22,
    username: server.username,
    password: decryptPassword(server.encrypted_credentials)
  };
}

/**
 * POST /api/ai/agent/chat
 * Natural language chat → ReAct orchestrator → structured tool execution
 */
router.post('/chat', async (req, res) => {
  try {
    const userId = req.user.id;
    const { message, serverId, context } = req.body;

    logger.info(`[AI Chat] Request — userId: ${userId}, serverId: ${serverId}, message: "${message?.substring(0, 100)}"`);

    // Validation
    if (!message) {
      return res.status(400).json({
        success: false,
        error: 'Message is required'
      });
    }

    if (!serverId) {
      return res.status(400).json({
        success: false,
        error: 'Server ID is required. Please select a server first.'
      });
    }

    // Get server from database
    const server = db.prepare(`
      SELECT * FROM servers
      WHERE id = ? AND user_id = ?
    `).get(serverId, userId);

    if (!server) {
      return res.status(404).json({
        success: false,
        error: 'Server not found'
      });
    }

    // Build server config with decrypted credentials
    const serverConfig = buildServerConfig(server);

    // Use ReAct orchestrator instead of raw Bash
    const result = await reactOrchestrator.execute(message, serverConfig, {
      userId,
      serverId,
      conversationId: context?.conversationId || null,
      maxIterations: parseInt(process.env.REACT_MAX_ITERATIONS) || 10
    });

    logger.info(`[AI Chat] ReAct execution completed — executionId: ${result.executionId}, success: ${result.success}, status: ${result.status || (result.success ? 'completed' : 'failed')}`);

    return res.json({
      success: result.success,
      response: result.finalAnswer || result.message || 'Task completed',
      executionId: result.executionId,
      iterations: result.iterations,
      status: result.status || (result.success ? 'completed' : 'failed'),
      approvalNeeded: result.status === 'awaiting_approval',
      approvalId: result.approvalId || null,
      metadata: {
        server: {
          id: server.id,
          name: server.name || server.host,
          host: server.host
        },
        timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    logger.error('[AI Chat] Error:', { error: error.message, stack: error.stack });
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error.message,
      response: 'An error occurred while processing your request. Please try again.'
    });
  }
});

/**
 * POST /api/ai/agent/chat/resume
 * Resume a ReAct execution after human approval
 */
router.post('/chat/resume', async (req, res) => {
  try {
    const userId = req.user.id;
    const { approvalId, serverId } = req.body;

    logger.info(`[AI Chat] Resume request — userId: ${userId}, approvalId: ${approvalId}, serverId: ${serverId}`);

    if (!approvalId) {
      return res.status(400).json({
        success: false,
        error: 'Approval ID is required'
      });
    }

    if (!serverId) {
      return res.status(400).json({
        success: false,
        error: 'Server ID is required'
      });
    }

    // Get server from database
    const server = db.prepare(`
      SELECT * FROM servers
      WHERE id = ? AND user_id = ?
    `).get(serverId, userId);

    if (!server) {
      return res.status(404).json({
        success: false,
        error: 'Server not found'
      });
    }

    const serverConfig = buildServerConfig(server);

    // Resume the ReAct loop after approval
    const result = await reactOrchestrator.resumeAfterApproval(approvalId, serverConfig, {
      userId,
      serverId
    });

    logger.info(`[AI Chat] ReAct resume completed — executionId: ${result.executionId}, success: ${result.success}`);

    return res.json({
      success: result.success,
      response: result.finalAnswer || result.message || 'Task resumed and completed',
      executionId: result.executionId,
      iterations: result.iterations,
      status: result.status || (result.success ? 'completed' : 'failed'),
      approvalNeeded: result.status === 'awaiting_approval',
      approvalId: result.approvalId || null,
      metadata: {
        server: {
          id: server.id,
          name: server.name || server.host,
          host: server.host
        },
        resumedFrom: approvalId,
        timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    logger.error('[AI Chat] Resume error:', { error: error.message, stack: error.stack });
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error.message
    });
  }
});

export default router;
