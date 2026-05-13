/**
 * Tool: uptime_check — Get server uptime and load averages
 * Risk: SAFE (read-only)
 */

import { executeCommand } from '../../agent-executor.js';

export default {
  name: 'uptime_check',
  description: 'Get the server uptime, load averages, and logged-in users on the remote server. Quick health check for system status.',
  parameters: {
    type: 'object',
    properties: {},
    required: []
  },
  risk_level: 'SAFE',
  needs_approval: false,
  category: 'monitoring',

  async implementation(serverConfig) {
    const results = {};

    // Uptime
    const uptimeResult = await executeCommand(serverConfig, 'uptime 2>&1');
    results.uptime = uptimeResult.success ? uptimeResult.output : 'Unable to get uptime';

    // Load averages
    const loadResult = await executeCommand(serverConfig, 'cat /proc/loadavg 2>/dev/null || uptime 2>&1');
    results.load = loadResult.success ? loadResult.output : 'Unable to get load';

    // Who is logged in
    const whoResult = await executeCommand(serverConfig, 'who 2>&1');
    results.logged_in_users = whoResult.success ? whoResult.output : 'Unable to get logged-in users';

    // Last reboots
    const lastRebootResult = await executeCommand(serverConfig, 'last reboot | head -5 2>&1');
    results.last_reboots = lastRebootResult.success ? lastRebootResult.output : 'Unable to get reboot history';

    return {
      success: true,
      ...results
    };
  }
};
