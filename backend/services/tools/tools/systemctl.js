/**
 * Tool: systemctl — Manage systemd services
 * Risk: MODERATE (start/restart) or CRITICAL (stop/disable)
 */

import { executeCommand } from '../../agent-executor.js';

export default {
  name: 'systemctl',
  description: 'Manage systemd services on the remote server. Supports start, stop, restart, reload, enable, disable operations. stop and disable are CRITICAL operations requiring approval.',
  parameters: {
    type: 'object',
    properties: {
      service: {
        type: 'string',
        description: 'Service name (e.g., "nginx", "docker", "mysql")'
      },
      action: {
        type: 'string',
        description: 'Action to perform',
        enum: ['start', 'stop', 'restart', 'reload', 'enable', 'disable', 'status']
      }
    },
    required: ['service', 'action']
  },
  risk_level: 'MODERATE', // Dynamic based on action
  needs_approval: false, // Handled dynamically in implementation
  category: 'system',

  async implementation(serverConfig, args, context) {
    const { service, action } = args;

    // Validate service name
    const validServicePattern = /^[a-zA-Z0-9][a-zA-Z0-9.\-_@]*$/;
    if (!validServicePattern.test(service)) {
      return { success: false, error: `Invalid service name: ${service}` };
    }

    // Validate action
    const validActions = ['start', 'stop', 'restart', 'reload', 'enable', 'disable', 'status'];
    if (!validActions.includes(action)) {
      return { success: false, error: `Invalid action: ${action}. Must be one of: ${validActions.join(', ')}` };
    }

    // CRITICAL actions require approval (checked at executor level via needs_approval override)
    const criticalActions = ['stop', 'disable'];
    const isCriticalAction = criticalActions.includes(action);

    if (isCriticalAction && !context.approvedBy) {
      return {
        success: false,
        error: `Action "${action}" on service "${service}" requires approval`,
        needs_approval: true,
        risk_level: 'CRITICAL'
      };
    }

    // Execute the systemctl command
    const command = `systemctl ${action} ${service} --no-pager 2>&1`;
    const result = await executeCommand(serverConfig, command);

    return {
      success: result.success || result.exit_code === 0,
      service,
      action,
      output: result.output,
      error: result.error,
      exit_code: result.exit_code,
      risk_level: isCriticalAction ? 'CRITICAL' : 'MODERATE'
    };
  }
};
