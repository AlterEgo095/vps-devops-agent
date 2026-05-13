/**
 * Webhook Notifier — Forward approval requests to n8n/WhatsApp webhooks
 * @module WebhookNotifier
 */

import axios from 'axios';
import logger from '../../../config/logger.js';

class WebhookNotifier {
  constructor() {
    this.webhookUrl = process.env.APPROVAL_WEBHOOK_URL;
  }

  isConfigured() {
    return !!this.webhookUrl;
  }

  /**
   * Send approval request via webhook
   * @param {string} approvalId
   * @param {Object} details
   */
  async sendApprovalRequest(approvalId, details) {
    if (!this.isConfigured()) {
      logger.info('[Webhook] Not configured, skipping notification');
      return;
    }

    try {
      await axios.post(this.webhookUrl, {
        type: 'approval_request',
        approvalId,
        ...details,
        approveUrl: `${process.env.BASE_URL || 'http://localhost:4000'}/api/approvals/${approvalId}/approve`,
        rejectUrl: `${process.env.BASE_URL || 'http://localhost:4000'}/api/approvals/${approvalId}/reject`,
        timestamp: new Date().toISOString()
      });

      logger.info(`[Webhook] Approval request sent: ${approvalId}`);
    } catch (error) {
      logger.error('[Webhook] Send failed:', { error: error.message });
    }
  }
}

export default new WebhookNotifier();
