/**
 * ============================================================
 * ReAct Orchestrator — Iterative Reasoning + Acting Loop
 * ============================================================
 *
 * Replaces single-shot plan generation with an iterative cycle:
 *   Observation → Thought → Action → Verification
 *
 * Uses OpenAI native function calling (tools) instead of
 * manual JSON parsing for reliable tool selection.
 *
 * Max 10 iterations. Self-corrects on failure.
 *
 * @module ReactOrchestrator
 * @version 2.1.0
 */

import logger from '../../config/logger.js';
import { db } from '../database-sqlite.js';
import { executor as toolExecutor } from '../tools/index.js';
import { default as checkpointManager } from '../checkpoints/manager.js';
import { default as approvalManager } from '../approvals/manager.js';

const DEFAULT_MAX_ITERATIONS = 10;

const REACT_SYSTEM_PROMPT = `You are an AI DevOps agent using a ReAct (Reasoning + Acting) loop.

For each iteration:
1. OBSERVE: Review the current state and any previous action results
2. THINK: Decide what to do next based on your observations
3. ACT: Call a tool to perform an action
4. VERIFY: Check if the action achieved the desired result

IMPORTANT RULES:
- Always use the provided tools (function calling) to perform actions — never output raw shell commands as text
- Always verify actions before moving on
- If an action fails, analyze the error and try a different approach
- If you determine the task is complete, respond with your final answer directly (do not call any tool)
- Maximum ${DEFAULT_MAX_ITERATIONS} iterations — be efficient
- For CRITICAL operations, approval will be needed from a human
- Git checkpoints are created automatically before file modifications
- Use rag_query tool first to understand the current infrastructure state before making changes`;

class ReactOrchestrator {
  constructor() {
    this.activeExecutions = new Map();
    this._openaiClient = null;
  }

  /**
   * Get or create an OpenAI SDK client for native function calling
   * @returns {Promise<Object>} OpenAI client instance
   */
  async _getAIClient() {
    if (!this._openaiClient) {
      // Dynamic import since openai is an ESM module
      const { default: OpenAI } = await import('openai');
      const baseURL = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
      // Normalize base URL: strip trailing paths like /api/chat and ensure /v1
      let normalizedURL = baseURL;
      if (normalizedURL.includes('/api/chat')) {
        normalizedURL = normalizedURL.replace('/api/chat', '/v1');
      } else if (!normalizedURL.endsWith('/v1')) {
        normalizedURL = normalizedURL.replace(/\/$/, '') + '/v1';
      }

      this._openaiClient = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY,
        baseURL: normalizedURL
      });

      logger.info(`[ReAct] OpenAI client initialized — baseURL: ${normalizedURL}`);
    }
    return this._openaiClient;
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
   * Resume a ReAct execution after a human approval
   * @param {string} approvalId - The approval that was granted
   * @param {Object} serverConfig - SSH connection config
   * @param {Object} context - Additional context
   * @returns {Promise<Object>} Execution result
   */
  async resumeAfterApproval(approvalId, serverConfig, context = {}) {
    try {
      // Get the approval
      const approval = approvalManager.getById(approvalId);
      if (!approval || approval.status !== 'approved') {
        return { success: false, error: 'Approval not found or not approved' };
      }

      // Get the execution
      const execution = this.getExecutionStatus(approval.execution_id);
      if (!execution) {
        return { success: false, error: 'Execution not found' };
      }

      // Get iterations to rebuild scratchpad
      const iterations = this.getExecutionIterations(approval.execution_id);
      const scratchpad = iterations.map(iter => ({
        phase: iter.phase,
        content: iter.content,
        iteration: iter.iteration_number
      }));

      // Add approval observation
      scratchpad.push({
        phase: 'observation',
        content: `Human approved action "${approval.tool_name}". You may now proceed with this action or continue the task.`,
        iteration: iterations.length
      });

      // Execute the approved tool
      const toolArgs = JSON.parse(approval.tool_args);
      const actionResult = await toolExecutor.execute(approval.tool_name, toolArgs, serverConfig, {
        ...context,
        executionId: approval.execution_id,
        approvedBy: approval.decision_by
      });

      scratchpad.push({
        phase: 'action',
        content: `Executed approved tool ${approval.tool_name}`,
        result: actionResult.success ? 'success' : 'failed',
        iteration: iterations.length + 1
      });

      // Log the approved execution
      await this._logIteration(
        approval.execution_id,
        iterations.length + 1,
        'action',
        `Executed approved tool ${approval.tool_name}`,
        approval.tool_name,
        toolArgs,
        actionResult
      );

      // Add observation from the approved action result
      const observationContent = this._formatObservation(actionResult);
      scratchpad.push({
        phase: 'observation',
        content: observationContent,
        iteration: iterations.length + 1
      });

      await this._logIteration(approval.execution_id, iterations.length + 1, 'observation', observationContent);

      // Continue the ReAct loop from here
      const maxRemaining = (execution.max_iterations || DEFAULT_MAX_ITERATIONS) - (iterations.length + 1);
      return this._continueLoop(approval.execution_id, scratchpad, serverConfig, context, maxRemaining);
    } catch (error) {
      logger.error('[ReAct] Resume after approval failed:', { error: error.message });
      return { success: false, error: error.message };
    }
  }

  /**
   * Continue the ReAct loop from an existing scratchpad state
   * @param {number} executionId
   * @param {Array} scratchpad
   * @param {Object} serverConfig
   * @param {Object} context
   * @param {number} maxRemaining
   * @returns {Promise<Object>}
   */
  async _continueLoop(executionId, scratchpad, serverConfig, context, maxRemaining) {
    const startTime = Date.now();

    if (maxRemaining <= 0) {
      await this._failExecution(executionId, 'Maximum iterations reached during resume');
      return {
        success: false,
        status: 'max_iterations',
        executionId,
        message: 'Task not completed — maximum iterations reached during resume'
      };
    }

    try {
      for (let i = 0; i < maxRemaining; i++) {
        const globalIteration = scratchpad.length + i + 1;

        // THOUGHT
        const thoughtResult = await this._generateThought(scratchpad, serverConfig, context);

        if (!thoughtResult.success) {
          await this._failExecution(executionId, thoughtResult.error);
          return { success: false, error: thoughtResult.error, iterations: globalIteration, executionId };
        }

        const thought = thoughtResult.data;
        scratchpad.push({
          phase: 'thought',
          content: thought.thought,
          iteration: globalIteration,
          timestamp: new Date().toISOString()
        });

        await this._logIteration(executionId, globalIteration, 'thought', thought.thought);

        // Check if task is complete
        if (thought.is_complete || !thought.action) {
          const durationMs = Date.now() - startTime;
          await this._completeExecution(executionId, thought.final_answer || thought.thought, globalIteration, durationMs);

          return {
            success: true,
            finalAnswer: thought.final_answer || thought.thought,
            iterations: globalIteration,
            executionId,
            scratchpad: scratchpad.slice(-5)
          };
        }

        // ACTION
        const action = thought.action;
        const toolName = action.tool;
        const toolArgs = action.args || {};

        // Create checkpoint for non-SAFE tools
        let checkpointResult = null;
        const tool = toolExecutor.registry?.get?.(toolName);
        if (tool && tool.risk_level !== 'SAFE') {
          checkpointResult = await checkpointManager.create(serverConfig, {
            serverId: context.serverId,
            toolName,
            riskLevel: tool.risk_level,
            affectedPaths: toolArgs.path ? [toolArgs.path] : [],
            executionId,
            conversationId: context.conversationId,
            userId: context.userId
          });
        }

        // Check if approval is needed
        if (tool && tool.needs_approval) {
          const approvalCheck = approvalManager.checkApprovalNeeded(tool, context);

          if (approvalCheck.needsApproval && !context.approvedBy) {
            const approvalResult = await approvalManager.requestApproval({
              toolName,
              toolArgs,
              riskLevel: tool.risk_level,
              reason: thought.thought,
              aiReasoning: thought.thought,
              userId: context.userId || 'unknown',
              serverId: context.serverId,
              executionId,
              conversationId: context.conversationId
            });

            scratchpad.push({
              phase: 'action',
              content: `Action ${toolName} requires approval. Approval ID: ${approvalResult.approvalId}`,
              iteration: globalIteration
            });

            return {
              success: false,
              status: 'awaiting_approval',
              approvalId: approvalResult.approvalId,
              executionId,
              iterations: globalIteration,
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
            serverId: context.serverId,
            userId: context.userId
          });
        } catch (error) {
          actionResult = { success: false, error: error.message, tool: toolName };
        }

        scratchpad.push({
          phase: 'action',
          content: `Called ${toolName}(${JSON.stringify(toolArgs).substring(0, 200)})`,
          result: actionResult.success ? 'success' : 'failed',
          iteration: globalIteration,
          timestamp: new Date().toISOString()
        });

        await this._logIteration(executionId, globalIteration, 'action',
          `Called ${toolName}`, toolName, toolArgs, actionResult
        );

        // Rollback on failure
        if (!actionResult.success && checkpointResult && checkpointResult.commitHash) {
          logger.warn(`[ReAct] Action failed, rolling back checkpoint ${checkpointResult.commitHash?.substring(0, 8)}`);
          await checkpointManager.rollback(checkpointResult.checkpointId, serverConfig, 'react-auto-rollback');

          scratchpad.push({
            phase: 'observation',
            content: `Action failed. Rolled back to checkpoint ${checkpointResult.commitHash?.substring(0, 8)}`,
            iteration: globalIteration
          });
        }

        // OBSERVATION
        const observationContent = this._formatObservation(actionResult);
        scratchpad.push({
          phase: 'observation',
          content: observationContent,
          iteration: globalIteration,
          timestamp: new Date().toISOString()
        });

        await this._logIteration(executionId, globalIteration, 'observation', observationContent);
      }

      // Max remaining iterations reached
      await this._failExecution(executionId, 'Maximum iterations reached during resume');
      return {
        success: false,
        status: 'max_iterations',
        executionId,
        message: 'Task not completed within remaining iterations'
      };

    } catch (error) {
      logger.error('[ReAct] Continue loop error:', { error: error.message });
      await this._failExecution(executionId, error.message);
      return { success: false, error: error.message, executionId };
    }
  }

  /**
   * Generate a thought (reasoning + next action) using AI with native function calling
   * @param {Array} scratchpad
   * @param {Object} serverConfig
   * @param {Object} context
   * @returns {Promise<Object>}
   */
  async _generateThought(scratchpad, serverConfig, context) {
    try {
      // Build scratchpad text
      const scratchpadText = scratchpad.map(entry => {
        const prefix = {
          observation: 'OBSERVATION',
          thought: 'THOUGHT',
          action: 'ACTION'
        }[entry.phase] || 'NOTE';
        return `${prefix} (Iteration ${entry.iteration || 0}):\n${entry.content}`;
      }).join('\n\n');

      // Get tools in OpenAI function calling format
      const { registry } = await import('../tools/index.js');
      const tools = registry.getOpenAIToolsFormat();

      const messages = [
        { role: 'system', content: REACT_SYSTEM_PROMPT },
        { role: 'user', content: `Current scratchpad:\n\n${scratchpadText}\n\nWhat should I do next? Use a tool if needed, or provide your final answer if the task is complete.` }
      ];

      // Use OpenAI SDK with native function calling
      const client = await this._getAIClient();
      const response = await client.chat.completions.create({
        model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
        messages,
        tools,  // Native function calling
        tool_choice: 'auto',
        temperature: 0.3
      });

      const choice = response.choices[0];

      // If the model wants to call a tool
      if (choice.message.tool_calls && choice.message.tool_calls.length > 0) {
        const toolCall = choice.message.tool_calls[0];
        const toolName = toolCall.function.name;
        const toolArgs = JSON.parse(toolCall.function.arguments);

        logger.info(`[ReAct] Function calling selected tool: ${toolName}`, { toolArgs: JSON.stringify(toolArgs).substring(0, 200) });

        return {
          success: true,
          data: {
            thought: choice.message.content || `Calling tool: ${toolName}`,
            action: { tool: toolName, args: toolArgs },
            final_answer: null,
            is_complete: false,
            _tool_call_id: toolCall.id  // Keep for multi-turn
          }
        };
      }

      // If the model provides a final answer (no tool call)
      logger.info('[ReAct] Model provided final answer (no tool call)');
      return {
        success: true,
        data: {
          thought: choice.message.content,
          action: null,
          final_answer: choice.message.content,
          is_complete: true
        }
      };

    } catch (error) {
      logger.error('[ReAct] Thought generation failed:', { error: error.message });

      // Fallback: try the legacy openai-provider as a backup
      try {
        logger.info('[ReAct] Attempting fallback with legacy openai-provider...');
        const openaiProvider = await import('../openai-provider.js');
        const scratchpadText = scratchpad.map(entry => {
          const prefix = {
            observation: 'OBSERVATION',
            thought: 'THOUGHT',
            action: 'ACTION'
          }[entry.phase] || 'NOTE';
          return `${prefix} (Iteration ${entry.iteration || 0}):\n${entry.content}`;
        }).join('\n\n');

        const messages = [
          { role: 'system', content: REACT_SYSTEM_PROMPT + '\n\nWhen you need to call a tool, respond with JSON: { "thought": "...", "action": { "tool": "tool_name", "args": { ... } }, "is_complete": false }. When done, respond with: { "thought": "...", "action": null, "final_answer": "...", "is_complete": true }' },
          { role: 'user', content: `Current scratchpad:\n\n${scratchpadText}\n\nWhat should I do next? Use a tool if needed, or provide your final answer if the task is complete.` }
        ];

        const response = await openaiProvider.sendToOpenAI(messages, 'devops_agent');
        const content = response.message;

        let thoughtData;
        try {
          const jsonMatch = content.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            thoughtData = JSON.parse(jsonMatch[0]);
          } else {
            thoughtData = {
              thought: content,
              action: null,
              final_answer: content,
              is_complete: true
            };
          }
        } catch {
          thoughtData = {
            thought: content,
            action: null,
            final_answer: content,
            is_complete: true
          };
        }

        return { success: true, data: thoughtData };
      } catch (fallbackError) {
        logger.error('[ReAct] Fallback thought generation also failed:', { error: fallbackError.message });
        return { success: false, error: error.message };
      }
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
