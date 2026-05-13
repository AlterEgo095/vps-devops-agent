/**
 * ============================================================
 * Approvals API Routes
 * ============================================================
 * Human-in-the-loop approval workflow
 *
 * Supports:
 * - Web UI approvals (JWT-authenticated)
 * - Telegram inline keyboard callbacks
 * - n8n WhatsApp webhook callbacks
 * - Resume signal for ReAct orchestrator integration
 */

import express from 'express';
import { authenticateToken } from '../middleware/auth.js';
import approvalManager from '../services/approvals/manager.js';
import { telegramNotifier } from '../services/approvals/notifiers/index.js';
import logger from '../config/logger.js';

const router = express.Router();

/**
 * GET /api/approvals/pending
 * List all pending approvals for current user
 */
router.get('/pending', authenticateToken, (req, res) => {
  const userId = req.user?.id || 'unknown';
  const pending = approvalManager.getPending(userId);
  res.json({ success: true, approvals: pending, count: pending.length });
});

/**
 * GET /api/approvals/:id
 * Get approval request details
 */
router.get('/:id', authenticateToken, (req, res) => {
  const approval = approvalManager.getById(req.params.id);
  if (!approval) {
    return res.status(404).json({ success: false, error: 'Approval request not found' });
  }
  res.json({ success: true, approval });
});

/**
 * POST /api/approvals/:id/approve
 * Approve a pending request
 */
router.post('/:id/approve', authenticateToken, async (req, res) => {
  try {
    const userId = req.user?.id || 'unknown';
    const { reason } = req.body;

    const result = approvalManager.approve(req.params.id, userId, reason || 'Approved via web UI');

    // Update Telegram message if applicable
    if (result.success) {
      const approval = approvalManager.getById(req.params.id);
      if (approval?.telegram_message_id && approval?.telegram_chat_id) {
        await telegramNotifier.updateMessage(approval.telegram_chat_id, approval.telegram_message_id, 'approved');
      }
    }

    res.json(result);
  } catch (error) {
    logger.error('[Approvals] Web approve error:', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/approvals/:id/reject
 * Reject a pending request
 */
router.post('/:id/reject', authenticateToken, async (req, res) => {
  try {
    const userId = req.user?.id || 'unknown';
    const { reason } = req.body;

    const result = approvalManager.reject(req.params.id, userId, reason || 'Rejected via web UI');

    // Update Telegram message if applicable
    if (result.success) {
      const approval = approvalManager.getById(req.params.id);
      if (approval?.telegram_message_id && approval?.telegram_chat_id) {
        await telegramNotifier.updateMessage(approval.telegram_chat_id, approval.telegram_message_id, 'rejected');
      }
    }

    res.json(result);
  } catch (error) {
    logger.error('[Approvals] Web reject error:', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/approvals/webhook/telegram
 * Telegram callback webhook (inline keyboard button press)
 * Legacy path — kept for backward compatibility
 */
router.post('/webhook/telegram', async (req, res) => {
  try {
    const { callback_query } = req.body;

    if (!callback_query) {
      return res.status(400).json({ error: 'Missing callback_query' });
    }

    const { action, approvalId } = telegramNotifier.parseCallback(callback_query);
    const userId = callback_query.from?.id?.toString() || 'telegram';

    if (action === 'approve') {
      const result = approvalManager.approve(approvalId, userId, 'Approved via Telegram');
      if (result.success) {
        await telegramNotifier.updateMessage(
          callback_query.message?.chat?.id?.toString(),
          callback_query.message?.message_id?.toString(),
          'approved'
        );
      }
    } else if (action === 'reject') {
      const result = approvalManager.reject(approvalId, userId, 'Rejected via Telegram');
      if (result.success) {
        await telegramNotifier.updateMessage(
          callback_query.message?.chat?.id?.toString(),
          callback_query.message?.message_id?.toString(),
          'rejected'
        );
      }
    }

    res.json({ ok: true });
  } catch (error) {
    logger.error('[Approvals] Telegram webhook error:', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/approvals/telegram/webhook
 * Telegram callback_query webhook for approve/reject buttons
 * Receives Telegram callback_query for inline keyboard button presses.
 * Data format: "approve:UUID" or "reject:UUID"
 */
router.post('/telegram/webhook', async (req, res) => {
  try {
    const { callback_query } = req.body;

    if (!callback_query) {
      return res.status(400).json({ error: 'Missing callback_query' });
    }

    // Parse callback data: format is "approve:UUID" or "reject:UUID"
    const { action, approvalId } = telegramNotifier.parseCallback(callback_query);
    const userId = callback_query.from?.id?.toString() || 'telegram';

    logger.info(`[Approvals] Telegram webhook — action: ${action}, approvalId: ${approvalId}, from: ${userId}`);

    if (action === 'approve') {
      const result = approvalManager.approve(approvalId, userId, 'Approved via Telegram');
      if (result.success) {
        // Update the Telegram message to show approved status
        await telegramNotifier.updateMessage(
          callback_query.message?.chat?.id?.toString(),
          callback_query.message?.message_id?.toString(),
          'approved'
        );
        logger.info(`[Approvals] Telegram approval succeeded — approvalId: ${approvalId}`);
      } else {
        logger.warn(`[Approvals] Telegram approval failed — approvalId: ${approvalId}, error: ${result.error}`);
      }
    } else if (action === 'reject') {
      const result = approvalManager.reject(approvalId, userId, 'Rejected via Telegram');
      if (result.success) {
        await telegramNotifier.updateMessage(
          callback_query.message?.chat?.id?.toString(),
          callback_query.message?.message_id?.toString(),
          'rejected'
        );
        logger.info(`[Approvals] Telegram rejection succeeded — approvalId: ${approvalId}`);
      }
    }

    res.json({ ok: true });
  } catch (error) {
    logger.error('[Approvals] Telegram webhook error:', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/approvals/webhook/n8n
 * n8n WhatsApp webhook callback
 */
router.post('/webhook/n8n', (req, res) => {
  try {
    const { approvalId, action, decidedBy, reason } = req.body;

    if (!approvalId || !action) {
      return res.status(400).json({ error: 'Missing approvalId or action' });
    }

    if (action === 'approve') {
      approvalManager.approve(approvalId, decidedBy || 'n8n', reason || 'Approved via WhatsApp');
    } else if (action === 'reject') {
      approvalManager.reject(approvalId, decidedBy || 'n8n', reason || 'Rejected via WhatsApp');
    }

    res.json({ ok: true });
  } catch (error) {
    logger.error('[Approvals] n8n webhook error:', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

export default router;
