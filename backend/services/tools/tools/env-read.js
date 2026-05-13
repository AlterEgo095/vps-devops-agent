/**
 * Tool: env_read — Read .env file with sensitive value masking
 * Risk: SAFE (read-only, masks secrets)
 */

import { executeCommand } from '../../agent-executor.js';

export default {
  name: 'env_read',
  description: 'Read the .env file from a project directory on the remote server. Sensitive values (passwords, secrets, keys, tokens) are automatically masked for security. Shows only the first 4 characters followed by ***.',
  parameters: {
    type: 'object',
    properties: {
      project_path: {
        type: 'string',
        description: 'Absolute path to the project directory containing the .env file'
      }
    },
    required: ['project_path']
  },
  risk_level: 'SAFE',
  needs_approval: false,
  category: 'config',

  async implementation(serverConfig, args) {
    const { project_path } = args;

    if (!project_path || !project_path.startsWith('/')) {
      return {
        success: false,
        error: 'project_path must be an absolute path starting with /'
      };
    }

    // Read the .env file
    const result = await executeCommand(
      serverConfig,
      `cat "${project_path}/.env" 2>&1`
    );

    if (!result.success) {
      return {
        success: false,
        error: result.error || `Failed to read .env file from ${project_path}`,
        exit_code: result.exit_code
      };
    }

    // Mask sensitive values
    const sensitivePatterns = [
      /password/i, /passwd/i, /secret/i, /key/i, /token/i,
      /auth/i, /credential/i, /api_key/i, /access_key/i,
      /private/i, /cert/i, /pass/i
    ];

    const maskedContent = result.output.split('\n').map(line => {
      const trimmed = line.trim();

      // Skip empty lines and comments
      if (!trimmed || trimmed.startsWith('#')) {
        return line;
      }

      // Parse key=value
      const eqIndex = trimmed.indexOf('=');
      if (eqIndex === -1) {
        return line;
      }

      const key = trimmed.substring(0, eqIndex).trim();
      const value = trimmed.substring(eqIndex + 1).trim();

      // Remove surrounding quotes for masking check
      const unquotedValue = value.replace(/^["']|["']$/g, '');

      // Check if key matches sensitive patterns
      const isSensitive = sensitivePatterns.some(pattern => pattern.test(key));

      if (isSensitive && unquotedValue.length > 4) {
        const masked = unquotedValue.substring(0, 4) + '***';
        const quoteChar = value.startsWith('"') ? '"' : value.startsWith("'") ? "'" : '';
        return `${key}=${quoteChar}${masked}${quoteChar}`;
      }

      return line;
    }).join('\n');

    // Count variables
    const varCount = result.output.split('\n').filter(
      l => l.trim() && !l.trim().startsWith('#') && l.includes('=')
    ).length;

    return {
      success: true,
      project_path,
      content: maskedContent,
      variables_count: varCount,
      note: 'Sensitive values (passwords, keys, tokens, secrets) are masked. Use shell_exec to read raw values if needed (requires approval).'
    };
  }
};
