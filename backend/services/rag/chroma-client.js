/**
 * ChromaDB REST API Client
 * 
 * Lightweight client for ChromaDB vector database using axios.
 * Connects to ChromaDB server at CHROMADB_URL (default: http://localhost:8000).
 * Uses ChromaDB REST API v2.
 * 
 * Gracefully degrades when ChromaDB is unavailable.
 */

import axios from 'axios';
import logger from '../../config/logger.js';

const CHROMADB_URL = process.env.CHROMADB_URL || 'http://localhost:8000';
const CHROMADB_TIMEOUT = parseInt(process.env.CHROMADB_TIMEOUT) || 30000;

/**
 * Axios instance configured for ChromaDB
 */
const chromaApi = axios.create({
  baseURL: `${CHROMADB_URL}/api/v2`,
  timeout: CHROMADB_TIMEOUT,
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  },
});

/**
 * Check if ChromaDB is reachable
 * @returns {Promise<boolean>}
 */
export async function isHealthy() {
  try {
    const response = await axios.get(`${CHROMADB_URL}/api/v2/heartbeat`, {
      timeout: 5000,
    });
    return response.status === 200;
  } catch (error) {
    return false;
  }
}

/**
 * Get or create a collection by name
 * @param {string} name - Collection name
 * @param {Object} [options] - Optional metadata for the collection
 * @returns {Promise<Object>} Collection object with id and name
 */
export async function getOrCreateCollection(name, options = {}) {
  try {
    const response = await chromaApi.post('/collections', {
      name,
      get_or_create: true,
      metadata: options.metadata || null,
    });
    logger.debug('[ChromaDB] Collection ready', { name, id: response.data.id });
    return response.data;
  } catch (error) {
    logger.warn('[ChromaDB] Failed to get/create collection', {
      name,
      error: error.message,
    });
    throw new Error(`ChromaDB collection error: ${error.message}`);
  }
}

/**
 * Add documents with embeddings to a collection
 * @param {string} collectionName - Name of the collection
 * @param {string[]} ids - Unique IDs for each document
 * @param {string[]} documents - Text content of each document
 * @param {number[][]} embeddings - Pre-computed embedding vectors
 * @param {Object[]} [metadatas] - Optional metadata for each document
 * @returns {Promise<Object>} Result from ChromaDB
 */
export async function addDocuments(
  collectionName,
  ids,
  documents,
  embeddings,
  metadatas = null
) {
  try {
    // First, get the collection ID
    const collection = await getCollection(collectionName);
    if (!collection) {
      throw new Error(`Collection not found: ${collectionName}`);
    }

    const payload = {
      ids,
      documents,
      embeddings,
    };

    if (metadatas) {
      payload.metadatas = metadatas;
    }

    const response = await chromaApi.post(
      `/collections/${collection.id}/add`,
      payload
    );

    logger.debug('[ChromaDB] Documents added', {
      collection: collectionName,
      count: ids.length,
    });

    return response.data;
  } catch (error) {
    if (error.response?.status === 409) {
      // Duplicate IDs — try upsert instead
      logger.debug('[ChromaDB] Duplicate IDs, upserting', {
        collection: collectionName,
      });
      return upsertDocuments(
        collectionName,
        ids,
        documents,
        embeddings,
        metadatas
      );
    }
    logger.warn('[ChromaDB] Failed to add documents', {
      collection: collectionName,
      error: error.message,
    });
    throw new Error(`ChromaDB add error: ${error.message}`);
  }
}

/**
 * Upsert documents (add or update) in a collection
 * @param {string} collectionName - Name of the collection
 * @param {string[]} ids - Unique IDs for each document
 * @param {string[]} documents - Text content of each document
 * @param {number[][]} embeddings - Pre-computed embedding vectors
 * @param {Object[]} [metadatas] - Optional metadata for each document
 * @returns {Promise<Object>} Result from ChromaDB
 */
export async function upsertDocuments(
  collectionName,
  ids,
  documents,
  embeddings,
  metadatas = null
) {
  try {
    const collection = await getCollection(collectionName);
    if (!collection) {
      throw new Error(`Collection not found: ${collectionName}`);
    }

    const payload = {
      ids,
      documents,
      embeddings,
    };

    if (metadatas) {
      payload.metadatas = metadatas;
    }

    const response = await chromaApi.post(
      `/collections/${collection.id}/upsert`,
      payload
    );

    logger.debug('[ChromaDB] Documents upserted', {
      collection: collectionName,
      count: ids.length,
    });

    return response.data;
  } catch (error) {
    logger.warn('[ChromaDB] Failed to upsert documents', {
      collection: collectionName,
      error: error.message,
    });
    throw new Error(`ChromaDB upsert error: ${error.message}`);
  }
}

/**
 * Query a collection using embedding vectors
 * @param {string} collectionName - Name of the collection
 * @param {number[][]} queryEmbeddings - Query embedding vectors
 * @param {number} [nResults=5] - Number of results to return
 * @param {Object} [whereFilter=null] - Metadata filter
 * @param {string[]} [include] - What to include in results
 * @returns {Promise<Object>} Query results with documents, distances, metadatas
 */
export async function query(
  collectionName,
  queryEmbeddings,
  nResults = 5,
  whereFilter = null,
  include = ['documents', 'metadatas', 'distances']
) {
  try {
    const collection = await getCollection(collectionName);
    if (!collection) {
      logger.debug('[ChromaDB] Collection not found for query', {
        collection: collectionName,
      });
      return {
        ids: [[]],
        documents: [[]],
        metadatas: [[]],
        distances: [[]],
      };
    }

    const payload = {
      query_embeddings: queryEmbeddings,
      n_results: nResults,
      include,
    };

    if (whereFilter) {
      payload.where = whereFilter;
    }

    const response = await chromaApi.post(
      `/collections/${collection.id}/query`,
      payload
    );

    return response.data;
  } catch (error) {
    logger.warn('[ChromaDB] Query failed', {
      collection: collectionName,
      error: error.message,
    });
    // Return empty results on failure — graceful degradation
    return {
      ids: [[]],
      documents: [[]],
      metadatas: [[]],
      distances: [[]],
    };
  }
}

/**
 * Get a collection by name
 * @param {string} name - Collection name
 * @returns {Promise<Object|null>} Collection object or null if not found
 */
export async function getCollection(name) {
  try {
    // ChromaDB v2: list collections and find by name
    const collections = await listCollections();
    return collections.find((c) => c.name === name) || null;
  } catch (error) {
    logger.warn('[ChromaDB] Failed to get collection', {
      name,
      error: error.message,
    });
    return null;
  }
}

/**
 * Delete a collection by name
 * @param {string} name - Collection name
 * @returns {Promise<boolean>} True if deleted, false if not found
 */
export async function deleteCollection(name) {
  try {
    const collection = await getCollection(name);
    if (!collection) {
      return false;
    }

    await chromaApi.delete(`/collections/${collection.id}`);
    logger.info('[ChromaDB] Collection deleted', { name });
    return true;
  } catch (error) {
    logger.warn('[ChromaDB] Failed to delete collection', {
      name,
      error: error.message,
    });
    return false;
  }
}

/**
 * List all collections
 * @returns {Promise<Object[]>} Array of collection objects
 */
export async function listCollections() {
  try {
    const response = await chromaApi.get('/collections');
    return response.data || [];
  } catch (error) {
    logger.warn('[ChromaDB] Failed to list collections', {
      error: error.message,
    });
    return [];
  }
}

/**
 * Count documents in a collection
 * @param {string} collectionName - Name of the collection
 * @returns {Promise<number>} Number of documents
 */
export async function countDocuments(collectionName) {
  try {
    const collection = await getCollection(collectionName);
    if (!collection) {
      return 0;
    }

    const response = await chromaApi.get(
      `/collections/${collection.id}/count`
    );
    return response.data || 0;
  } catch (error) {
    logger.warn('[ChromaDB] Failed to count documents', {
      collection: collectionName,
      error: error.message,
    });
    return 0;
  }
}

/**
 * Delete documents from a collection by IDs
 * @param {string} collectionName - Name of the collection
 * @param {string[]} ids - IDs to delete
 * @returns {Promise<Object>} Deletion result
 */
export async function deleteDocuments(collectionName, ids) {
  try {
    const collection = await getCollection(collectionName);
    if (!collection) {
      return null;
    }

    const response = await chromaApi.post(
      `/collections/${collection.id}/delete`,
      { ids }
    );

    logger.debug('[ChromaDB] Documents deleted', {
      collection: collectionName,
      count: ids.length,
    });

    return response.data;
  } catch (error) {
    logger.warn('[ChromaDB] Failed to delete documents', {
      collection: collectionName,
      error: error.message,
    });
    return null;
  }
}

/**
 * Get all documents from a collection (for full context retrieval)
 * @param {string} collectionName - Name of the collection
 * @param {Object} [options] - Options (limit, offset, where filter)
 * @returns {Promise<Object>} Documents with metadatas
 */
export async function getDocuments(
  collectionName,
  options = {}
) {
  try {
    const collection = await getCollection(collectionName);
    if (!collection) {
      return { ids: [], documents: [], metadatas: [] };
    }

    const payload = {
      include: ['documents', 'metadatas'],
    };

    if (options.where) {
      payload.where = options.where;
    }

    if (options.limit) {
      payload.limit = options.limit;
    }

    if (options.offset) {
      payload.offset = options.offset;
    }

    const response = await chromaApi.post(
      `/collections/${collection.id}/get`,
      payload
    );

    return response.data;
  } catch (error) {
    logger.warn('[ChromaDB] Failed to get documents', {
      collection: collectionName,
      error: error.message,
    });
    return { ids: [], documents: [], metadatas: [] };
  }
}

export default {
  isHealthy,
  getOrCreateCollection,
  addDocuments,
  upsertDocuments,
  query,
  getCollection,
  deleteCollection,
  listCollections,
  countDocuments,
  deleteDocuments,
  getDocuments,
};
