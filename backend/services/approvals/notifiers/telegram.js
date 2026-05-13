/**
 * Telegram Notifier — Send approval requests via Telegram Bot
 * @module TelegramNotifier
 */

import axios from 'axios';
import logger from '../../../config/logger.js';

class TelegramNotifier {
  constructor() {
    this.botToken = process.env.TELEGRAM_BOT_TOKEN;
    this.chatId = process.env.TELEGRAM_CHAT_ID;
    this.apiBase = `https://api.telegram.org/bot${this.botToken}`;
  }

  isConfigured() {
    return !!(this.botToken && this.chatId);
  }

  /**
   * Send an approval request via Telegram
   * @param {string} approvalId
   * @param {Object} details
   */
  async sendApprovalRequest(approvalId, details) {
    if (!this.isConfigured()) {
      logger.info('[Telegram] Not configured, skipping notification');
      return;
    }

    const { toolName, toolArgs, riskLevel, reason, serverId, expiresAt } = details;

    const riskEmoji = riskLevel === 'CRITICAL' ? '🔴' : riskLevel === 'MODERATE' ? '🟡' : '🟢';

    const text = [
      `${riskEmoji} *APPROVAL REQUIRED*`,
      '',
      `*Server ID:* ${serverId || 'N/A'}`,
      `*Tool:* \`${toolName}\``,
      `*Risk:* ${riskLevel}`,
      `*Reason:* ${reason || 'AI-proposed action'}`,
      '',
      `*Arguments:*`,
      '```',
      JSON.stringify(toolArgs, null, 2).substring(0, 500),
      '```',
      '',
      `⏱ Expires: ${expiresAt || '30 min'}`,
      '',
      `Approval ID: \`${approvalId}\``
    ].join('\n');

    const inlineKeyboard = {
      inline_keyboard: [
        [
          { text: '✅ Approve', callback_data: `approve:${approvalId}` },
          { text: '❌ Reject', callback_data: `reject:${approvalId}` }
        ]
      ]
    };

    try {
      const response = await axios.post(`${this.apiBase}/sendMessage`, {
        chat_id: this.chatId,
        text,
        parse_mode: 'Markdown',
        reply_markup: inlineKeyboard
      });

      // Store telegram message ID for updates
      const messageId = response.data?.result?.message_id;
      if (messageId && db) {
        db.prepare(`
          UPDATE approval_requests
          SET telegram_message_id = ?, telegram_chat_id = ?
          WHERE id = ?
        `).run(String(messageId), this.chatId, approvalId);
      }

      logger.info(`[Telegram] Approval request sent: ${approvalId}`);
    } catch (error) {
      logger.error('[Telegram] Send failed:', { error: error.message });
    }
  }

  /**
   * Handle Telegram callback (inline keyboard button press)
   * @param {Object} callbackQuery
   * @returns {Object} { action, approvalId }
   */
  parseCallback(callbackQuery) {
    const data = callbackQuery.data;
    const [action, approvalId] = data.split(':');
    return { action, approvalId };
  }

  /**
   * Update a Telegram message after approval/rejection
   * @param {string} chatId
   * @param {string} messageId
   * @param {string} status
   */
  async updateMessage(chatId, messageId, status) {
    if (!this.isConfigured()) return;

    const statusEmoji = status === 'approved' ? '✅' : status === 'rejected' ? '❌' : '⏰';
    const text = `${statusEmoji} *${status.toUpperCase()}*`;

    try {
      await axios.post(`${this.apiBase}/editMessageText`, {
        chat_id: chatId,
        message_id: messageId,
        text,
        parse_mode: 'Markdown'
      });
    } catch (error) {
      logger.error('[Telegram] Update failed:', { error: error.message });
    }
  }
}

export default new TelegramNotifier();
