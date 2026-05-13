/**
 * RAG Data Collector
 * 
 * Collects infrastructure data from a server via SSH and chunks it
 * for vector storage in ChromaDB. Creates per-server collections:
 * 
 * - server_{id}_services  — running services, systemd units
 * - server_{id}_docker    — containers, images, networks, volumes
 * - server_{id}_nginx     — nginx configs, enabled sites
 * - server_{id}_system    — OS info, disk, memory, CPU, network
 * - server_{id}_processes — pm2 processes, cron jobs
 * - server_{id}_configs   — env files (masked), config files
 * - server_{id}_security  — firewall rules, SSH config, SSL certs
 * 
 * Each chunk is max 500 characters with metadata:
 * { server_id, collection_type, collected_at, source_command }
 */

import { executeCommand } from '../agent-executor.js';
import { db } from '../database-sqlite.js';
import logger from '../../config/logger.js';
import { getOrCreateCollection, addDocuments, deleteCollection, countDocuments } from './chroma-client.js';
import { generateEmbeddings } from './embedding-provider.js';

const MAX_CHUNK_SIZE = 500;
const COLLECTION_TYPES = [
  'services',
  'docker',
  'nginx',
  'system',
  'processes',
  'configs',
  'security',
];

// ============================================================
// SSH COMMAND DEFINITIONS PER COLLECTION TYPE
// ============================================================

const COLLECTION_COMMANDS = {
  services: [
    {
      name: 'running_services',
      command: 'systemctl list-units --type=service --state=running --no-pager 2>/dev/null | head -50',
      description: 'List of running systemd services',
    },
    {
      name: 'failed_services',
      command: 'systemctl list-units --type=service --state=failed --no-pager 2>/dev/null',
      description: 'List of failed systemd services',
    },
    {
      name: 'enabled_services',
      command: 'systemctl list-unit-files --type=service --state=enabled --no-pager 2>/dev/null | head -50',
      description: 'List of enabled systemd services',
    },
    {
      name: 'service_details',
      command: 'for svc in nginx apache2 mysql postgresql docker redis mongod; do systemctl status $svc --no-pager 2>/dev/null | head -10; echo "---"; done',
      description: 'Status details of common services',
    },
  ],

  docker: [
    {
      name: 'containers',
      command: 'docker ps -a --format "table {{.ID}}\t{{.Names}}\t{{.Image}}\t{{.Status}}\t{{.Ports}}" 2>/dev/null || echo "Docker not installed"',
      description: 'List of all Docker containers',
    },
    {
      name: 'images',
      command: 'docker images --format "table {{.Repository}}\t{{.Tag}}\t{{.Size}}\t{{.CreatedSince}}" 2>/dev/null || echo "Docker not installed"',
      description: 'List of Docker images',
    },
    {
      name: 'networks',
      command: 'docker network ls 2>/dev/null || echo "Docker not installed"',
      description: 'List of Docker networks',
    },
    {
      name: 'volumes',
      command: 'docker volume ls 2>/dev/null || echo "Docker not installed"',
      description: 'List of Docker volumes',
    },
    {
      name: 'compose_projects',
      command: 'docker compose ls -a 2>/dev/null || docker-compose ls 2>/dev/null || echo "Docker Compose not available"',
      description: 'List of Docker Compose projects',
    },
    {
      name: 'docker_info',
      command: 'docker info 2>/dev/null | head -30 || echo "Docker not installed"',
      description: 'Docker system information',
    },
  ],

  nginx: [
    {
      name: 'nginx_status',
      command: 'systemctl status nginx --no-pager 2>/dev/null || echo "Nginx not installed"',
      description: 'Nginx service status',
    },
    {
      name: 'nginx_sites_enabled',
      command: 'ls -la /etc/nginx/sites-enabled/ 2>/dev/null || echo "No sites-enabled dir"',
      description: 'Nginx enabled sites symlinks',
    },
    {
      name: 'nginx_sites_available',
      command: 'ls -la /etc/nginx/sites-available/ 2>/dev/null || echo "No sites-available dir"',
      description: 'Nginx available sites',
    },
    {
      name: 'nginx_configs',
      command: 'for f in /etc/nginx/sites-enabled/*; do echo "=== $f ==="; cat "$f" 2>/dev/null; echo; done | head -200',
      description: 'Content of nginx site configurations',
    },
    {
      name: 'nginx_main_config',
      command: 'cat /etc/nginx/nginx.conf 2>/dev/null | head -100',
      description: 'Main nginx configuration',
    },
    {
      name: 'nginx_test',
      command: 'nginx -t 2>&1 || echo "Nginx config test failed"',
      description: 'Nginx configuration test result',
    },
  ],

  system: [
    {
      name: 'os_info',
      command: 'cat /etc/os-release 2>/dev/null; echo "---"; uname -a',
      description: 'Operating system information',
    },
    {
      name: 'disk_usage',
      command: 'df -h 2>/dev/null',
      description: 'Disk usage information',
    },
    {
      name: 'memory_usage',
      command: 'free -h 2>/dev/null',
      description: 'Memory usage information',
    },
    {
      name: 'cpu_info',
      command: 'lscpu 2>/dev/null | head -25',
      description: 'CPU information',
    },
    {
      name: 'network_interfaces',
      command: 'ip addr show 2>/dev/null || ifconfig 2>/dev/null',
      description: 'Network interface configuration',
    },
    {
      name: 'uptime_load',
      command: 'uptime 2>/dev/null; echo "---"; cat /proc/loadavg 2>/dev/null',
      description: 'System uptime and load averages',
    },
    {
      name: 'hostname',
      command: 'hostname 2>/dev/null; echo "---"; hostname -I 2>/dev/null',
      description: 'Hostname and IP addresses',
    },
    {
      name: 'kernel_modules',
      command: 'lsmod 2>/dev/null | head -20',
      description: 'Loaded kernel modules',
    },
  ],

  processes: [
    {
      name: 'pm2_processes',
      command: 'pm2 list 2>/dev/null || echo "PM2 not installed"',
      description: 'PM2 managed processes',
    },
    {
      name: 'pm2_details',
      command: 'pm2 show 0 2>/dev/null | head -30; for id in $(pm2 jlist 2>/dev/null | jq -r ".[].pm_id" 2>/dev/null | head -5); do echo "=== PM2 ID: $id ==="; pm2 show $id 2>/dev/null | head -20; done 2>/dev/null || echo "PM2 details unavailable"',
      description: 'PM2 process details',
    },
    {
      name: 'cron_jobs',
      command: 'for user in $(cut -f1 -d: /etc/passwd); do crontab -u $user -l 2>/dev/null && echo "User: $user"; done | head -100',
      description: 'Cron jobs for all users',
    },
    {
      name: 'system_cron',
      command: 'ls -la /etc/cron.d/ 2>/dev/null; echo "---"; cat /etc/cron.d/* 2>/dev/null | head -100',
      description: 'System cron jobs',
    },
    {
      name: 'top_processes',
      command: 'ps aux --sort=-%mem | head -20 2>/dev/null',
      description: 'Top processes by memory usage',
    },
  ],

  configs: [
    {
      name: 'env_files',
      command: 'find /opt /var/www /home /srv -maxdepth 3 -name ".env" -type f 2>/dev/null | head -20',
      description: 'Location of .env files',
    },
    {
      name: 'env_contents_masked',
      command: 'for f in $(find /opt /var/www /home /srv -maxdepth 3 -name ".env" -type f 2>/dev/null | head -10); do echo "=== $f ==="; cat "$f" 2>/dev/null | sed "s/=.*/=***/" | head -30; echo; done',
      description: 'Environment variable keys (values masked)',
    },
    {
      name: 'pm2_ecosystem',
      command: 'find /opt /var/www /home /srv -maxdepth 3 -name "ecosystem.config.*" -type f 2>/dev/null -exec echo "=== {} ===" \\; -exec cat {} \\; 2>/dev/null | head -100',
      description: 'PM2 ecosystem config files',
    },
    {
      name: 'docker_compose_files',
      command: 'find /opt /var/www /home /srv -maxdepth 3 -name "docker-compose*.yml" -o -name "docker-compose*.yaml" 2>/dev/null | head -10',
      description: 'Docker Compose file locations',
    },
    {
      name: 'supervisor_configs',
      command: 'ls /etc/supervisor/conf.d/ 2>/dev/null; cat /etc/supervisor/conf.d/*.conf 2>/dev/null | head -50',
      description: 'Supervisor configuration files',
    },
  ],

  security: [
    {
      name: 'firewall_rules',
      command: 'ufw status verbose 2>/dev/null || iptables -L -n --line-numbers 2>/dev/null | head -50 || echo "No firewall tool found"',
      description: 'Firewall rules and status',
    },
    {
      name: 'ssh_config',
      command: 'cat /etc/ssh/sshd_config 2>/dev/null | grep -v "^#" | grep -v "^$" | head -40',
      description: 'SSH daemon configuration (active settings only)',
    },
    {
      name: 'ssl_certs',
      command: 'find /etc/letsencrypt/live /etc/ssl/certs /etc/ssl/private -maxdepth 2 -type f 2>/dev/null | head -20; echo "---"; for cert in /etc/letsencrypt/live/*/cert.pem; do echo "=== $cert ==="; openssl x509 -in "$cert" -noout -subject -dates -issuer 2>/dev/null; done 2>/dev/null | head -30',
      description: 'SSL certificate locations and details',
    },
    {
      name: 'fail2ban',
      command: 'systemctl status fail2ban --no-pager 2>/dev/null; echo "---"; fail2ban-client status 2>/dev/null; echo "---"; fail2ban-client status sshd 2>/dev/null',
      description: 'Fail2ban status and jail info',
    },
    {
      name: 'open_ports',
      command: 'ss -tulnp 2>/dev/null | head -30 || netstat -tulnp 2>/dev/null | head -30',
      description: 'Open network ports and listening services',
    },
    {
      name: 'login_history',
      command: 'last -20 2>/dev/null',
      description: 'Recent login history',
    },
  ],
};

// ============================================================
// TEXT CHUNKING
// ============================================================

/**
 * Split text into chunks of max MAX_CHUNK_SIZE characters.
 * Tries to split on sentence boundaries or newlines for semantic coherence.
 * 
 * @param {string} text - Raw text to chunk
 * @param {Object} baseMetadata - Base metadata to attach to each chunk
 * @returns {Object[]} Array of { text, metadata } objects
 */
function chunkText(text, baseMetadata = {}) {
  if (!text || text.trim().length === 0) {
    return [];
  }

  const cleanedText = text.trim();
  const chunks = [];

  // Try splitting on double newlines first (paragraphs)
  const paragraphs = cleanedText.split(/\n\s*\n/);

  let currentChunk = '';

  for (const paragraph of paragraphs) {
    const trimmedParagraph = paragraph.trim();
    if (!trimmedParagraph) continue;

    if (currentChunk.length + trimmedParagraph.length + 2 <= MAX_CHUNK_SIZE) {
      currentChunk += (currentChunk ? '\n\n' : '') + trimmedParagraph;
    } else {
      // Current chunk is full, save it
      if (currentChunk) {
        chunks.push({
          text: currentChunk,
          metadata: { ...baseMetadata, chunk_index: chunks.length },
        });
      }

      // If the paragraph itself is too long, split on single newlines
      if (trimmedParagraph.length > MAX_CHUNK_SIZE) {
        const lines = trimmedParagraph.split('\n');
        currentChunk = '';

        for (const line of lines) {
          const trimmedLine = line.trim();
          if (!trimmedLine) continue;

          if (currentChunk.length + trimmedLine.length + 1 <= MAX_CHUNK_SIZE) {
            currentChunk += (currentChunk ? '\n' : '') + trimmedLine;
          } else {
            if (currentChunk) {
              chunks.push({
                text: currentChunk,
                metadata: { ...baseMetadata, chunk_index: chunks.length },
              });
            }

            // If a single line is too long, split by sentences or force split
            if (trimmedLine.length > MAX_CHUNK_SIZE) {
              const subChunks = splitLongLine(trimmedLine, MAX_CHUNK_SIZE);
              for (const subChunk of subChunks) {
                chunks.push({
                  text: subChunk,
                  metadata: { ...baseMetadata, chunk_index: chunks.length },
                });
              }
              currentChunk = '';
            } else {
              currentChunk = trimmedLine;
            }
          }
        }
      } else {
        currentChunk = trimmedParagraph;
      }
    }
  }

  // Save the last chunk
  if (currentChunk) {
    chunks.push({
      text: currentChunk,
      metadata: { ...baseMetadata, chunk_index: chunks.length },
    });
  }

  return chunks;
}

/**
 * Split a line that's too long into smaller pieces
 * @param {string} line - Long text line
 * @param {number} maxSize - Maximum chunk size
 * @returns {string[]} Array of smaller text pieces
 */
function splitLongLine(line, maxSize) {
  // Try splitting on sentence boundaries
  const sentences = line.split(/(?<=[.!?:;])\s+/);
  const chunks = [];
  let current = '';

  for (const sentence of sentences) {
    if (current.length + sentence.length + 1 <= maxSize) {
      current += (current ? ' ' : '') + sentence;
    } else {
      if (current) chunks.push(current);
      if (sentence.length > maxSize) {
        // Force split by characters
        for (let i = 0; i < sentence.length; i += maxSize) {
          chunks.push(sentence.slice(i, i + maxSize));
        }
        current = '';
      } else {
        current = sentence;
      }
    }
  }

  if (current) chunks.push(current);
  return chunks;
}

// ============================================================
// DATA COLLECTION
// ============================================================

/**
 * Collect infrastructure data for a specific collection type
 * @param {Object} serverConfig - SSH connection config
 * @param {string} collectionType - One of COLLECTION_TYPES
 * @param {number|string} serverId - Server identifier
 * @returns {Promise<Object>} Collection result
 */
async function collectCollectionData(serverConfig, collectionType, serverId) {
  const commands = COLLECTION_COMMANDS[collectionType];
  if (!commands) {
    throw new Error(`Unknown collection type: ${collectionType}`);
  }

  const collectedAt = new Date().toISOString();
  const allChunks = [];
  const rawResults = [];

  for (const cmd of commands) {
    try {
      logger.debug(`[RAG DataCollector] Running: ${cmd.name}`, {
        serverId,
        collectionType,
      });

      const result = await executeCommand(serverConfig, cmd.command, {
        pty: false,
      });

      const output = result.success
        ? result.output || ''
        : `ERROR: ${result.error || 'Command failed'}`;

      rawResults.push({
        name: cmd.name,
        command: cmd.command,
        success: result.success,
        outputLength: output.length,
      });

      // Format output as structured text
      const formattedText = formatCommandOutput(
        cmd.name,
        cmd.description,
        output,
        cmd.command
      );

      // Chunk the formatted text
      const chunks = chunkText(formattedText, {
        server_id: String(serverId),
        collection_type: collectionType,
        collected_at: collectedAt,
        source_command: cmd.name,
      });

      allChunks.push(...chunks);
    } catch (error) {
      logger.warn(`[RAG DataCollector] Command failed: ${cmd.name}`, {
        serverId,
        collectionType,
        error: error.message,
      });

      rawResults.push({
        name: cmd.name,
        command: cmd.command,
        success: false,
        error: error.message,
      });
    }
  }

  return {
    collectionType,
    chunks: allChunks,
    rawResults,
    commandCount: commands.length,
    successCount: rawResults.filter((r) => r.success).length,
  };
}

/**
 * Format command output into a structured text representation
 * @param {string} name - Command name
 * @param {string} description - What this command retrieves
 * @param {string} output - Raw command output
 * @param {string} command - The actual command that was run
 * @returns {string} Formatted text
 */
function formatCommandOutput(name, description, output, command) {
  const header = `[${name}] ${description}`;
  const truncatedOutput =
    output.length > 2000 ? output.slice(0, 2000) + '\n... (truncated)' : output;

  return `${header}\nCommand: ${command}\n${truncatedOutput}`;
}

/**
 * Store chunks into ChromaDB collection
 * @param {string} collectionName - ChromaDB collection name
 * @param {Object[]} chunks - Array of { text, metadata } objects
 * @returns {Promise<Object>} Storage result
 */
async function storeChunks(collectionName, chunks) {
  if (chunks.length === 0) {
    logger.debug('[RAG DataCollector] No chunks to store', { collectionName });
    return { stored: 0 };
  }

  try {
    // Ensure collection exists
    await getOrCreateCollection(collectionName, {
      metadata: { 'hnsw:space': 'cosine' },
    });

    // Generate IDs for each chunk
    const timestamp = Date.now();
    const ids = chunks.map(
      (_, index) => `${collectionName}_chunk_${timestamp}_${index}`
    );

    // Extract texts and metadatas
    const documents = chunks.map((c) => c.text);
    const metadatas = chunks.map((c) => c.metadata);

    // Generate embeddings
    logger.debug('[RAG DataCollector] Generating embeddings', {
      collectionName,
      chunkCount: chunks.length,
    });

    const embeddings = await generateEmbeddings(documents);

    // Store in ChromaDB
    await addDocuments(collectionName, ids, documents, embeddings, metadatas);

    logger.info('[RAG DataCollector] Chunks stored', {
      collectionName,
      count: chunks.length,
    });

    return { stored: chunks.length };
  } catch (error) {
    logger.warn('[RAG DataCollector] Failed to store chunks', {
      collectionName,
      error: error.message,
    });
    throw error;
  }
}

/**
 * Record a snapshot in SQLite
 * @param {number|string} serverId - Server ID
 * @param {string} collectionType - Collection type
 * @param {number} chunkCount - Number of chunks stored
 * @param {number} durationMs - Collection duration
 * @param {string} status - Status (success, partial, failed)
 * @param {string} [errorMessage] - Error message if any
 */
function recordSnapshot(serverId, collectionType, chunkCount, durationMs, status, errorMessage = null) {
  try {
    // Generate a simple hash of the collection type + server for change detection
    const snapshotHash = `${serverId}_${collectionType}_${Date.now()}`;

    db.prepare(`
      INSERT INTO rag_server_snapshots 
      (server_id, collection_type, snapshot_hash, chunk_count, last_collected_at, collection_duration_ms, status, error_message)
      VALUES (?, ?, ?, ?, datetime('now'), ?, ?, ?)
    `).run(String(serverId), collectionType, snapshotHash, chunkCount, durationMs, status, errorMessage);
  } catch (error) {
    logger.warn('[RAG DataCollector] Failed to record snapshot', {
      serverId,
      collectionType,
      error: error.message,
    });
  }
}

// ============================================================
// PUBLIC API
// ============================================================

/**
 * Collect all infrastructure data for a server
 * @param {number|string} serverId - Server ID
 * @param {Object} serverConfig - SSH connection config { host, port, username, password/privateKey }
 * @param {Object} [options] - Options
 * @param {string[]} [options.types] - Specific collection types to run (default: all)
 * @param {boolean} [options.incremental=true] - Only update changed data
 * @returns {Promise<Object>} Collection results
 */
export async function collectServerData(serverId, serverConfig, options = {}) {
  const startTime = Date.now();
  const types = options.types || COLLECTION_TYPES;
  const incremental = options.incremental !== false;

  logger.info('[RAG DataCollector] Starting data collection', {
    serverId,
    types,
    incremental,
  });

  const results = {
    serverId,
    collections: {},
    totalChunks: 0,
    totalDuration: 0,
    success: true,
    errors: [],
  };

  for (const collectionType of types) {
    const collectionName = `server_${serverId}_${collectionType}`;
    const collectionStart = Date.now();

    try {
      // Check if we should skip this collection (incremental mode)
      if (incremental) {
        const lastSnapshot = db
          .prepare(
            'SELECT * FROM rag_server_snapshots WHERE server_id = ? AND collection_type = ? AND status = ? ORDER BY last_collected_at DESC LIMIT 1'
          )
          .get(String(serverId), collectionType, 'success');

        const minInterval = parseInt(process.env.RAG_MIN_COLLECTION_INTERVAL) || 300000; // 5 minutes default
        if (lastSnapshot) {
          const lastCollected = new Date(lastSnapshot.last_collected_at).getTime();
          if (Date.now() - lastCollected < minInterval) {
            logger.debug('[RAG DataCollector] Skipping (too recent)', {
              serverId,
              collectionType,
              lastCollected: lastSnapshot.last_collected_at,
            });
            results.collections[collectionType] = {
              skipped: true,
              reason: 'Collection too recent',
              lastCollected: lastSnapshot.last_collected_at,
              chunkCount: lastSnapshot.chunk_count,
            };
            continue;
          }
        }
      }

      // Collect data
      const collected = await collectCollectionData(
        serverConfig,
        collectionType,
        serverId
      );

      // Store in ChromaDB (delete old data first for full refresh)
      if (collected.chunks.length > 0) {
        // Delete existing collection data before re-adding
        try {
          await deleteCollection(collectionName);
        } catch (e) {
          // Collection may not exist yet — that's fine
        }

        await storeChunks(collectionName, collected.chunks);
      }

      const collectionDuration = Date.now() - collectionStart;

      // Record snapshot
      const status = collected.successCount === collected.commandCount ? 'success' : 'partial';
      recordSnapshot(
        serverId,
        collectionType,
        collected.chunks.length,
        collectionDuration,
        status
      );

      results.collections[collectionType] = {
        chunks: collected.chunks.length,
        commands: collected.commandCount,
        successCount: collected.successCount,
        durationMs: collectionDuration,
        status,
      };

      results.totalChunks += collected.chunks.length;
    } catch (error) {
      const collectionDuration = Date.now() - collectionStart;
      logger.error('[RAG DataCollector] Collection failed', {
        serverId,
        collectionType,
        error: error.message,
      });

      recordSnapshot(
        serverId,
        collectionType,
        0,
        collectionDuration,
        'failed',
        error.message
      );

      results.collections[collectionType] = {
        chunks: 0,
        status: 'failed',
        error: error.message,
        durationMs: collectionDuration,
      };

      results.errors.push({
        collectionType,
        error: error.message,
      });

      results.success = false;
    }
  }

  results.totalDuration = Date.now() - startTime;

  logger.info('[RAG DataCollector] Collection complete', {
    serverId,
    totalChunks: results.totalChunks,
    totalDuration: results.totalDuration,
    success: results.success,
  });

  return results;
}

/**
 * Get the collection status for a server
 * @param {number|string} serverId - Server ID
 * @returns {Promise<Object>} Status of all collections for the server
 */
export async function getServerCollectionStatus(serverId) {
  const status = {
    serverId,
    collections: {},
    chromaAvailable: false,
  };

  try {
    const { isHealthy } = await import('./chroma-client.js');
    status.chromaAvailable = await isHealthy();
  } catch (e) {
    status.chromaAvailable = false;
  }

  for (const type of COLLECTION_TYPES) {
    const collectionName = `server_${serverId}_${type}`;

    // Get snapshot info from SQLite
    const lastSnapshot = db
      .prepare(
        'SELECT * FROM rag_server_snapshots WHERE server_id = ? AND collection_type = ? ORDER BY last_collected_at DESC LIMIT 1'
      )
      .get(String(serverId), type);

    let documentCount = 0;
    if (status.chromaAvailable) {
      try {
        documentCount = await countDocuments(collectionName);
      } catch (e) {
        documentCount = 0;
      }
    }

    status.collections[type] = {
      collectionName,
      documentCount,
      lastSnapshot: lastSnapshot
        ? {
            chunkCount: lastSnapshot.chunk_count,
            collectedAt: lastSnapshot.last_collected_at,
            status: lastSnapshot.status,
            durationMs: lastSnapshot.collection_duration_ms,
            error: lastSnapshot.error_message,
          }
        : null,
    };
  }

  return status;
}

/**
 * Delete all collections for a server
 * @param {number|string} serverId - Server ID
 * @returns {Promise<Object>} Deletion result
 */
export async function deleteServerCollections(serverId) {
  const results = {
    serverId,
    deleted: [],
    errors: [],
  };

  for (const type of COLLECTION_TYPES) {
    const collectionName = `server_${serverId}_${type}`;

    try {
      const deleted = await deleteCollection(collectionName);
      if (deleted) {
        results.deleted.push(collectionName);
      }
    } catch (error) {
      results.errors.push({
        collection: collectionName,
        error: error.message,
      });
    }
  }

  // Also clean up snapshot records
  try {
    db.prepare('DELETE FROM rag_server_snapshots WHERE server_id = ?').run(
      String(serverId)
    );
  } catch (error) {
    logger.warn('[RAG DataCollector] Failed to clean snapshot records', {
      serverId,
      error: error.message,
    });
  }

  logger.info('[RAG DataCollector] Server collections deleted', {
    serverId,
    deletedCount: results.deleted.length,
  });

  return results;
}

/**
 * Get all collection type names
 * @returns {string[]}
 */
export function getCollectionTypes() {
  return [...COLLECTION_TYPES];
}

export default {
  collectServerData,
  getServerCollectionStatus,
  deleteServerCollections,
  getCollectionTypes,
};
