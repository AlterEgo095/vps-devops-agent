/**
 * Embedding Provider Service
 * 
 * Generates vector embeddings using OpenAI's text-embedding-3-small model.
 * Falls back to simple hash-based embeddings when OpenAI is unavailable.
 * Supports batch processing for large text arrays (max 100 per batch).
 */

import OpenAI from 'openai';
import crypto from 'crypto';
import logger from '../../config/logger.js';

const EMBEDDING_MODEL = process.env.EMBEDDING_MODEL || 'text-embedding-3-small';
const EMBEDDING_DIMENSIONS = parseInt(process.env.EMBEDDING_DIMENSIONS) || 1536;
const BATCH_SIZE = 100;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
const OPENAI_BASE_URL = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';

// Singleton OpenAI client for embeddings (uses standard OpenAI endpoint, not the custom chat one)
let openaiClient = null;

/**
 * Get or create the OpenAI client instance for embeddings
 * @returns {OpenAI|null}
 */
function getOpenAIClient() {
  if (!OPENAI_API_KEY) {
    return null;
  }

  if (!openaiClient) {
    try {
      openaiClient = new OpenAI({
        apiKey: OPENAI_API_KEY,
        baseURL: OPENAI_BASE_URL,
      });
      logger.info('[EmbeddingProvider] OpenAI client initialized', {
        model: EMBEDDING_MODEL,
        baseURL: OPENAI_BASE_URL,
      });
    } catch (error) {
      logger.warn('[EmbeddingProvider] Failed to initialize OpenAI client', {
        error: error.message,
      });
      return null;
    }
  }

  return openaiClient;
}

/**
 * Generate embeddings for an array of texts using OpenAI API
 * @param {string[]} texts - Array of text strings to embed
 * @returns {Promise<number[][]>} Array of embedding vectors
 */
export async function generateEmbeddings(texts) {
  if (!texts || texts.length === 0) {
    return [];
  }

  const client = getOpenAIClient();

  if (!client) {
    logger.debug('[EmbeddingProvider] OpenAI unavailable, using hash-based fallback');
    return generateHashEmbeddings(texts);
  }

  try {
    // Process in batches to respect API limits
    const allEmbeddings = [];

    for (let i = 0; i < texts.length; i += BATCH_SIZE) {
      const batch = texts.slice(i, i + BATCH_SIZE);

      // Replace null/undefined with empty string
      const sanitizedBatch = batch.map((t) =>
        t != null ? String(t).slice(0, 8191) : ''
      );

      const response = await client.embeddings.create({
        model: EMBEDDING_MODEL,
        input: sanitizedBatch,
        dimensions: EMBEDDING_DIMENSIONS,
      });

      const batchEmbeddings = response.data
        .sort((a, b) => a.index - b.index)
        .map((item) => item.embedding);

      allEmbeddings.push(...batchEmbeddings);

      logger.debug('[EmbeddingProvider] Batch embedded', {
        batchIndex: Math.floor(i / BATCH_SIZE),
        batchSize: batch.length,
        total: texts.length,
        model: response.model,
        usage: response.usage,
      });
    }

    return allEmbeddings;
  } catch (error) {
    logger.warn('[EmbeddingProvider] OpenAI embedding failed, using hash fallback', {
      error: error.message,
      textCount: texts.length,
    });
    return generateHashEmbeddings(texts);
  }
}

/**
 * Generate a single embedding for a text string
 * @param {string} text - Text to embed
 * @returns {Promise<number[]>} Embedding vector
 */
export async function generateEmbedding(text) {
  if (!text) {
    return generateZeroEmbedding();
  }

  const embeddings = await generateEmbeddings([text]);
  return embeddings[0] || generateZeroEmbedding();
}

/**
 * Hash-based embedding fallback
 * 
 * Generates deterministic pseudo-embeddings using cryptographic hashing.
 * These are NOT semantically meaningful but allow the system to function
 * when OpenAI is unavailable. Results will be keyword-match-like.
 * 
 * @param {string[]} texts - Array of text strings
 * @returns {number[][]} Array of pseudo-embedding vectors
 */
function generateHashEmbeddings(texts) {
  return texts.map((text) => {
    if (!text) return generateZeroEmbedding();

    // Create multiple hash segments from the text to fill the embedding dimensions
    const embedding = new Array(EMBEDDING_DIMENSIONS).fill(0);
    const normalizedText = String(text).toLowerCase().trim();

    // Split text into chunks and hash each one to produce different parts of the embedding
    const words = normalizedText.split(/\s+/).filter(Boolean);
    const chunkSize = Math.max(1, Math.ceil(words.length / 16));

    for (let chunk = 0; chunk < 16; chunk++) {
      const start = chunk * chunkSize;
      const end = Math.min(start + chunkSize, words.length);
      const textChunk = words.slice(start, end).join(' ') || normalizedText;

      const hash = crypto.createHash('sha256').update(textChunk).digest();

      // Each hash produces 32 bytes = 256 bits of data
      // We need to map this to roughly EMBEDDING_DIMENSIONS / 16 dimensions
      const dimsPerChunk = Math.ceil(EMBEDDING_DIMENSIONS / 16);
      const offset = chunk * dimsPerChunk;

      for (let i = 0; i < hash.length && offset + i < EMBEDDING_DIMENSIONS; i++) {
        // Normalize byte to [-1, 1] range
        embedding[offset + i] = (hash[i] / 128) - 1;
      }
    }

    // Add character-level features for very short texts
    for (let i = 0; i < Math.min(normalizedText.length, EMBEDDING_DIMENSIONS); i++) {
      const charCode = normalizedText.charCodeAt(i);
      // Blend character code into embedding
      embedding[i % EMBEDDING_DIMENSIONS] += (charCode / 128) - 1;
      embedding[i % EMBEDDING_DIMENSIONS] /= 2; // Average with hash value
    }

    // Normalize the embedding vector (L2 normalization)
    const magnitude = Math.sqrt(
      embedding.reduce((sum, val) => sum + val * val, 0)
    );
    if (magnitude > 0) {
      for (let i = 0; i < embedding.length; i++) {
        embedding[i] /= magnitude;
      }
    }

    return embedding;
  });
}

/**
 * Generate a zero embedding vector
 * @returns {number[]} Zero vector of EMBEDDING_DIMENSIONS length
 */
function generateZeroEmbedding() {
  return new Array(EMBEDDING_DIMENSIONS).fill(0);
}

/**
 * Check if OpenAI embedding service is available
 * @returns {Promise<boolean>}
 */
export async function isOpenAIEmbeddingAvailable() {
  const client = getOpenAIClient();
  if (!client) return false;

  try {
    const response = await client.embeddings.create({
      model: EMBEDDING_MODEL,
      input: 'test',
    });
    return response.data && response.data.length > 0;
  } catch (error) {
    logger.warn('[EmbeddingProvider] OpenAI embedding check failed', {
      error: error.message,
    });
    return false;
  }
}

/**
 * Get embedding provider status
 * @returns {Object} Status info
 */
export function getEmbeddingStatus() {
  return {
    model: EMBEDDING_MODEL,
    dimensions: EMBEDDING_DIMENSIONS,
    batchSize: BATCH_SIZE,
    openaiConfigured: !!OPENAI_API_KEY,
    baseURL: OPENAI_BASE_URL,
    fallbackActive: !OPENAI_API_KEY,
  };
}

export default {
  generateEmbeddings,
  generateEmbedding,
  isOpenAIEmbeddingAvailable,
  getEmbeddingStatus,
};
