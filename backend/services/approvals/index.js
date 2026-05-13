/**
 * Approvals Module Entry Point
 * @module Approvals
 */

export { default as approvalManager } from './manager.js';
export { getNotifier, notifyAll, telegramNotifier, webhookNotifier, websocketNotifier } from './notifiers/index.js';
