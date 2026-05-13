/**
 * Tool: pm2_restart — Restart a PM2 process
 * Risk: MODERATE (process restart)
 */

import { executeCommand } from '../../agent-executor.js';

export default {
  name: 'pm2_restart',
  description: 'Restart a PM2 managed process on the remote server. Use "all" to restart all processes. The process will be stopped and started again.',
  parameters: {
    type: 'object',
    properties: {
      process_name: {
        type: 'string',
        description: 'PM2 process name or ID to restart. Use "all" to restart all processes.'
      }
    },
    required: ['process_name']
  },
  risk_level: 'MODERATE',
  needs_approval: false,
  category: 'process',

  async implementation(serverConfig, args) {
    const { process_name } = args;

    if (!process_name) {
      return {
        success: false,
        error: 'process_name is required'
      };
    }

    // Sanitize process name (allow alphanumeric, dash, underscore, and "all")
    const sanitized = process_name.trim();
    const validPattern = /^[a-zA-Z0-9][a-zA-Z0-9._\- ]*$|^all$|^\d+$/;
    if (!validPattern.test(sanitized)) {
      return {
        success: false,
        error: `Invalid process name: ${process_name}`
      };
    }

    // Restart the process
    const restartResult = await executeCommand(
      serverConfig,
      `pm2 restart ${sanitized} 2>&1`
    );

    if (!restartResult.success) {
      return {
        success: false,
        error: restartResult.error || `Failed to restart PM2 process: ${sanitized}`,
        exit_code: restartResult.exit_code
      };
    }

    // Get updated status after restart
    const statusResult = await executeCommand(
      serverConfig,
      `pm2 describe ${sanitized} 2>&1 | head -20`
    );

    return {
      success: true,
      message: `PM2 process "${sanitized}" restarted successfully`,
      process: sanitized,
      restart_output: restartResult.output,
      status_output: statusResult.success ? statusResult.output : undefined
    };
  }
};
