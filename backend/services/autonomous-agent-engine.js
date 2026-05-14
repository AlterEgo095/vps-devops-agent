/**
 * ============================================================
 * Autonomous Agent Engine — V2 Tool-Based Execution
 * ============================================================
 *
 * Routes ALL requests through the ReAct orchestrator + tool system.
 * No raw bash generation — AI uses only predefined secure tools.
 *
 * @module AutonomousAgentEngine
 * @version 2.0.0
 */

import logger from '../config/logger.js';
import reactOrchestrator from './react/orchestrator.js';

class AutonomousAgentEngine {
  constructor() {
    this.conversationHistory = [];
    this.context = {};
  }

  /**
   * Execute a natural language command using the ReAct orchestrator
   * @param {string} command - Natural language command
   * @param {Object} serverConfig - SSH connection config
   * @param {Object} context - Additional context (userId, serverId, etc.)
   * @returns {Promise<Object>} Execution result
   */
  async executeNaturalLanguageCommand(command, serverConfig, context = {}) {
    try {
      logger.info('[AutonomousEngine] Executing via ReAct:', {
        command: command.substring(0, 200),
        serverHost: serverConfig?.host
      });

      const result = await reactOrchestrator.execute(command, serverConfig, {
        userId: context.userId || 'autonomous',
        serverId: context.serverId || null,
        conversationId: context.conversationId || null,
        maxIterations: context.maxIterations || 10
      });

      // Store in conversation history
      this.conversationHistory.push({
        role: 'user',
        content: command,
        timestamp: new Date().toISOString()
      });

      this.conversationHistory.push({
        role: 'assistant',
        content: result.finalAnswer || result.message || 'Task completed',
        timestamp: new Date().toISOString(),
        executionId: result.executionId,
        iterations: result.iterations
      });

      return {
        success: result.success,
        aiResponse: result.finalAnswer || result.message || 'Task completed',
        executionId: result.executionId,
        iterations: result.iterations,
        status: result.status || (result.success ? 'completed' : 'failed'),
        approvalNeeded: result.status === 'awaiting_approval',
        approvalId: result.approvalId || null
      };
    } catch (error) {
      logger.error('[AutonomousEngine] Execution error:', { error: error.message });
      throw error;
    }
  }

  /**
   * Resume execution after human approval
   * @param {string} approvalId - The approval ID
   * @param {Object} serverConfig - SSH connection config
   * @param {Object} context - Additional context
   * @returns {Promise<Object>} Resumed execution result
   */
  async resumeAfterApproval(approvalId, serverConfig, context = {}) {
    try {
      logger.info('[AutonomousEngine] Resuming after approval:', { approvalId });

      const result = await reactOrchestrator.resumeAfterApproval(
        approvalId,
        serverConfig,
        {
          userId: context.userId || 'autonomous',
          serverId: context.serverId || null
        }
      );

      return {
        success: result.success,
        aiResponse: result.finalAnswer || result.message || 'Task resumed and completed',
        executionId: result.executionId,
        iterations: result.iterations,
        status: result.status || (result.success ? 'completed' : 'failed')
      };
    } catch (error) {
      logger.error('[AutonomousEngine] Resume error:', { error: error.message });
      throw error;
    }
  }


  /**
   * Update server context for the agent
   * @param {Object} context - Server context object
   */
  updateServerContext(context) {
    this.context = { ...this.context, ...context };
    logger.info('[AutonomousEngine] Server context updated:', {
      host: context.host || context.name || 'unknown'
    });
    return {
      success: true,
      message: 'Server context updated'
    };
  }

  /**
   * Start the agent (initialize connection/session)
   * @param {Object} options - Start options
   * @returns {Object} Start result
   */
  startAgent(options = {}) {
    logger.info('[AutonomousEngine] Agent started:', {
      hasContext: !!Object.keys(this.context).length
    });
    return {
      success: true,
      message: 'Agent started and ready',
      status: 'running'
    };
  }

  /**
   * Stop the agent
   * @returns {Object} Stop result
   */
  stopAgent() {
    logger.info('[AutonomousEngine] Agent stopped');
    return {
      success: true,
      message: 'Agent stopped'
    };
  }


  /**
   * Get agent status
   * @returns {Object} Status object
   */
  getStatus() {
    return {
      isRunning: true,
      hasServer: !!Object.keys(this.context).length,
      serverHost: this.context.host || null,
      conversationLength: this.conversationHistory.length
    };
  }

  /**
   * Start the agent with optional server context
   * @param {Object} serverConfig - Server configuration
   * @returns {Object} Start result
   */
  async start(serverConfig = null) {
    if (serverConfig) {
      this.updateServerContext(serverConfig);
    }
    logger.info('[AutonomousEngine] Agent started');
    return {
      success: true,
      message: 'Agent started',
      status: 'running'
    };
  }

  /**
   * Get server context (accessed as property)
   */
  get serverContext() {
    return this.context;
  }

  /**
   * Reset conversation history
   */
  resetConversation() {
    this.conversationHistory = [];
    this.context = {};
    logger.info('[AutonomousEngine] Conversation reset');
    return {
      success: true,
      message: 'Conversation reset'
    };
  }

  /**
   * Get conversation history
   * @param {number} limit - Maximum number of entries
   * @returns {Array}
   */
  getConversationHistory(limit = 50) {
    return this.conversationHistory.slice(-limit);
  }
}

const agentEngine = new AutonomousAgentEngine();
export default agentEngine;
export { AutonomousAgentEngine };
