/**
 * RAG Module — Central Entry Point
 * 
 * Exports: { knowledgeRetriever, dataCollector, chromaClient }
 * 
 * Handles:
 * - Auto-collection scheduling (interval from env RAG_METRICS_INTERVAL)
 * - Collection health check
 * - Server context caching (5 min TTL)
 * - Module initialization
 */

import logger from '../../config/logger.js';
import { db } from '../database-sqlite.js';
import { decryptPassword } from '../crypto-manager.js';

// Import sub-modules
import * as chromaClient from './chroma-client.js';
import * as embeddingProvider from './embedding-provider.js';
import * as dataCollector from './data-collector.js';
import * as knowledgeRetriever from './knowledge-retriever.js';

// ============================================================
// MODULE STATE
// ============================================================

let autoCollectionInterval = null;
let isInitialized = false;

// ============================================================
// HEALTH CHECK
// ============================================================

/**
 * Check the health of all RAG subsystems
 * @returns {Promise<Object>} Health status
 */
export async function healthCheck() {
  const health = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    chromadb: {
      available: false,
      url: process.env.CHROMADB_URL || 'http://localhost:8000',
    },
    embeddings: {
      ...embeddingProvider.getEmbeddingStatus(),
    },
    collections: {},
    autoCollection: {
      enabled: !!autoCollectionInterval,
      intervalMs: parseInt(process.env.RAG_METRICS_INTERVAL) || 3600000,
    },
  };

  // Check ChromaDB
  try {
    health.chromadb.available = await chromaClient.isHealthy();
  } catch (error) {
    health.chromadb.available = false;
    health.chromadb.error = error.message;
  }

  // If ChromaDB is down, overall status is degraded
  if (!health.chromadb.available) {
    health.status = 'degraded';
    health.reason = 'ChromaDB is not available. RAG search will return empty results.';
  }

  // Check if embeddings are using fallback
  if (health.embeddings.fallbackActive) {
    health.status = health.status === 'healthy' ? 'degraded' : health.status;
    health.reason = (health.reason || '') + ' Embeddings using hash-based fallback (not semantically meaningful).';
  }

  // Get collection stats
  try {
    const collections = await chromaClient.listCollections();
    health.collections.totalCount = collections.length;
    health.collections.names = collections.map((c) => c.name);
  } catch (error) {
    health.collections.error = error.message;
  }

  // Get snapshot stats from SQLite
  try {
    const snapshotStats = db.prepare(`
      SELECT 
        COUNT(*) as total_snapshots,
        COUNT(CASE WHEN status = 'success' THEN 1 END) as successful,
        COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed,
        COUNT(DISTINCT server_id) as servers_with_data,
        MAX(last_collected_at) as last_collection
      FROM rag_server_snapshots
    `).get();

    health.snapshots = snapshotStats;
  } catch (error) {
    health.snapshots = { error: error.message };
  }

  return health;
}

// ============================================================
// AUTO-COLLECTION SCHEDULING
// ============================================================

/**
 * Start auto-collection for all registered servers
 * Collects infrastructure data at the configured interval.
 * @param {Object} [options] - Options
 * @param {number} [options.intervalMs] - Collection interval in ms
 */
export function startAutoCollection(options = {}) {
  if (autoCollectionInterval) {
    logger.warn('[RAG] Auto-collection already running');
    return;
  }

  const intervalMs =
    options.intervalMs ||
    parseInt(process.env.RAG_METRICS_INTERVAL) ||
    3600000; // Default: 1 hour

  logger.info('[RAG] Starting auto-collection', { intervalMs });

  autoCollectionInterval = setInterval(async () => {
    try {
      await collectAllServers();
    } catch (error) {
      logger.error('[RAG] Auto-collection cycle failed', {
        error: error.message,
      });
    }
  }, intervalMs);

  // Run first collection immediately (non-blocking)
  setImmediate(async () => {
    try {
      await collectAllServers();
    } catch (error) {
      logger.error('[RAG] Initial auto-collection failed', {
        error: error.message,
      });
    }
  });
}

/**
 * Stop auto-collection
 */
export function stopAutoCollection() {
  if (autoCollectionInterval) {
    clearInterval(autoCollectionInterval);
    autoCollectionInterval = null;
    logger.info('[RAG] Auto-collection stopped');
  }
}

/**
 * Collect data for all registered servers
 * @returns {Promise<Object[]>} Collection results per server
 */
async function collectAllServers() {
  logger.info('[RAG] Starting collection cycle for all servers');

  // Get all servers from the database
  let servers = [];
  try {
    servers = db
      .prepare(
        'SELECT id, name, host, port, username, encrypted_credentials, auth_type FROM servers WHERE status = ?'
      )
      .all('active');
  } catch (error) {
    logger.warn('[RAG] Failed to get servers for auto-collection', {
      error: error.message,
    });
    return [];
  }

  if (servers.length === 0) {
    logger.debug('[RAG] No active servers to collect');
    return [];
  }

  const results = [];

  for (const server of servers) {
    try {
      // Build server config for SSH
      const serverConfig = buildServerConfig(server);
      if (!serverConfig) {
        logger.debug('[RAG] Skipping server — no credentials', {
          serverId: server.id,
          serverName: server.name,
        });
        continue;
      }

      logger.info('[RAG] Auto-collecting server', {
        serverId: server.id,
        serverName: server.name,
        host: server.host,
      });

      const result = await dataCollector.collectServerData(
        server.id,
        serverConfig,
        { incremental: true }
      );

      results.push({
        serverId: server.id,
        serverName: server.name,
        success: result.success,
        totalChunks: result.totalChunks,
      });
    } catch (error) {
      logger.error('[RAG] Auto-collection failed for server', {
        serverId: server.id,
        serverName: server.name,
        error: error.message,
      });

      results.push({
        serverId: server.id,
        serverName: server.name,
        success: false,
        error: error.message,
      });
    }
  }

  logger.info('[RAG] Collection cycle complete', {
    serversProcessed: results.length,
    successful: results.filter((r) => r.success).length,
  });

  return results;
}

/**
 * Build SSH server config from database record
 * @param {Object} server - Server record from DB
 * @returns {Object|null} Server config for agent-executor or null if no credentials
 */
function buildServerConfig(server) {
  if (!server.encrypted_credentials) {
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
    logger.warn('[RAG] Failed to decrypt server credentials', {
      serverId: server.id,
      error: error.message,
    });
    return null;
  }
}

// ============================================================
// INITIALIZATION
// ============================================================

/**
 * Initialize the RAG module
 * - Checks ChromaDB connectivity
 * - Starts auto-collection if configured
 * @param {Object} [options] - Options
 * @param {boolean} [options.autoCollect=false] - Start auto-collection
 */
export async function initialize(options = {}) {
  if (isInitialized) {
    logger.warn('[RAG] Module already initialized');
    return;
  }

  logger.info('[RAG] Initializing RAG module...');

  // Check ChromaDB health
  const chromaAvailable = await chromaClient.isHealthy();

  if (!chromaAvailable) {
    logger.warn(
      '[RAG] ChromaDB is not available. RAG features will be degraded.'
    );
    logger.warn(
      '[RAG] Start ChromaDB with: bash backend/scripts/setup-chromadb.sh'
    );
  } else {
    logger.info('[RAG] ChromaDB connection verified');
  }

  // Log embedding status
  const embeddingStatus = embeddingProvider.getEmbeddingStatus();
  if (embeddingStatus.fallbackActive) {
    logger.warn(
      '[RAG] Using hash-based embedding fallback. Set OPENAI_API_KEY for semantic search.'
    );
  } else {
    logger.info('[RAG] OpenAI embeddings configured', {
      model: embeddingStatus.model,
    });
  }

  // Start auto-collection if configured
  if (options.autoCollect || process.env.RAG_AUTO_COLLECT === 'true') {
    startAutoCollection();
  }

  isInitialized = true;
  logger.info('[RAG] Module initialized successfully');
}

/**
 * Shutdown the RAG module gracefully
 */
export function shutdown() {
  stopAutoCollection();
  knowledgeRetriever.clearCache();
  isInitialized = false;
  logger.info('[RAG] Module shutdown complete');
}

// ============================================================
// RE-EXPORTS
// ============================================================

export { chromaClient, embeddingProvider, dataCollector, knowledgeRetriever };

export default {
  initialize,
  shutdown,
  healthCheck,
  startAutoCollection,
  stopAutoCollection,
  chromaClient,
  embeddingProvider,
  dataCollector,
  knowledgeRetriever,
};
