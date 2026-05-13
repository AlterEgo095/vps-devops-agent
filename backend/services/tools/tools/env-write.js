/**
 * Tool: env_write — Write/update .env variables with backup
 * Risk: CRITICAL (modifies environment configuration)
 */

import { executeCommand } from '../../agent-executor.js';

export default {
  name: 'env_write',
  description: 'Write or update variables in a .env file on the remote server. Creates an automatic backup before modification. Supports setting multiple variables at once. Requires approval.',
  parameters: {
    type: 'object',
    properties: {
      project_path: {
        type: 'string',
        description: 'Absolute path to the project directory containing the .env file'
      },
      variables: {
        type: 'object',
        description: 'Key-value pairs to set in the .env file (e.g., {"NODE_ENV": "production", "PORT": "3000"})',
        properties: {},
        additionalProperties: { type: 'string' }
      },
      backup: {
        type: 'boolean',
        description: 'Create a backup of the existing .env file before modification',
        default: true
      }
    },
    required: ['project_path', 'variables']
  },
  risk_level: 'CRITICAL',
  needs_approval: true,
  category: 'config',

  async implementation(serverConfig, args) {
    const { project_path, variables, backup = true } = args;

    if (!project_path || !project_path.startsWith('/')) {
      return {
        success: false,
        error: 'project_path must be an absolute path starting with /'
      };
    }

    if (!variables || typeof variables !== 'object' || Object.keys(variables).length === 0) {
      return {
        success: false,
        error: 'variables must be a non-empty key-value object'
      };
    }

    // Validate variable keys (only alphanumeric + underscore)
    for (const key of Object.keys(variables)) {
      if (!/^[A-Z_][A-Z0-9_]*$/i.test(key)) {
        return {
          success: false,
          error: `Invalid variable name: "${key}". Use uppercase letters, numbers, and underscores only.`
        };
      }
    }

    const envPath = `${project_path}/.env`;
    let backupPath = null;

    // Create backup if requested
    if (backup) {
      const timestamp = Date.now();
      backupPath = `${envPath}.bak.${timestamp}`;
      await executeCommand(
        serverConfig,
        `cp "${envPath}" "${backupPath}" 2>/dev/null || true`
      );
    }

    // Build sed commands to update/add each variable
    // For each variable: if the key exists, replace it; if not, append it
    const entries = Object.entries(variables);
    const updateCommands = [];

    for (const [key, value] of entries) {
      // Escape special characters in value for sed
      const escapedValue = String(value).replace(/[&/\\]/g, '\\$&').replace(/'/g, "'\\''");
      // Use sed to replace existing key or append if not found
      updateCommands.push(
        `grep -q "^${key}=" "${envPath}" 2>/dev/null && sed -i "s|^${key}=.*|${key}='${escapedValue}'|" "${envPath}" || echo "${key}='${escapedValue}'" >> "${envPath}"`
      );
    }

    // Ensure the .env file exists before operations
    await executeCommand(serverConfig, `touch "${envPath}"`);

    // Execute updates one by one
    let lastResult;
    for (const cmd of updateCommands) {
      lastResult = await executeCommand(serverConfig, cmd);
      if (!lastResult.success) {
        return {
          success: false,
          error: `Failed to update environment variable: ${lastResult.error}`,
          backup_path: backupPath,
          partial_update: true
        };
      }
    }

    // Verify the result by reading back the file
    const verifyResult = await executeCommand(serverConfig, `cat "${envPath}"`);

    const updatedKeys = entries.map(([key]) => key);

    return {
      success: true,
      message: 'Environment variables updated successfully',
      project_path,
      updated_variables: updatedKeys,
      backup_path: backupPath,
      env_content: verifyResult.success ? verifyResult.output : undefined
    };
  }
};
