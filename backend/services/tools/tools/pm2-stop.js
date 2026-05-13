/**
 * Tool: pm2_stop — Stop a PM2 process
 * Risk: MODERATE (stops a running process)
 */

import { executeCommand } from '../../agent-executor.js';

export default {
  name: 'pm2_stop',
  description: 'Stop a PM2 managed process on the remote server. The process will be stopped but remains in the PM2 process list (use pm2_delete to remove it). Use "all" to stop all processes.',
  parameters: {
    type: 'object',
    properties: {
      process_name: {
        type: 'string',
        description: 'PM2 process name or ID to stop. Use "all" to stop all processes.'
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
      return { success: false, error: 'process_name is required' };
    }

    const sanitized = process_name.trim();
    const validPattern = /^[a-zA-Z0-9][a-zA-Z0-9._\- ]*$|^all$|^\d+$/;
    if (!validPattern.test(sanitized)) {
      return { success: false, error: `Invalid process name: ${process_name}` };
    }

    const stopResult = await executeCommand(
      serverConfig,
      `pm2 stop ${sanitized} 2>&1`
    );

    if (!stopResult.success) {
      return {
        success: false,
        error: stopResult.error || `Failed to stop PM2 process: ${sanitized}`,
        exit_code: stopResult.exit_code
      };
    }

    return {
      success: true,
      message: `PM2 process "${sanitized}" stopped successfully`,
      process: sanitized,
      output: stopResult.output
    };
  }
};
