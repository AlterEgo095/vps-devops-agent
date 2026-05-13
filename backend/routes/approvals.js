/**
 * ============================================================
 * Approvals API Routes
 * ============================================================
 * Human-in-the-loop approval workflow
 */

import express from 'express';
import { authenticateToken } from '../middleware/auth.js';
import approvalManager from '../services/approvals/manager.js';
import { telegramNotifier } from '../services/approvals/notifiers/index.js';

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
});

/**
 * POST /api/approvals/:id/reject
 * Reject a pending request
 */
router.post('/:id/reject', authenticateToken, async (req, res) => {
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
});

/**
 * POST /api/approvals/webhook/telegram
 * Telegram callback webhook (inline keyboard button press)
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
    res.status(500).json({ error: error.message });
  }
});

export default router;
