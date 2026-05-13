/**
 * ============================================================
 * Tool Registry — Central registry for all AI agent tools
 * ============================================================
 *
 * Each tool follows the OpenAI function calling format with
 * additional metadata (risk_level, needs_approval, category).
 *
 * @module ToolRegistry
 * @version 2.0.0
 */

import logger from '../../config/logger.js';

class ToolRegistry {
  constructor() {
    this.tools = new Map();
    this.categories = new Set();
  }

  /**
   * Register a tool
   * @param {Object} tool - Tool definition
   * @param {string} tool.name - Unique tool name (snake_case)
   * @param {string} tool.description - Description for the AI model
   * @param {Object} tool.parameters - JSON Schema for parameters
   * @param {string} tool.risk_level - 'SAFE' | 'MODERATE' | 'CRITICAL'
   * @param {boolean} tool.needs_approval - Whether human approval is required
   * @param {string} tool.category - Tool category (docker, file, system, etc.)
   * @param {Function} tool.implementation - Async function(serverConfig, args) => result
   */
  register(tool) {
    // Validation
    if (!tool.name || typeof tool.name !== 'string') {
      throw new Error('Tool must have a valid name');
    }
    if (!tool.description || typeof tool.description !== 'string') {
      throw new Error(`Tool "${tool.name}" must have a description`);
    }
    if (!tool.implementation || typeof tool.implementation !== 'function') {
      throw new Error(`Tool "${tool.name}" must have an implementation function`);
    }
    if (!['SAFE', 'MODERATE', 'CRITICAL'].includes(tool.risk_level)) {
      throw new Error(`Tool "${tool.name}" must have a valid risk_level (SAFE/MODERATE/CRITICAL)`);
    }

    // Normalize
    const normalizedTool = {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters || { type: 'object', properties: {}, required: [] },
      risk_level: tool.risk_level || 'MODERATE',
      needs_approval: tool.needs_approval || tool.risk_level === 'CRITICAL',
      category: tool.category || 'general',
      implementation: tool.implementation,
      is_enabled: true
    };

    this.tools.set(tool.name, normalizedTool);
    this.categories.add(normalizedTool.category);

    logger.info(`[ToolRegistry] Registered tool: ${tool.name} (${tool.risk_level}, ${tool.category})`);
  }

  /**
   * Get a tool by name
   * @param {string} name
   * @returns {Object|undefined}
   */
  get(name) {
    return this.tools.get(name);
  }

  /**
   * Check if a tool exists and is enabled
   * @param {string} name
   * @returns {boolean}
   */
  isAvailable(name) {
    const tool = this.tools.get(name);
    return tool && tool.is_enabled;
  }

  /**
   * Get all registered tools
   * @returns {Array}
   */
  getAll() {
    return Array.from(this.tools.values());
  }

  /**
   * Get tools by category
   * @param {string} category
   * @returns {Array}
   */
  getByCategory(category) {
    return this.getAll().filter(t => t.category === category);
  }

  /**
   * Get tools by risk level
   * @param {string} riskLevel
   * @returns {Array}
   */
  getByRiskLevel(riskLevel) {
    return this.getAll().filter(t => t.risk_level === riskLevel);
  }

  /**
   * Get tools that need approval
   * @returns {Array}
   */
  getToolsNeedingApproval() {
    return this.getAll().filter(t => t.needs_approval);
  }

  /**
   * Enable or disable a tool
   * @param {string} name
   * @param {boolean} enabled
   */
  toggle(name, enabled) {
    const tool = this.tools.get(name);
    if (!tool) {
      throw new Error(`Tool "${name}" not found`);
    }
    tool.is_enabled = enabled;
    logger.info(`[ToolRegistry] Tool "${name}" ${enabled ? 'enabled' : 'disabled'}`);
  }

  /**
   * Get the OpenAI tools format array (for API calls)
   * Only includes enabled tools and strips internal metadata
   * @returns {Array}
   */
  getOpenAIToolsFormat() {
    return this.getAll()
      .filter(t => t.is_enabled)
      .map(t => ({
        type: 'function',
        function: {
          name: t.name,
          description: t.description,
          parameters: t.parameters
        }
      }));
  }

  /**
   * Get all categories
   * @returns {Array}
   */
  getCategories() {
    return Array.from(this.categories);
  }

  /**
   * Get registry stats
   * @returns {Object}
   */
  getStats() {
    const tools = this.getAll();
    return {
      total: tools.length,
      enabled: tools.filter(t => t.is_enabled).length,
      disabled: tools.filter(t => !t.is_enabled).length,
      byRiskLevel: {
        SAFE: tools.filter(t => t.risk_level === 'SAFE').length,
        MODERATE: tools.filter(t => t.risk_level === 'MODERATE').length,
        CRITICAL: tools.filter(t => t.risk_level === 'CRITICAL').length
      },
      byCategory: Object.fromEntries(
        this.categories.map(cat => [cat, this.getByCategory(cat).length])
      ),
      needingApproval: this.getToolsNeedingApproval().length
    };
  }
}

// Singleton
const registry = new ToolRegistry();
export default registry;
