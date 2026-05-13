/**
 * ============================================================
 * Checkpoint Manager — Git-based state snapshots
 * ============================================================
 *
 * Before any AI-initiated file modification, auto-commit
 * a checkpoint. On failure: rollback via git checkout.
 *
 * @module CheckpointManager
 * @version 2.0.0
 */

import { executeCommand } from '../agent-executor.js';
import logger from '../../config/logger.js';
import { db } from '../database-sqlite.js';

class CheckpointManager {
  constructor() {
    this.workspacePaths = new Map(); // serverId -> workspace path
  }

  /**
   * Set the workspace path for a server
   * @param {number|string} serverId
   * @param {string} path
   */
  setWorkspacePath(serverId, path) {
    this.workspacePaths.set(String(serverId), path);
  }

  /**
   * Get the workspace path for a server
   * @param {number|string} serverId
   * @returns {string}
   */
  getWorkspacePath(serverId) {
    return this.workspacePaths.get(String(serverId)) || '/opt/agent-projects';
  }

  /**
   * Ensure git is initialized in the workspace
   * @param {Object} serverConfig - SSH connection config
   * @param {string} repoPath - Repository path
   * @returns {Promise<boolean>}
   */
  async ensureGitInit(serverConfig, repoPath) {
    try {
      // Check if .git exists
      const checkResult = await executeCommand(
        serverConfig,
        `test -d "${repoPath}/.git" && echo "exists" || echo "not_found"`
      );

      if (checkResult.output && checkResult.output.trim() === 'exists') {
        return true;
      }

      // Initialize git repo
      logger.info(`[Checkpoints] Initializing git repo at ${repoPath}`);
      const initResult = await executeCommand(
        serverConfig,
        `cd "${repoPath}" && git init && git add -A && git commit -m "initial: auto-checkpoint baseline" --allow-empty`
      );

      return initResult.success;
    } catch (error) {
      logger.error('[Checkpoints] Git init failed:', { error: error.message });
      return false;
    }
  }

  /**
   * Create a checkpoint before an AI action
   * @param {Object} serverConfig - SSH connection config
   * @param {Object} options
   * @param {number} options.serverId
   * @param {string} options.toolName - Tool that triggered the checkpoint
   * @param {string} options.riskLevel - Risk level of the action
   * @param {Array} options.affectedPaths - File paths that will be modified
   * @param {number} options.executionId - ReAct execution ID
   * @param {number} options.conversationId
   * @param {string} options.userId
   * @returns {Promise<Object>} Checkpoint result with commit hash
   */
  async create(serverConfig, options = {}) {
    const {
      serverId,
      toolName = 'unknown',
      riskLevel = 'MODERATE',
      affectedPaths = [],
      executionId = null,
      conversationId = null,
      userId = 'system'
    } = options;

    const repoPath = this.getWorkspacePath(serverId);

    try {
      // 1. Ensure git is initialized
      await this.ensureGitInit(serverConfig, repoPath);

      // 2. Check for uncommitted changes
      const statusResult = await executeCommand(
        serverConfig,
        `cd "${repoPath}" && git status --porcelain`
      );

      if (!statusResult.success || !statusResult.output || statusResult.output.trim() === '') {
        // No changes to checkpoint
        logger.info('[Checkpoints] No changes to checkpoint');
        return {
          success: true,
          message: 'No changes to checkpoint',
          commitHash: null,
          skipped: true
        };
      }

      // 3. Stage and commit
      const timestamp = new Date().toISOString();
      const message = `checkpoint: before ${toolName} [${riskLevel}] [${timestamp}]`;
      const commitResult = await executeCommand(
        serverConfig,
        `cd "${repoPath}" && git add -A && git commit -m "${message}" --allow-empty`
      );

      if (!commitResult.success) {
        logger.error('[Checkpoints] Commit failed:', { error: commitResult.error });
        return {
          success: false,
          error: 'Failed to create checkpoint commit',
          details: commitResult.error
        };
      }

      // 4. Get the commit hash
      const hashResult = await executeCommand(
        serverConfig,
        `cd "${repoPath}" && git rev-parse HEAD`
      );

      const commitHash = hashResult.success ? hashResult.output.trim() : null;

      // 5. Record in database
      let checkpointId = null;
      try {
        const dbResult = db.prepare(`
          INSERT INTO git_checkpoints (
            server_id, execution_id, conversation_id, user_id,
            commit_hash, commit_message, affected_paths, tool_name, risk_level
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          serverId,
          executionId,
          conversationId,
          userId,
          commitHash,
          message,
          JSON.stringify(affectedPaths),
          toolName,
          riskLevel
        );
        checkpointId = dbResult.lastInsertRowid;
      } catch (dbError) {
        logger.error('[Checkpoints] DB insert failed:', { error: dbError.message });
      }

      logger.info(`[Checkpoints] Created checkpoint ${commitHash?.substring(0, 8)} for ${toolName}`);

      return {
        success: true,
        commitHash,
        checkpointId,
        message,
        affectedPaths,
        skipped: false
      };

    } catch (error) {
      logger.error('[Checkpoints] Create failed:', { error: error.message });
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Rollback to a specific checkpoint
   * @param {number} checkpointId - Database checkpoint ID
   * @param {Object} serverConfig - SSH connection config
   * @param {string} rolledBackBy - User ID who initiated rollback
   * @returns {Promise<Object>}
   */
  async rollback(checkpointId, serverConfig, rolledBackBy = 'system') {
    try {
      // Get checkpoint from DB
      const checkpoint = db.prepare('SELECT * FROM git_checkpoints WHERE id = ?').get(checkpointId);

      if (!checkpoint) {
        return { success: false, error: 'Checkpoint not found' };
      }

      if (checkpoint.status === 'rolled_back') {
        return { success: false, error: 'Checkpoint already rolled back' };
      }

      const repoPath = this.getWorkspacePath(checkpoint.server_id);

      // Execute git checkout on the server
      const result = await executeCommand(
        serverConfig,
        `cd "${repoPath}" && git checkout ${checkpoint.commit_hash} -- . 2>&1`
      );

      if (result.success) {
        // Update checkpoint status
        db.prepare(`
          UPDATE git_checkpoints
          SET status = 'rolled_back', rolled_back_at = datetime('now'), rolled_back_by = ?
          WHERE id = ?
        `).run(rolledBackBy, checkpointId);

        logger.info(`[Checkpoints] Rolled back to ${checkpoint.commit_hash?.substring(0, 8)}`);
      }

      return {
        success: result.success,
        checkpoint: {
          id: checkpoint.id,
          commitHash: checkpoint.commit_hash,
          message: checkpoint.commit_message,
          toolName: checkpoint.tool_name
        },
        output: result.output,
        error: result.error
      };

    } catch (error) {
      logger.error('[Checkpoints] Rollback failed:', { error: error.message });
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Quick rollback to latest checkpoint
   * @param {number} serverId
   * @param {Object} serverConfig
   * @returns {Promise<Object>}
   */
  async rollbackLatest(serverId, serverConfig) {
    try {
      const latest = db.prepare(`
        SELECT * FROM git_checkpoints
        WHERE server_id = ? AND status = 'active'
        ORDER BY created_at DESC LIMIT 1
      `).get(serverId);

      if (!latest) {
        return { success: false, error: 'No active checkpoints found for this server' };
      }

      return await this.rollback(latest.id, serverConfig);
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * List checkpoints for a server
   * @param {number} serverId
   * @param {Object} options
   * @returns {Array}
   */
  list(serverId, options = {}) {
    const { limit = 20, status = null } = options;

    try {
      let query = 'SELECT * FROM git_checkpoints WHERE server_id = ?';
      const params = [serverId];

      if (status) {
        query += ' AND status = ?';
        params.push(status);
      }

      query += ' ORDER BY created_at DESC LIMIT ?';
      params.push(limit);

      return db.prepare(query).all(...params);
    } catch (error) {
      logger.error('[Checkpoints] List failed:', { error: error.message });
      return [];
    }
  }

  /**
   * Prune old checkpoints (keep last N)
   * @param {number} serverId
   * @param {number} keepCount
   * @returns {number} Number of pruned checkpoints
   */
  prune(serverId, keepCount = 50) {
    try {
      const result = db.prepare(`
        DELETE FROM git_checkpoints
        WHERE server_id = ? AND status = 'superseded'
        AND id NOT IN (
          SELECT id FROM git_checkpoints
          WHERE server_id = ?
          ORDER BY created_at DESC
          LIMIT ?
        )
      `).run(serverId, serverId, keepCount);

      return result.changes;
    } catch (error) {
      logger.error('[Checkpoints] Prune failed:', { error: error.message });
      return 0;
    }
  }
}

// Singleton
const checkpointManager = new CheckpointManager();
export default checkpointManager;
