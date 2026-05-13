/**
 * Tool: pm2_save — Save the current PM2 process list
 * Risk: SAFE (saves process list for auto-restart on reboot)
 */

import { executeCommand } from '../../agent-executor.js';

export default {
  name: 'pm2_save',
  description: 'Save the current PM2 process list on the remote server so processes are automatically restored on system reboot. Also shows the startup command status.',
  parameters: {
    type: 'object',
    properties: {},
    required: []
  },
  risk_level: 'SAFE',
  needs_approval: false,
  category: 'process',

  async implementation(serverConfig) {
    // Save the current process list
    const saveResult = await executeCommand(serverConfig, 'pm2 save 2>&1');

    // Check startup configuration
    const startupResult = await executeCommand(serverConfig, 'pm2 startup 2>&1 | head -5');

    return {
      success: saveResult.success,
      message: saveResult.success ? 'PM2 process list saved successfully' : 'Failed to save PM2 process list',
      save_output: saveResult.output,
      startup_status: startupResult.success ? startupResult.output : 'Startup not configured'
    };
  }
};
