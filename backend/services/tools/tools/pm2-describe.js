/**
 * Tool: pm2_describe — Get detailed info about a PM2 process
 * Risk: SAFE (read-only)
 */

import { executeCommand } from '../../agent-executor.js';

export default {
  name: 'pm2_describe',
  description: 'Get detailed information about a specific PM2 managed process on the remote server. Shows status, memory, CPU, restarts, uptime, logs paths, and more.',
  parameters: {
    type: 'object',
    properties: {
      process_name: {
        type: 'string',
        description: 'PM2 process name or ID to describe'
      }
    },
    required: ['process_name']
  },
  risk_level: 'SAFE',
  needs_approval: false,
  category: 'process',

  async implementation(serverConfig, args) {
    const { process_name } = args;

    if (!process_name) {
      return { success: false, error: 'process_name is required' };
    }

    const sanitized = process_name.trim();
    const validPattern = /^[a-zA-Z0-9][a-zA-Z0-9._\- ]*$|^\d+$/;
    if (!validPattern.test(sanitized)) {
      return { success: false, error: `Invalid process name: ${process_name}` };
    }

    const result = await executeCommand(
      serverConfig,
      `pm2 describe ${sanitized} 2>&1`
    );

    if (!result.success) {
      return {
        success: false,
        error: result.error || `Failed to describe PM2 process: ${sanitized}`,
        exit_code: result.exit_code
      };
    }

    return {
      success: true,
      process: sanitized,
      output: result.output
    };
  }
};
