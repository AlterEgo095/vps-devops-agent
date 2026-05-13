/**
 * RAG Management Routes
 * 
 * Express routes for managing the RAG knowledge base:
 * 
 * POST /api/rag/collect/:serverId  — Trigger data collection for a server
 * GET  /api/rag/status/:serverId   — Get collection status
 * POST /api/rag/search             — Search the knowledge base
 * GET  /api/rag/context/:serverId  — Get full server context
 * DELETE /api/rag/:serverId        — Delete all collections for a server
 * GET  /api/rag/health             — Get RAG system health
 * 
 * All routes require authentication.
 */

import express from 'express';
import { db } from '../services/database-sqlite.js';
import { authenticateToken } from '../middleware/auth.js';
import { decryptPassword } from '../services/crypto-manager.js';
import logger from '../config/logger.js';

const router = express.Router();

// Apply authentication to all RAG routes
router.use(authenticateToken);

// ============================================================
// HELPER: Build server config from DB record
// ============================================================

async function getServerConfig(serverId, userId) {
  const server = db
    .prepare(
      `SELECT id, name, host, port, username, encrypted_credentials, auth_type 
       FROM servers WHERE id = ? AND user_id = ?`
    )
    .get(serverId, userId);

  if (!server) {
    return null;
  }

  if (!server.encrypted_credentials) {
    // Some older records might store password in plaintext field
    // Check if there's a password column
    const serverWithPassword = db
      .prepare(
        `SELECT id, name, host, port, username, encrypted_credentials, password 
         FROM servers WHERE id = ? AND user_id = ?`
      )
      .get(serverId, userId);

    if (serverWithPassword && serverWithPassword.password) {
      return {
        host: server.host,
        port: server.port || 22,
        username: server.username,
        password: serverWithPassword.password,
      };
    }
    return null;
  }

  try {
    const decryptedPassword = decryptPassword(server.encrypted_credentials);
    return {
      host: server.host,
      port: server.port || 22,
      username: server.username,
      password: decryptedPassword,
    };
  } catch (error) {
    logger.error('[RAG Routes] Failed to decrypt server credentials', {
      serverId,
      error: error.message,
    });
    return null;
  }
}

// ============================================================
// ROUTES
// ============================================================

/**
 * GET /api/rag/health
 * Check RAG system health
 */
router.get('/health', async (req, res) => {
  try {
    const { healthCheck } = await import('../services/rag/index.js');
    const health = await healthCheck();
    res.json({
      success: true,
      health,
    });
  } catch (error) {
    logger.error('[RAG Routes] Health check failed', {
      error: error.message,
    });
    res.status(500).json({
      success: false,
      error: 'Failed to check RAG health',
      message: error.message,
    });
  }
});

/**
 * POST /api/rag/collect/:serverId
 * Trigger data collection for a server
 * Body: { types?: string[], incremental?: boolean }
 */
router.post('/collect/:serverId', async (req, res) => {
  try {
    const { serverId } = req.params;
    const userId = req.user.id;
    const { types, incremental = true } = req.body || {};

    // Verify server ownership
    const serverConfig = await getServerConfig(serverId, userId);
    if (!serverConfig) {
      return res.status(404).json({
        success: false,
        error: 'Server not found or no SSH credentials configured',
      });
    }

    logger.info('[RAG Routes] Manual collection triggered', {
      serverId,
      userId,
      types,
      incremental,
    });

    const { dataCollector } = await import('../services/rag/index.js');
    const result = await dataCollector.collectServerData(serverId, serverConfig, {
      types,
      incremental,
    });

    // Invalidate context cache for this server
    const { knowledgeRetriever } = await import('../services/rag/index.js');
    knowledgeRetriever.clearCache(serverId);

    res.json({
      success: result.success,
      data: result,
    });
  } catch (error) {
    logger.error('[RAG Routes] Collection failed', {
      serverId: req.params.serverId,
      error: error.message,
    });
    res.status(500).json({
      success: false,
      error: 'Data collection failed',
      message: error.message,
    });
  }
});

/**
 * GET /api/rag/status/:serverId
 * Get collection status for a server
 */
router.get('/status/:serverId', async (req, res) => {
  try {
    const { serverId } = req.params;
    const userId = req.user.id;

    // Verify server ownership
    const server = db
      .prepare('SELECT id FROM servers WHERE id = ? AND user_id = ?')
      .get(serverId, userId);

    if (!server) {
      return res.status(404).json({
        success: false,
        error: 'Server not found',
      });
    }

    const { dataCollector } = await import('../services/rag/index.js');
    const status = await dataCollector.getServerCollectionStatus(serverId);

    res.json({
      success: true,
      status,
    });
  } catch (error) {
    logger.error('[RAG Routes] Status check failed', {
      serverId: req.params.serverId,
      error: error.message,
    });
    res.status(500).json({
      success: false,
      error: 'Failed to get collection status',
      message: error.message,
    });
  }
});

/**
 * POST /api/rag/search
 * Search the knowledge base
 * Body: { query: string, serverId?: number, maxResults?: number, collectionTypes?: string[] }
 */
router.post('/search', async (req, res) => {
  try {
    const { query: queryText, serverId, maxResults, collectionTypes } = req.body;

    if (!queryText || typeof queryText !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Query text is required',
      });
    }

    if (queryText.length > 1000) {
      return res.status(400).json({
        success: false,
        error: 'Query text too long (max 1000 characters)',
      });
    }

    // If serverId specified, verify access
    if (serverId) {
      const server = db
        .prepare('SELECT id FROM servers WHERE id = ? AND user_id = ?')
        .get(serverId, req.user.id);

      if (!server) {
        return res.status(404).json({
          success: false,
          error: 'Server not found',
        });
      }
    }

    logger.info('[RAG Routes] Search query', {
      query: queryText.slice(0, 100),
      serverId,
      userId: req.user.id,
    });

    const { knowledgeRetriever } = await import('../services/rag/index.js');
    const results = await knowledgeRetriever.search(queryText, {
      serverId,
      maxResults: maxResults || 5,
      collectionTypes,
      userId: req.user.id,
    });

    res.json({
      success: true,
      data: results,
    });
  } catch (error) {
    logger.error('[RAG Routes] Search failed', {
      error: error.message,
      query: req.body?.query?.slice(0, 50),
    });
    res.status(500).json({
      success: false,
      error: 'Search failed',
      message: error.message,
    });
  }
});

/**
 * GET /api/rag/context/:serverId
 * Get full server context for AI prompt
 * Query: ?forceRefresh=true
 */
router.get('/context/:serverId', async (req, res) => {
  try {
    const { serverId } = req.params;
    const userId = req.user.id;
    const forceRefresh = req.query.forceRefresh === 'true';

    // Verify server ownership
    const server = db
      .prepare('SELECT id FROM servers WHERE id = ? AND user_id = ?')
      .get(serverId, userId);

    if (!server) {
      return res.status(404).json({
        success: false,
        error: 'Server not found',
      });
    }

    const { knowledgeRetriever } = await import('../services/rag/index.js');
    const context = await knowledgeRetriever.getServerContext(serverId, {
      forceRefresh,
    });

    res.json({
      success: true,
      data: context,
    });
  } catch (error) {
    logger.error('[RAG Routes] Context retrieval failed', {
      serverId: req.params.serverId,
      error: error.message,
    });
    res.status(500).json({
      success: false,
      error: 'Failed to get server context',
      message: error.message,
    });
  }
});

/**
 * DELETE /api/rag/:serverId
 * Delete all collections for a server
 */
router.delete('/:serverId', async (req, res) => {
  try {
    const { serverId } = req.params;
    const userId = req.user.id;

    // Verify server ownership
    const server = db
      .prepare('SELECT id FROM servers WHERE id = ? AND user_id = ?')
      .get(serverId, userId);

    if (!server) {
      return res.status(404).json({
        success: false,
        error: 'Server not found',
      });
    }

    logger.info('[RAG Routes] Deleting server collections', {
      serverId,
      userId,
    });

    const { dataCollector, knowledgeRetriever } = await import(
      '../services/rag/index.js'
    );

    // Clear cache first
    knowledgeRetriever.clearCache(serverId);

    // Delete collections
    const result = await dataCollector.deleteServerCollections(serverId);

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    logger.error('[RAG Routes] Delete failed', {
      serverId: req.params.serverId,
      error: error.message,
    });
    res.status(500).json({
      success: false,
      error: 'Failed to delete server collections',
      message: error.message,
    });
  }
});

export default router;
