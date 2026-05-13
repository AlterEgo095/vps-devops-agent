/**
 * ============================================================
 * AI Agent Service — V2 Tool-Based Agent
 * ============================================================
 *
 * Routes all AI interactions through the ReAct orchestrator
 * and tool system. No raw bash generation.
 *
 * Also provides direct AI functions for non-server tasks
 * (code analysis, chat, etc.) that don't need tool execution.
 *
 * @module AiAgentService
 * @version 2.0.0
 */

import { db } from './database-sqlite.js';
import * as openaiProvider from './openai-provider.js';
import reactOrchestrator from './react/orchestrator.js';
import logger from '../config/logger.js';

const AI_PROVIDER = process.env.AI_PROVIDER || 'openai';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;

// ============================================================
// CONVERSATION MANAGEMENT
// ============================================================

/**
 * Create a new conversation
 */
export function createConversation(userId, serverId = null, title = null) {
  try {
    const result = db.prepare(`
      INSERT INTO ai_conversations (user_id, server_id, title)
      VALUES (?, ?, ?)
    `).run(userId, serverId, title || `New conversation ${Date.now()}`);

    return {
      success: true,
      id: result.lastInsertRowid,
      userId,
      serverId,
      title: title || `New conversation ${Date.now()}`,
      createdAt: new Date().toISOString()
    };
  } catch (error) {
    logger.error('[AI Agent] Error creating conversation:', { error: error.message });
    throw error;
  }
}

// ============================================================
// MESSAGE PROCESSING — Routes through ReAct + Tools
// ============================================================

/**
 * Process a user message using the ReAct orchestrator.
 * This is the primary method for server management tasks.
 * The AI uses ONLY pre-built tools — no raw bash.
 *
 * @param {number} conversationId - Conversation ID
 * @param {string} userMessage - User's natural language message
 * @param {Object} serverConfig - SSH connection config
 * @param {Object} context - Additional context
 * @returns {Promise<Object>}
 */
export async function processMessage(conversationId, userMessage, serverConfig = null, context = {}) {
  try {
    // Save user message
    const userMessageId = db.prepare(`
      INSERT INTO ai_messages (conversation_id, role, content)
      VALUES (?, 'user', ?)
    `).run(conversationId, userMessage).lastInsertRowid;

    let responseContent;
    let executionMeta = {};

    if (serverConfig && serverConfig.host) {
      // Route through ReAct orchestrator for server operations
      logger.info('[AI Agent] Routing through ReAct orchestrator', {
        serverHost: serverConfig.host,
        conversationId
      });

      const reactResult = await reactOrchestrator.execute(userMessage, serverConfig, {
        userId: context.userId || 'unknown',
        serverId: context.serverId || null,
        conversationId,
        maxIterations: context.maxIterations || 10
      });

      responseContent = reactResult.finalAnswer || reactResult.message || 'Task completed';
      executionMeta = {
        executionId: reactResult.executionId,
        iterations: reactResult.iterations,
        status: reactResult.status || (reactResult.success ? 'completed' : 'failed'),
        approvalNeeded: reactResult.status === 'awaiting_approval',
        approvalId: reactResult.approvalId || null
      };
    } else {
      // No server context — use direct AI chat for general questions
      const history = getConversationMessages(conversationId, 20);
      const chatMessages = history.map(m => ({
        role: m.role,
        content: m.content
      }));
      chatMessages.push({ role: 'user', content: userMessage });

      const aiResponse = await openaiProvider.sendToOpenAI(chatMessages, 'devops_agent');
      responseContent = aiResponse.message;
    }

    // Save assistant response
    const assistantMessageId = db.prepare(`
      INSERT INTO ai_messages (conversation_id, role, content, tokens_used)
      VALUES (?, 'assistant', ?, ?)
    `).run(conversationId, responseContent, 0).lastInsertRowid;

    // Update conversation
    db.prepare(`
      UPDATE ai_conversations
      SET last_message_at = datetime('now'),
          message_count = message_count + 2
      WHERE id = ?
    `).run(conversationId);

    return {
      success: true,
      userMessage: {
        id: userMessageId,
        role: 'user',
        content: userMessage
      },
      assistantMessage: {
        id: assistantMessageId,
        role: 'assistant',
        content: responseContent
      },
      ...executionMeta
    };
  } catch (error) {
    logger.error('[AI Agent] Error processing message:', { error: error.message });
    throw error;
  }
}

/**
 * Get conversation messages from DB
 */
function getConversationMessages(conversationId, limit = 20) {
  try {
    const messagesRaw = db.prepare(`
      SELECT role, content FROM ai_messages
      WHERE conversation_id = ?
      ORDER BY created_at DESC
      LIMIT ?
    `).all(conversationId, limit);
    return messagesRaw.reverse();
  } catch {
    return [];
  }
}

// ============================================================
// DIRECT AI FUNCTIONS (no server/tool execution needed)
// ============================================================

/**
 * Generate an action plan with AI (no tool execution)
 * Used for planning/analysis only — not for direct execution
 */
export async function generateActionPlan(userRequest) {
  try {
    const messages = [
      {
        role: 'system',
        content: `Tu es un agent DevOps expert. Analyse la demande et propose un plan d'action structuré.
Retourne un JSON avec: { "analysis": "...", "plan": "...", "steps": [...], "warnings": [...] }`
      },
      {
        role: 'user',
        content: userRequest
      }
    ];

    const response = await openaiProvider.sendToOpenAI(messages, 'devops_agent');

    let plan;
    try {
      const jsonMatch = response.message.match(/\{[\s\S]*\}/);
      plan = jsonMatch ? JSON.parse(jsonMatch[0]) : { analysis: response.message, plan: response.message, steps: [], warnings: [] };
    } catch {
      plan = { analysis: response.message, plan: response.message, steps: [], warnings: [] };
    }

    return { success: true, plan };
  } catch (error) {
    logger.error('[AI Agent] Plan generation error:', { error: error.message });
    return { success: false, error: error.message };
  }
}

/**
 * Generate code with AI (no server/tool execution)
 */
export async function generateCode(description, language = 'javascript') {
  try {
    const messages = [{
      role: 'user',
      content: `Génère du code ${language} pour : ${description}\n\nRetourne UNIQUEMENT le code, sans explications ni markdown.`
    }];

    const response = await openaiProvider.sendToOpenAI(messages, 'code_analyzer');
    return { success: true, code: response.message };
  } catch (error) {
    logger.error('[AI Agent] Code generation error:', { error: error.message });
    return { success: false, error: error.message };
  }
}

/**
 * Analyze execution results and suggest corrections
 */
export async function analyzeExecutionResults(plan, results, errors) {
  try {
    const messages = [{
      role: 'user',
      content: `Plan d'action :\n${JSON.stringify(plan, null, 2)}\n\nRésultats d'exécution :\n${JSON.stringify(results, null, 2)}\n\nErreurs rencontrées :\n${JSON.stringify(errors, null, 2)}\n\nAnalyse les résultats et suggère des corrections.`
    }];

    const response = await openaiProvider.sendToOpenAI(messages, 'devops_agent');
    return { success: true, analysis: response.message };
  } catch (error) {
    logger.error('[AI Agent] Analysis error:', { error: error.message });
    return { success: false, error: error.message };
  }
}

/**
 * Execute an action (stub — routes through tool system now)
 * @deprecated Use processMessage() which routes through ReAct
 */
export async function executeAction(actionId, actionData, context) {
  try {
    db.prepare(`
      UPDATE ai_actions
      SET status = 'executing', executed_at = datetime('now')
      WHERE id = ?
    `).run(actionId);

    // Route through tool system
    const result = {
      success: true,
      message: 'Action should be executed via the ReAct orchestrator. Use processMessage() instead.',
      actionType: actionData.type
    };

    db.prepare(`
      UPDATE ai_actions
      SET status = 'completed', output = ?, completed_at = datetime('now')
      WHERE id = ?
    `).run(JSON.stringify(result), actionId);

    return result;
  } catch (error) {
    db.prepare(`
      UPDATE ai_actions
      SET status = 'failed', error = ?, completed_at = datetime('now')
      WHERE id = ?
    `).run(error.message, actionId);
    throw error;
  }
}
