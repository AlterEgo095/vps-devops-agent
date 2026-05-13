/**
 * ============================================================
 * Tool Executor — Executes registered tools with validation,
 * risk checks, and audit logging
 * ============================================================
 *
 * @module ToolExecutor
 * @version 2.0.0
 */

import registry from './registry.js';
import { validateCommand } from '../command-guard.js';
import logger from '../../config/logger.js';
import { db } from '../database-sqlite.js';

class ToolExecutor {
  constructor() {
    this.executionHooks = {
      before: [],
      after: [],
      onError: []
    };
  }

  /**
   * Register a hook
   * @param {'before'|'after'|'onError'} type
   * @param {Function} hook - Async function(tool, args, serverConfig) => modified args or void
   */
  addHook(type, hook) {
    if (this.executionHooks[type]) {
      this.executionHooks[type].push(hook);
    }
  }

  /**
   * Execute a tool by name
   * @param {string} toolName - Name of the tool to execute
   * @param {Object} args - Tool arguments
   * @param {Object} serverConfig - SSH connection config
   * @param {Object} context - Additional context (userId, conversationId, etc.)
   * @returns {Promise<Object>} Execution result
   */
  async execute(toolName, args = {}, serverConfig = null, context = {}) {
    const startTime = Date.now();

    // 1. Resolve tool
    const tool = registry.get(toolName);
    if (!tool) {
      throw new Error(`Tool "${toolName}" not found in registry`);
    }
    if (!tool.is_enabled) {
      throw new Error(`Tool "${toolName}" is disabled`);
    }

    // 2. Validate parameters
    const validatedArgs = this._validateParams(tool, args);

    // 3. Run before hooks
    let finalArgs = validatedArgs;
    for (const hook of this.executionHooks.before) {
      const result = await hook(tool, finalArgs, serverConfig, context);
      if (result && result.args) {
        finalArgs = result.args;
      }
    }

    // 4. Security check for shell_exec
    if (toolName === 'shell_exec' && finalArgs.command) {
      const guardResult = validateCommand(finalArgs.command, {
        allowGraylist: context.allowGraylist || false,
        userId: context.userId || 'unknown'
      });

      if (!guardResult.allowed) {
        logger.warn(`[ToolExecutor] Command blocked by CommandGuard: ${finalArgs.command}`);
        return {
          success: false,
          error: guardResult.reason,
          level: guardResult.level,
          blocked: true
        };
      }
    }

    // 5. Execute tool
    let result;
    try {
      logger.info(`[ToolExecutor] Executing: ${toolName}`, {
        tool: toolName,
        riskLevel: tool.risk_level,
        category: tool.category,
        userId: context.userId || 'unknown',
        serverId: context.serverId || 'local'
      });

      result = await tool.implementation(serverConfig, finalArgs, context);

      // Ensure result has success field
      if (result === undefined || result === null) {
        result = { success: true, message: 'Tool executed successfully' };
      } else if (typeof result === 'string') {
        result = { success: true, output: result };
      } else if (!result.hasOwnProperty('success')) {
        result = { success: true, ...result };
      }

    } catch (error) {
      logger.error(`[ToolExecutor] Error executing ${toolName}:`, {
        error: error.message,
        tool: toolName,
        args: JSON.stringify(finalArgs).substring(0, 200)
      });

      result = {
        success: false,
        error: error.message,
        tool: toolName
      };

      // Run error hooks
      for (const hook of this.executionHooks.onError) {
        await hook(tool, finalArgs, serverConfig, error, context);
      }
    }

    // 6. Calculate duration
    const durationMs = Date.now() - startTime;
    result.duration_ms = durationMs;
    result.tool = toolName;
    result.risk_level = tool.risk_level;

    // 7. Audit log
    this._auditLog(tool, finalArgs, result, context, durationMs);

    // 8. Run after hooks
    for (const hook of this.executionHooks.after) {
      await hook(tool, finalArgs, result, serverConfig, context);
    }

    return result;
  }

  /**
   * Validate tool parameters against schema
   * @param {Object} tool
   * @param {Object} args
   * @returns {Object} Validated args
   */
  _validateParams(tool, args) {
    if (!tool.parameters || !tool.parameters.properties) {
      return args;
    }

    const validated = {};
    const { properties, required = [] } = tool.parameters;

    // Check required params
    for (const req of required) {
      if (args[req] === undefined || args[req] === null) {
        throw new Error(`Tool "${tool.name}": Missing required parameter "${req}"`);
      }
    }

    // Copy and type-check provided params
    for (const [key, value] of Object.entries(args)) {
      if (properties[key]) {
        const expectedType = properties[key].type;
        if (expectedType && !this._checkType(value, expectedType)) {
          throw new Error(`Tool "${tool.name}": Parameter "${key}" must be of type ${expectedType}`);
        }
        validated[key] = value;
      }
    }

    // Apply defaults
    for (const [key, schema] of Object.entries(properties)) {
      if (validated[key] === undefined && schema.default !== undefined) {
        validated[key] = schema.default;
      }
    }

    return validated;
  }

  /**
   * Check value type
   * @param {*} value
   * @param {string} expectedType
   * @returns {boolean}
   */
  _checkType(value, expectedType) {
    switch (expectedType) {
      case 'string': return typeof value === 'string';
      case 'number': return typeof value === 'number';
      case 'boolean': return typeof value === 'boolean';
      case 'array': return Array.isArray(value);
      case 'object': return typeof value === 'object' && !Array.isArray(value);
      default: return true;
    }
  }

  /**
   * Write audit log to database
   */
  _auditLog(tool, args, result, context, durationMs) {
    try {
      if (!db) return;

      db.prepare(`
        INSERT INTO tool_invocations (
          execution_id, conversation_id, user_id, server_id,
          tool_name, tool_args, risk_level, approved_by,
          result_summary, success, duration_ms
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        context.executionId || null,
        context.conversationId || null,
        context.userId || 'unknown',
        context.serverId || null,
        tool.name,
        JSON.stringify(args).substring(0, 5000),
        tool.risk_level,
        context.approvedBy || null,
        result.error || JSON.stringify(result).substring(0, 2000),
        result.success ? 1 : 0,
        durationMs
      );
    } catch (error) {
      // Don't fail execution on audit log errors
      logger.error('[ToolExecutor] Audit log error:', { error: error.message });
    }
  }
}

// Singleton
const executor = new ToolExecutor();
export default executor;
