/**
 * Tool: pm2_delete — Delete a PM2 process from the process list
 * Risk: MODERATE (removes a process from PM2 management)
 */

import { executeCommand } from '../../agent-executor.js';

export default {
  name: 'pm2_delete',
  description: 'Delete a PM2 process from the process list on the remote server. This stops the process and removes it from PM2 management. Use "all" to delete all processes.',
  parameters: {
    type: 'object',
    properties: {
      process_name: {
        type: 'string',
        description: 'PM2 process name or ID to delete. Use "all" to delete all processes.'
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

    const deleteResult = await executeCommand(
      serverConfig,
      `pm2 delete ${sanitized} 2>&1`
    );

    if (!deleteResult.success) {
      return {
        success: false,
        error: deleteResult.error || `Failed to delete PM2 process: ${sanitized}`,
        exit_code: deleteResult.exit_code
      };
    }

    // Save the updated process list
    const saveResult = await executeCommand(serverConfig, 'pm2 save 2>&1');

    return {
      success: true,
      message: `PM2 process "${sanitized}" deleted successfully`,
      process: sanitized,
      output: deleteResult.output,
      saved: saveResult.success
    };
  }
};
