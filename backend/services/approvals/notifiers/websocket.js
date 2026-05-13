/**
 * WebSocket Notifier — Real-time in-app approval notifications
 * @module WebSocketNotifier
 */

import logger from '../../../config/logger.js';

class WebSocketNotifier {
  constructor() {
    this.wss = null;
  }

  /**
   * Set the WebSocket server instance
   * @param {WebSocket.Server} wss
   */
  setServer(wss) {
    this.wss = wss;
  }

  isConfigured() {
    return !!this.wss;
  }

  /**
   * Send approval request via WebSocket
   * @param {string} approvalId
   * @param {Object} details
   */
  async sendApprovalRequest(approvalId, details) {
    if (!this.isConfigured()) {
      logger.info('[WebSocket] Not configured, skipping notification');
      return;
    }

    try {
      const message = JSON.stringify({
        type: 'approval_request',
        approvalId,
        toolName: details.toolName,
        riskLevel: details.riskLevel,
        reason: details.reason,
        serverId: details.serverId,
        expiresAt: details.expiresAt,
        timestamp: new Date().toISOString()
      });

      // Broadcast to all connected clients
      this.wss.clients.forEach(client => {
        if (client.readyState === 1) { // WebSocket.OPEN
          client.send(message);
        }
      });

      logger.info(`[WebSocket] Approval notification sent: ${approvalId}`);
    } catch (error) {
      logger.error('[WebSocket] Send failed:', { error: error.message });
    }
  }
}

export default new WebSocketNotifier();
