/**
 * Notifier Factory — Route approval notifications to configured channels
 * @module NotifierFactory
 */

import telegramNotifier from './telegram.js';
import webhookNotifier from './webhook.js';
import websocketNotifier from './websocket.js';
import logger from '../../../config/logger.js';

/**
 * Get the primary notifier based on configuration
 * @returns {Object} Notifier instance
 */
export function getNotifier() {
  // Priority: Telegram > Webhook > WebSocket
  if (telegramNotifier.isConfigured()) {
    return telegramNotifier;
  }
  if (webhookNotifier.isConfigured()) {
    return webhookNotifier;
  }
  if (websocketNotifier.isConfigured()) {
    return websocketNotifier;
  }

  logger.info('[NotifierFactory] No notifier configured. Approval notifications will be stored in DB only.');
  return null;
}

/**
 * Send to ALL configured notifiers
 * @param {string} approvalId
 * @param {Object} details
 */
export async function notifyAll(approvalId, details) {
  const results = [];

  if (telegramNotifier.isConfigured()) {
    try {
      await telegramNotifier.sendApprovalRequest(approvalId, details);
      results.push({ channel: 'telegram', success: true });
    } catch (e) {
      results.push({ channel: 'telegram', success: false, error: e.message });
    }
  }

  if (webhookNotifier.isConfigured()) {
    try {
      await webhookNotifier.sendApprovalRequest(approvalId, details);
      results.push({ channel: 'webhook', success: true });
    } catch (e) {
      results.push({ channel: 'webhook', success: false, error: e.message });
    }
  }

  if (websocketNotifier.isConfigured()) {
    try {
      await websocketNotifier.sendApprovalRequest(approvalId, details);
      results.push({ channel: 'websocket', success: true });
    } catch (e) {
      results.push({ channel: 'websocket', success: false, error: e.message });
    }
  }

  return results;
}

export { telegramNotifier, webhookNotifier, websocketNotifier };
export default { getNotifier, notifyAll, telegramNotifier, webhookNotifier, websocketNotifier };
