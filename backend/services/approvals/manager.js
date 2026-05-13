/**
 * ============================================================
 * Approval Manager — Human-in-the-Loop for CRITICAL operations
 * ============================================================
 *
 * Telegram/WhatsApp/WebSocket notifications for operations
 * requiring human approval. Async pause/resume execution.
 *
 * @module ApprovalManager
 * @version 2.0.0
 */

import { v4 as uuidv4 } from 'uuid';
import logger from '../../config/logger.js';
import { db } from '../database-sqlite.js';
import { getNotifier } from './notifiers/index.js';

class ApprovalManager {
  constructor() {
    this.pendingApprovals = new Map(); // approvalId -> { resolve, reject, timeout }
    this.resumeSignals = new Map();    // executionId -> { approvalId, approvedBy, timestamp }
    this.defaultTimeoutMinutes = 30;
  }

  /**
   * Request approval for a CRITICAL/MODERATE operation
   * @param {Object} options
   * @param {string} options.toolName - Tool that needs approval
   * @param {Object} options.toolArgs - Tool arguments
   * @param {string} options.riskLevel - Risk level
   * @param {string} options.reason - Why this action is proposed
   * @param {string} options.aiReasoning - AI's justification
   * @param {string} options.userId - User ID
   * @param {number} options.serverId - Server ID
   * @param {number} options.executionId - ReAct execution ID
   * @param {number} options.conversationId
   * @param {number} options.timeoutMinutes - Timeout for approval
   * @returns {Promise<Object>} Approval result
   */
  async requestApproval(options = {}) {
    const {
      toolName,
      toolArgs,
      riskLevel = 'CRITICAL',
      reason = '',
      aiReasoning = '',
      userId,
      serverId,
      executionId = null,
      conversationId = null,
      timeoutMinutes = this.defaultTimeoutMinutes
    } = options;

    // Generate unique approval ID
    const approvalId = uuidv4();
    const expiresAt = new Date(Date.now() + timeoutMinutes * 60000).toISOString();

    // Store in database
    try {
      db.prepare(`
        INSERT INTO approval_requests (
          id, execution_id, conversation_id, user_id, server_id,
          tool_name, tool_args, risk_level, reason, ai_reasoning,
          status, timeout_minutes, expires_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)
      `).run(
        approvalId,
        executionId,
        conversationId,
        userId,
        serverId,
        toolName,
        JSON.stringify(toolArgs),
        riskLevel,
        reason,
        aiReasoning,
        timeoutMinutes,
        expiresAt
      );
    } catch (dbError) {
      logger.error('[Approvals] DB insert failed:', { error: dbError.message });
    }

    // Send notifications
    await this._sendNotifications(approvalId, {
      toolName, toolArgs, riskLevel, reason, serverId, expiresAt
    });

    logger.info(`[Approvals] Approval requested: ${approvalId} for ${toolName} (${riskLevel})`);

    // Return a Promise that resolves when approved/rejected/expired
    return new Promise((resolve, reject) => {
      // Store the resolve/reject for later
      this.pendingApprovals.set(approvalId, {
        resolve,
        reject,
        timeout: setTimeout(() => {
          this._handleExpiry(approvalId);
        }, timeoutMinutes * 60000)
      });

      // Return immediately with the approval ID (for async workflows)
      resolve({
        status: 'awaiting_approval',
        approvalId,
        expiresAt,
        toolName,
        riskLevel
      });
    });
  }

  /**
   * Check if an action needs approval and return a simple result
   * (Non-blocking version for synchronous workflows)
   * @param {Object} tool
   * @param {Object} context
   * @returns {Object} { needsApproval, approvalId, status }
   */
  checkApprovalNeeded(tool, context = {}) {
    if (!tool.needs_approval && tool.risk_level !== 'CRITICAL') {
      return { needsApproval: false, approved: true };
    }

    // For synchronous check, we just return that approval is needed
    // The actual approval request will be made asynchronously
    return {
      needsApproval: true,
      approved: false,
      riskLevel: tool.risk_level
    };
  }

  /**
   * Approve a pending request
   * @param {string} approvalId
   * @param {string} decidedBy - User ID who approved
   * @param {string} reason - Approval reason
   * @returns {Object}
   */
  approve(approvalId, decidedBy, reason = '') {
    try {
      const approval = db.prepare('SELECT * FROM approval_requests WHERE id = ?').get(approvalId);

      if (!approval) {
        return { success: false, error: 'Approval request not found' };
      }

      if (approval.status !== 'pending') {
        return { success: false, error: `Approval already ${approval.status}` };
      }

      // Update in DB
      db.prepare(`
        UPDATE approval_requests
        SET status = 'approved', decision_by = ?, decision_at = datetime('now'), decision_reason = ?
        WHERE id = ?
      `).run(decidedBy, reason, approvalId);

      // Resolve the pending promise
      const pending = this.pendingApprovals.get(approvalId);
      if (pending) {
        clearTimeout(pending.timeout);
        this.pendingApprovals.delete(approvalId);
      }

      logger.info(`[Approvals] Approved: ${approvalId} by ${decidedBy}`);

      // Emit resume signal for the ReAct orchestrator if there's a linked execution
      if (approval.execution_id) {
        this._emitResumeSignal(approvalId, approval.execution_id, decidedBy);
      }

      return {
        success: true,
        approvalId,
        status: 'approved',
        toolName: approval.tool_name,
        toolArgs: JSON.parse(approval.tool_args)
      };

    } catch (error) {
      logger.error('[Approvals] Approve failed:', { error: error.message });
      return { success: false, error: error.message };
    }
  }

  /**
   * Reject a pending request
   * @param {string} approvalId
   * @param {string} decidedBy
   * @param {string} reason
   * @returns {Object}
   */
  reject(approvalId, decidedBy, reason = '') {
    try {
      const approval = db.prepare('SELECT * FROM approval_requests WHERE id = ?').get(approvalId);

      if (!approval) {
        return { success: false, error: 'Approval request not found' };
      }

      if (approval.status !== 'pending') {
        return { success: false, error: `Approval already ${approval.status}` };
      }

      // Update in DB
      db.prepare(`
        UPDATE approval_requests
        SET status = 'rejected', decision_by = ?, decision_at = datetime('now'), decision_reason = ?
        WHERE id = ?
      `).run(decidedBy, reason, approvalId);

      // Resolve the pending promise
      const pending = this.pendingApprovals.get(approvalId);
      if (pending) {
        clearTimeout(pending.timeout);
        this.pendingApprovals.delete(approvalId);
      }

      logger.info(`[Approvals] Rejected: ${approvalId} by ${decidedBy}`);

      return {
        success: true,
        approvalId,
        status: 'rejected'
      };

    } catch (error) {
      logger.error('[Approvals] Reject failed:', { error: error.message });
      return { success: false, error: error.message };
    }
  }

  /**
   * Get pending approvals for a user
   * @param {string} userId
   * @returns {Array}
   */
  getPending(userId = null) {
    try {
      let query = "SELECT * FROM approval_requests WHERE status = 'pending'";
      const params = [];

      if (userId) {
        query += ' AND user_id = ?';
        params.push(userId);
      }

      query += ' ORDER BY created_at DESC';

      return db.prepare(query).all(...params);
    } catch (error) {
      logger.error('[Approvals] Get pending failed:', { error: error.message });
      return [];
    }
  }

  /**
   * Get approval by ID
   * @param {string} approvalId
   * @returns {Object|null}
   */
  getById(approvalId) {
    try {
      return db.prepare('SELECT * FROM approval_requests WHERE id = ?').get(approvalId);
    } catch (error) {
      return null;
    }
  }

  /**
   * Handle approval expiry
   * @param {string} approvalId
   */
  _handleExpiry(approvalId) {
    try {
      db.prepare(`
        UPDATE approval_requests
        SET status = 'expired', decision_at = datetime('now')
        WHERE id = ? AND status = 'pending'
      `).run(approvalId);

      const pending = this.pendingApprovals.get(approvalId);
      if (pending) {
        this.pendingApprovals.delete(approvalId);
      }

      logger.warn(`[Approvals] Expired: ${approvalId}`);
    } catch (error) {
      logger.error('[Approvals] Expiry handling failed:', { error: error.message });
    }
  }

  /**
   * Clean up expired approvals (called by cron)
   * @returns {number} Number of expired approvals
   */
  cleanupExpired() {
    try {
      const result = db.prepare(`
        UPDATE approval_requests
        SET status = 'expired', decision_at = datetime('now')
        WHERE status = 'pending' AND expires_at < datetime('now')
      `).run();

      if (result.changes > 0) {
        logger.info(`[Approvals] Cleaned up ${result.changes} expired approvals`);
      }

      return result.changes;
    } catch (error) {
      logger.error('[Approvals] Cleanup failed:', { error: error.message });
      return 0;
    }
  }

  /**
   * Emit a resume signal so the ReAct orchestrator can pick it up
   * @param {string} approvalId
   * @param {number} executionId
   * @param {string} approvedBy
   */
  _emitResumeSignal(approvalId, executionId, approvedBy) {
    this.resumeSignals.set(executionId, {
      approvalId,
      approvedBy,
      timestamp: Date.now()
    });
    logger.info(`[Approvals] Resume signal emitted for execution ${executionId}, approval ${approvalId}`);
  }

  /**
   * Check if there's a resume signal for an execution
   * @param {number} executionId
   * @returns {boolean}
   */
  hasResumeSignal(executionId) {
    return this.resumeSignals?.has(executionId) || false;
  }

  /**
   * Consume (get + delete) a resume signal for an execution
   * @param {number} executionId
   * @returns {Object|null} The resume signal data
   */
  consumeResumeSignal(executionId) {
    const signal = this.resumeSignals?.get(executionId);
    if (signal) {
      this.resumeSignals.delete(executionId);
      logger.info(`[Approvals] Resume signal consumed for execution ${executionId}`);
    }
    return signal || null;
  }

  /**
   * Send notifications for an approval request
   * @param {string} approvalId
   * @param {Object} details
   */
  async _sendNotifications(approvalId, details) {
    try {
      const notifier = getNotifier();
      if (notifier) {
        await notifier.sendApprovalRequest(approvalId, details);
      }
    } catch (error) {
      logger.error('[Approvals] Notification failed:', { error: error.message });
    }
  }
}

// Singleton
const approvalManager = new ApprovalManager();
export default approvalManager;
