/**
 * RAG Knowledge Retriever
 * 
 * Performs semantic search across the infrastructure knowledge base.
 * 
 * Main methods:
 * - search(query, options) → { matches, context }
 *   1. Generate embedding for query
 *   2. Search across all collections for the server
 *   3. Return top-N results with similarity scores
 *   4. Assemble a context string for the AI prompt
 * 
 * - getServerContext(serverId) → Full infrastructure summary
 * 
 * All queries are logged to the rag_query_log table.
 * Server context is cached with a 5-minute TTL.
 */

import { db } from '../database-sqlite.js';
import logger from '../../config/logger.js';
import { query, getDocuments, isHealthy, listCollections } from './chroma-client.js';
import { generateEmbedding } from './embedding-provider.js';
import { getCollectionTypes } from './data-collector.js';

// Context cache: { key: { data, expiresAt } }
const contextCache = new Map();
const CONTEXT_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Perform semantic search across the knowledge base
 * 
 * @param {string} queryText - Natural language query
 * @param {Object} [options] - Search options
 * @param {number|string} [options.serverId] - Server ID to search within
 * @param {number} [options.maxResults=5] - Maximum results per collection
 * @param {string[]} [options.collectionTypes] - Specific collection types to search
 * @param {number} [options.minSimilarity=0.3] - Minimum similarity score (0-1)
 * @returns {Promise<Object>} { matches, context, query, metadata }
 */
export async function search(queryText, options = {}) {
  const startTime = Date.now();
  const {
    serverId = null,
    maxResults = 5,
    collectionTypes = null,
    minSimilarity = 0.3,
  } = options;

  logger.info('[KnowledgeRetriever] Search initiated', {
    query: queryText.slice(0, 100),
    serverId,
    maxResults,
  });

  try {
    // Generate embedding for the query
    const queryEmbedding = await generateEmbedding(queryText);

    // Determine which collections to search
    const types = collectionTypes || getCollectionTypes();
    const collectionNames = serverId
      ? types.map((t) => `server_${serverId}_${t}`)
      : await getAllServerCollectionNames();

    // Search each collection
    const allMatches = [];

    for (const collectionName of collectionNames) {
      try {
        const results = await query(
          collectionName,
          [queryEmbedding],
          maxResults,
          null,
          ['documents', 'metadatas', 'distances']
        );

        // Process results
        if (results.ids && results.ids[0]) {
          for (let i = 0; i < results.ids[0].length; i++) {
            const id = results.ids[0][i];
            const document = results.documents?.[0]?.[i] || '';
            const metadata = results.metadatas?.[0]?.[i] || {};
            const distance = results.distances?.[0]?.[i] ?? 1;

            // Convert distance to similarity (cosine distance → similarity)
            const similarity = 1 - distance;

            if (similarity >= minSimilarity) {
              allMatches.push({
                id,
                document,
                metadata,
                similarity: Math.round(similarity * 1000) / 1000,
                collection: collectionName,
                collectionType: metadata.collection_type || extractCollectionType(collectionName),
              });
            }
          }
        }
      } catch (error) {
        // Collection may not exist — skip silently
        logger.debug('[KnowledgeRetriever] Collection search skipped', {
          collection: collectionName,
          error: error.message,
        });
      }
    }

    // Sort by similarity (highest first) and take top results
    allMatches.sort((a, b) => b.similarity - a.similarity);
    const topMatches = allMatches.slice(0, maxResults * 2); // Allow more from different collections

    // Assemble context string for AI prompt
    const context = assembleContext(topMatches, queryText);

    const duration = Date.now() - startTime;

    // Log the query
    logQuery({
      userId: options.userId || 'system',
      serverId: serverId ? String(serverId) : null,
      query: queryText,
      resultsCount: topMatches.length,
      topSimilarity: topMatches.length > 0 ? topMatches[0].similarity : 0,
      responseTimeMs: duration,
    });

    logger.info('[KnowledgeRetriever] Search complete', {
      query: queryText.slice(0, 50),
      matchCount: topMatches.length,
      duration,
    });

    return {
      matches: topMatches,
      context,
      query: queryText,
      metadata: {
        totalSearchedCollections: collectionNames.length,
        totalMatches: allMatches.length,
        returnedMatches: topMatches.length,
        searchDurationMs: duration,
        serverId,
      },
    };
  } catch (error) {
    const duration = Date.now() - startTime;
    logger.error('[KnowledgeRetriever] Search failed', {
      query: queryText.slice(0, 50),
      error: error.message,
      duration,
    });

    // Graceful degradation: return empty results
    return {
      matches: [],
      context: null,
      query: queryText,
      metadata: {
        totalSearchedCollections: 0,
        totalMatches: 0,
        returnedMatches: 0,
        searchDurationMs: duration,
        error: error.message,
        serverId,
      },
    };
  }
}

/**
 * Get full infrastructure context for a server
 * Uses a 5-minute cache to avoid repeated queries.
 * 
 * @param {number|string} serverId - Server ID
 * @param {Object} [options] - Options
 * @param {boolean} [options.forceRefresh=false] - Force cache bypass
 * @returns {Promise<Object>} Full server context summary
 */
export async function getServerContext(serverId, options = {}) {
  const cacheKey = `server_context_${serverId}`;

  // Check cache
  if (!options.forceRefresh) {
    const cached = contextCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      logger.debug('[KnowledgeRetriever] Returning cached context', { serverId });
      return cached.data;
    }
  }

  logger.info('[KnowledgeRetriever] Building full server context', { serverId });

  try {
    const types = getCollectionTypes();
    const context = {
      serverId,
      collections: {},
      summary: '',
      collectedAt: new Date().toISOString(),
      chromaAvailable: false,
    };

    // Check ChromaDB health
    context.chromaAvailable = await isHealthy();

    if (!context.chromaAvailable) {
      context.summary = 'ChromaDB is not available. Infrastructure data cannot be retrieved.';
      return context;
    }

    // Retrieve all documents from each collection
    for (const type of types) {
      const collectionName = `server_${serverId}_${type}`;

      try {
        const docs = await getDocuments(collectionName);
        const documents = docs.documents || [];
        const metadatas = docs.metadatas || [];

        context.collections[type] = {
          collectionName,
          documentCount: documents.length,
          documents: documents.map((doc, i) => ({
            text: doc,
            metadata: metadatas[i] || {},
          })),
        };
      } catch (error) {
        context.collections[type] = {
          collectionName,
          documentCount: 0,
          documents: [],
          error: error.message,
        };
      }
    }

    // Build a summary string
    context.summary = buildServerSummary(context);

    // Cache the result
    contextCache.set(cacheKey, {
      data: context,
      expiresAt: Date.now() + CONTEXT_CACHE_TTL,
    });

    return context;
  } catch (error) {
    logger.error('[KnowledgeRetriever] Failed to build server context', {
      serverId,
      error: error.message,
    });

    return {
      serverId,
      collections: {},
      summary: `Error retrieving context: ${error.message}`,
      chromaAvailable: false,
      error: error.message,
    };
  }
}

/**
 * Assemble a context string from search matches for the AI prompt
 * @param {Object[]} matches - Search matches
 * @param {string} query - Original query
 * @returns {string} Formatted context string
 */
function assembleContext(matches, query) {
  if (!matches || matches.length === 0) {
    return 'No relevant infrastructure data found for this query.';
  }

  const sections = [];
  sections.push(`## Infrastructure Context (Query: "${query}")`);
  sections.push('');

  // Group matches by collection type
  const grouped = {};
  for (const match of matches) {
    const type = match.collectionType || 'unknown';
    if (!grouped[type]) {
      grouped[type] = [];
    }
    grouped[type].push(match);
  }

  // Format each group
  const typeLabels = {
    services: 'Services & Systemd',
    docker: 'Docker',
    nginx: 'Nginx',
    system: 'System Information',
    processes: 'Processes & Cron',
    configs: 'Configurations',
    security: 'Security',
  };

  for (const [type, typeMatches] of Object.entries(grouped)) {
    const label = typeLabels[type] || type;
    sections.push(`### ${label}`);
    sections.push('');

    for (const match of typeMatches) {
      sections.push(`[Similarity: ${match.similarity}]`);
      sections.push(match.document);
      sections.push('');
    }
  }

  return sections.join('\n');
}

/**
 * Build a human-readable summary from the full server context
 * @param {Object} context - Full context object
 * @returns {string} Summary text
 */
function buildServerSummary(context) {
  const parts = [];

  for (const [type, data] of Object.entries(context.collections)) {
    if (data.documentCount > 0) {
      parts.push(`${type}: ${data.documentCount} data chunks`);
    }
  }

  const totalDocs = Object.values(context.collections).reduce(
    (sum, c) => sum + (c.documentCount || 0),
    0
  );

  return `Server has ${totalDocs} infrastructure data chunks across ${parts.length} categories: ${parts.join(', ')}`;
}

/**
 * Extract collection type from collection name
 * @param {string} collectionName - e.g., "server_1_docker"
 * @returns {string} Collection type, e.g., "docker"
 */
function extractCollectionType(collectionName) {
  const parts = collectionName.split('_');
  // server_{id}_{type} — type is the last part
  return parts.length > 2 ? parts.slice(2).join('_') : collectionName;
}

/**
 * Get all collection names across all servers
 * @returns {Promise<string[]>} Collection names
 */
async function getAllServerCollectionNames() {
  const collections = await listCollections();
  return collections
    .map((c) => c.name)
    .filter((name) => name.startsWith('server_'));
}

/**
 * Log a query to the database
 * @param {Object} params - Query log parameters
 */
function logQuery({ userId, serverId, query: queryText, resultsCount, topSimilarity, responseTimeMs }) {
  try {
    db.prepare(`
      INSERT INTO rag_query_log (user_id, server_id, query, results_count, top_similarity_score, response_time_ms)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      userId || 'system',
      serverId || null,
      queryText,
      resultsCount || 0,
      topSimilarity || 0,
      responseTimeMs || 0
    );
  } catch (error) {
    logger.warn('[KnowledgeRetriever] Failed to log query', {
      error: error.message,
    });
  }
}

/**
 * Get recent query logs
 * @param {Object} [options] - Options
 * @param {number} [options.limit=50] - Max results
 * @param {string} [options.userId] - Filter by user
 * @returns {Object[]} Query logs
 */
export function getQueryLogs(options = {}) {
  const { limit = 50, userId = null } = options;

  try {
    if (userId) {
      return db
        .prepare(
          'SELECT * FROM rag_query_log WHERE user_id = ? ORDER BY created_at DESC LIMIT ?'
        )
        .all(userId, limit);
    }
    return db
      .prepare('SELECT * FROM rag_query_log ORDER BY created_at DESC LIMIT ?')
      .all(limit);
  } catch (error) {
    logger.warn('[KnowledgeRetriever] Failed to get query logs', {
      error: error.message,
    });
    return [];
  }
}

/**
 * Clear the context cache
 * @param {number|string} [serverId] - Specific server to clear, or all if null
 */
export function clearCache(serverId = null) {
  if (serverId) {
    contextCache.delete(`server_context_${serverId}`);
  } else {
    contextCache.clear();
  }
  logger.info('[KnowledgeRetriever] Cache cleared', {
    serverId: serverId || 'all',
  });
}

export default {
  search,
  getServerContext,
  getQueryLogs,
  clearCache,
};
