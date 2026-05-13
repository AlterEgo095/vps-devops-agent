/**
 * ============================================================
 * ReAct Orchestrator — Iterative Reasoning + Acting Loop
 * ============================================================
 *
 * Replaces single-shot plan generation with an iterative cycle:
 *   Observation → Thought → Action → Verification
 *
 * Max 10 iterations. Self-corrects on failure.
 *
 * @module ReactOrchestrator
 * @version 2.0.0
 */

import logger from '../../config/logger.js';
import { db } from '../database-sqlite.js';
import { executor as toolExecutor } from '../tools/index.js';
import { default as checkpointManager } from '../checkpoints/manager.js';
import { default as approvalManager } from '../approvals/manager.js';
import * as openaiProvider from '../openai-provider.js';

const DEFAULT_MAX_ITERATIONS = 10;
const REACT_SYSTEM_PROMPT = `You are an AI DevOps agent using a ReAct (Reasoning + Acting) loop.

For each iteration, you must:
1. OBSERVE: Review the current state and any previous action results
2. THINK: Decide what to do next based on your observations
3. ACT: Call a tool to perform an action
4. VERIFY: Check if the action achieved the desired result

You have access to structured tools (function calling). Use them instead of generating raw commands.

IMPORTANT RULES:
- Always verify actions before moving on
- If an action fails, analyze the error and try a different approach
- If you determine the task is complete, respond with a final answer
- Maximum ${DEFAULT_MAX_ITERATIONS} iterations — be efficient
- For CRITICAL operations, approval will be needed from a human
- Git checkpoints are created automatically before file modifications

RESPONSE FORMAT:
You MUST respond with a JSON object containing:
{
  "thought": "Your reasoning about the current state and what to do next",
  "action": {
    "tool": "tool_name",
    "args": { ... }
  } | null,
  "final_answer": "Your final answer if task is complete" | null,
  "is_complete": true | false
}

If is_complete is true, action must be null and final_answer must be provided.
If is_complete is false, action must be provided and final_answer must be null.`;

class ReactOrchestrator {
  constructor() {
    this.activeExecutions = new Map();
  }

  /**
   * Execute a ReAct loop
   * @param {string} userRequest - Natural language user request
   * @param {Object} serverConfig - SSH connection config
   * @param {Object} context - Additional context
   * @returns {Promise<Object>} Execution result
   */
  async execute(userRequest, serverConfig, context = {}) {
    const {
      maxIterations = DEFAULT_MAX_ITERATIONS,
      userId = 'unknown',
      serverId = null,
      conversationId = null
    } = context;

    const startTime = Date.now();

    // Create execution record
    const executionId = await this._createExecution(userRequest, context);

    // Initialize scratchpad
    const scratchpad = [];

    // Initial observation
    scratchpad.push({
      phase: 'observation',
      content: `User request: ${userRequest}`,
      timestamp: new Date().toISOString()
    });

    logger.info(`[ReAct] Starting execution ${executionId} for: "${userRequest.substring(0, 100)}"`);

    try {
      for (let i = 0; i < maxIterations; i++) {
        // THOUGHT: Generate reasoning and next action
        const thoughtResult = await this._generateThought(scratchpad, serverConfig, context);

        if (!thoughtResult.success) {
          await this._failExecution(executionId, thoughtResult.error);
          return {
            success: false,
            error: thoughtResult.error,
            iterations: i + 1,
            executionId
          };
        }

        const thought = thoughtResult.data;
        scratchpad.push({
          phase: 'thought',
          content: thought.thought,
          iteration: i + 1,
          timestamp: new Date().toISOString()
        });

        await this._logIteration(executionId, i + 1, 'thought', thought.thought);

        // Check if task is complete
        if (thought.is_complete || !thought.action) {
          const durationMs = Date.now() - startTime;
          await this._completeExecution(executionId, thought.final_answer || thought.thought, i + 1, durationMs);

          return {
            success: true,
            finalAnswer: thought.final_answer || thought.thought,
            iterations: i + 1,
            executionId,
            scratchpad: scratchpad.slice(-5) // Last 5 entries
          };
        }

        // ACTION: Execute the tool
        const action = thought.action;
        const toolName = action.tool;
        const toolArgs = action.args || {};

        // Create checkpoint for non-SAFE tools
        let checkpointResult = null;
        const tool = toolExecutor.registry?.get?.(toolName);
        if (tool && tool.risk_level !== 'SAFE') {
          checkpointResult = await checkpointManager.create(serverConfig, {
            serverId,
            toolName,
            riskLevel: tool.risk_level,
            affectedPaths: toolArgs.path ? [toolArgs.path] : [],
            executionId,
            conversationId,
            userId
          });
        }

        // Check if approval is needed
        if (tool && tool.needs_approval) {
          const approvalCheck = approvalManager.checkApprovalNeeded(tool, context);

          if (approvalCheck.needsApproval && !context.approvedBy) {
            // Request approval
            const approvalResult = await approvalManager.requestApproval({
              toolName,
              toolArgs,
              riskLevel: tool.risk_level,
              reason: thought.thought,
              aiReasoning: thought.thought,
              userId,
              serverId,
              executionId,
              conversationId
            });

            scratchpad.push({
              phase: 'action',
              content: `Action ${toolName} requires approval. Approval ID: ${approvalResult.approvalId}`,
              iteration: i + 1
            });

            return {
              success: false,
              status: 'awaiting_approval',
              approvalId: approvalResult.approvalId,
              executionId,
              iterations: i + 1,
              message: `Action "${toolName}" requires human approval. Approval ID: ${approvalResult.approvalId}`
            };
          }
        }

        // Execute the tool
        let actionResult;
        try {
          actionResult = await toolExecutor.execute(toolName, toolArgs, serverConfig, {
            ...context,
            executionId,
            conversationId,
            serverId,
            userId
          });
        } catch (error) {
          actionResult = {
            success: false,
            error: error.message,
            tool: toolName
          };
        }

        // Log the action
        scratchpad.push({
          phase: 'action',
          content: `Called ${toolName}(${JSON.stringify(toolArgs).substring(0, 200)})`,
          result: actionResult.success ? 'success' : 'failed',
          iteration: i + 1,
          timestamp: new Date().toISOString()
        });

        await this._logIteration(executionId, i + 1, 'action',
          `Called ${toolName}`, toolName, toolArgs, actionResult
        );

        // Rollback on failure if checkpoint exists
        if (!actionResult.success && checkpointResult && checkpointResult.commitHash) {
          logger.warn(`[ReAct] Action failed, rolling back checkpoint ${checkpointResult.commitHash?.substring(0, 8)}`);
          await checkpointManager.rollback(checkpointResult.checkpointId, serverConfig, 'react-auto-rollback');

          scratchpad.push({
            phase: 'observation',
            content: `Action failed. Rolled back to checkpoint ${checkpointResult.commitHash?.substring(0, 8)}`,
            iteration: i + 1
          });
        }

        // OBSERVATION: Record the result
        const observationContent = this._formatObservation(actionResult);
        scratchpad.push({
          phase: 'observation',
          content: observationContent,
          iteration: i + 1,
          timestamp: new Date().toISOString()
        });

        await this._logIteration(executionId, i + 1, 'observation', observationContent);
      }

      // Max iterations reached
      const durationMs = Date.now() - startTime;
      await this._failExecution(executionId, 'Maximum iterations reached without completion');

      return {
        success: false,
        status: 'max_iterations',
        iterations: maxIterations,
        executionId,
        scratchpad: scratchpad.slice(-5),
        message: `Task not completed within ${maxIterations} iterations`
      };

    } catch (error) {
      logger.error('[ReAct] Execution error:', { error: error.message });
      await this._failExecution(executionId, error.message);

      return {
        success: false,
        error: error.message,
        executionId
      };
    }
  }

  /**
   * Generate a thought (reasoning + next action) using AI
   * @param {Array} scratchpad
   * @param {Object} serverConfig
   * @param {Object} context
   * @returns {Promise<Object>}
   */
  async _generateThought(scratchpad, serverConfig, context) {
    try {
      // Build the messages from scratchpad
      const scratchpadText = scratchpad.map(entry => {
        const prefix = {
          observation: '📊 OBSERVATION',
          thought: '🧠 THOUGHT',
          action: '🔧 ACTION'
        }[entry.phase] || '📝';

        return `${prefix} (Iteration ${entry.iteration || 0}):\n${entry.content}`;
      }).join('\n\n');

      const tools = (await import('../tools/index.js')).registry.getOpenAIToolsFormat();

      // Use OpenAI with function calling
      const messages = [
        { role: 'system', content: REACT_SYSTEM_PROMPT },
        { role: 'user', content: `Current scratchpad:\n\n${scratchpadText}\n\nWhat should I do next? Respond with a JSON object containing thought, action (or null if complete), and is_complete.` }
      ];

      // Try function calling approach
      const response = await openaiProvider.sendToOpenAI(messages, 'devops_agent');

      // Parse the response
      let thoughtData;
      try {
        const content = response.message;
        // Try to extract JSON from response
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          thoughtData = JSON.parse(jsonMatch[0]);
        } else {
          // Fallback: treat as plain thought with no action
          thoughtData = {
            thought: content,
            action: null,
            final_answer: content,
            is_complete: true
          };
        }
      } catch {
        thoughtData = {
          thought: response.message,
          action: null,
          final_answer: response.message,
          is_complete: true
        };
      }

      return { success: true, data: thoughtData };

    } catch (error) {
      logger.error('[ReAct] Thought generation failed:', { error: error.message });
      return { success: false, error: error.message };
    }
  }

  /**
   * Format an action result as an observation
   * @param {Object} result
   * @returns {string}
   */
  _formatObservation(result) {
    if (result.success) {
      let output = `Action succeeded.`;
      if (result.output) output += ` Output: ${result.output.substring(0, 500)}`;
      if (result.containers) output += ` Found ${result.containers.length} containers.`;
      if (result.processes) output += ` Found ${result.processes.length} processes.`;
      if (result.content) output += ` Content length: ${result.content.length} chars, ${result.lines_read || 0} lines.`;
      return output;
    } else {
      let output = `Action failed.`;
      if (result.error) output += ` Error: ${result.error.substring(0, 500)}`;
      if (result.blocked) output += ` Command was blocked by security policy.`;
      return output;
    }
  }

  /**
   * Create an execution record in DB
   */
  async _createExecution(userRequest, context) {
    try {
      const result = db.prepare(`
        INSERT INTO react_executions (
          conversation_id, user_id, server_id, user_request,
          status, max_iterations
        ) VALUES (?, ?, ?, ?, 'running', ?)
      `).run(
        context.conversationId || null,
        context.userId || 'unknown',
        context.serverId || null,
        userRequest,
        context.maxIterations || DEFAULT_MAX_ITERATIONS
      );
      return result.lastInsertRowid;
    } catch (error) {
      logger.error('[ReAct] Create execution failed:', { error: error.message });
      return Date.now(); // Fallback ID
    }
  }

  /**
   * Log an iteration
   */
  async _logIteration(executionId, iterationNumber, phase, content, toolName = null, toolArgs = null, toolResult = null) {
    try {
      db.prepare(`
        INSERT INTO react_iterations (
          execution_id, iteration_number, phase, content,
          tool_name, tool_args, tool_result, success, duration_ms
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        executionId,
        iterationNumber,
        phase,
        content,
        toolName,
        toolArgs ? JSON.stringify(toolArgs) : null,
        toolResult ? JSON.stringify(toolResult).substring(0, 5000) : null,
        toolResult ? (toolResult.success ? 1 : 0) : null,
        toolResult?.duration_ms || null
      );
    } catch (error) {
      // Don't fail execution on log errors
    }
  }

  /**
   * Complete an execution
   */
  async _completeExecution(executionId, finalAnswer, iterations, durationMs) {
    try {
      db.prepare(`
        UPDATE react_executions
        SET status = 'completed', final_answer = ?,
            total_iterations = ?, total_duration_ms = ?,
            completed_at = datetime('now')
        WHERE id = ?
      `).run(finalAnswer?.substring(0, 5000), iterations, durationMs, executionId);
    } catch (error) {
      logger.error('[ReAct] Complete execution failed:', { error: error.message });
    }
  }

  /**
   * Fail an execution
   */
  async _failExecution(executionId, reason) {
    try {
      db.prepare(`
        UPDATE react_executions
        SET status = 'failed', final_answer = ?,
            completed_at = datetime('now')
        WHERE id = ?
      `).run(reason, executionId);
    } catch (error) {
      logger.error('[ReAct] Fail execution failed:', { error: error.message });
    }
  }

  /**
   * Get execution status
   */
  getExecutionStatus(executionId) {
    try {
      return db.prepare('SELECT * FROM react_executions WHERE id = ?').get(executionId);
    } catch {
      return null;
    }
  }

  /**
   * Get execution iterations
   */
  getExecutionIterations(executionId) {
    try {
      return db.prepare('SELECT * FROM react_iterations WHERE execution_id = ? ORDER BY iteration_number, created_at').all(executionId);
    } catch {
      return [];
    }
  }
}

// Singleton
const reactOrchestrator = new ReactOrchestrator();
export default reactOrchestrator;
