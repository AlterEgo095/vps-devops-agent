/**
 * Tool: service_manage — Manage systemd services
 * Risk: MODERATE (start/restart) or CRITICAL (stop/disable)
 */

import { executeCommand } from '../../agent-executor.js';

export default {
  name: 'service_manage',
  description: 'Manage systemd services on the remote server. Supports start, stop, restart, status, enable, and disable operations. Stop and disable actions require approval as they can disrupt services.',
  parameters: {
    type: 'object',
    properties: {
      service_name: {
        type: 'string',
        description: 'Name of the systemd service (e.g., "nginx", "docker", "mysql")'
      },
      action: {
        type: 'string',
        description: 'Action to perform on the service',
        enum: ['start', 'stop', 'restart', 'status', 'enable', 'disable']
      }
    },
    required: ['service_name', 'action']
  },
  risk_level: 'MODERATE',
  needs_approval: false,
  category: 'system',

  async implementation(serverConfig, args, context) {
    const { service_name, action } = args;

    // Validate service name
    const validServicePattern = /^[a-zA-Z0-9][a-zA-Z0-9.\-_@]*$/;
    if (!validServicePattern.test(service_name)) {
      return {
        success: false,
        error: `Invalid service name: ${service_name}`
      };
    }

    // Validate action
    const validActions = ['start', 'stop', 'restart', 'status', 'enable', 'disable'];
    if (!validActions.includes(action)) {
      return {
        success: false,
        error: `Invalid action: ${action}. Must be one of: ${validActions.join(', ')}`
      };
    }

    // Critical actions require approval
    const criticalActions = ['stop', 'disable'];
    const isCritical = criticalActions.includes(action);

    if (isCritical && !context.approvedBy) {
      return {
        success: false,
        error: `Action "${action}" on service "${service_name}" requires approval`,
        needs_approval: true,
        risk_level: 'CRITICAL'
      };
    }

    // Execute the systemctl command
    const command = `systemctl ${action} ${service_name} --no-pager 2>&1`;
    const result = await executeCommand(serverConfig, command);

    // For status action, also get is-active and is-enabled
    if (action === 'status') {
      const stateResult = await executeCommand(
        serverConfig,
        `systemctl is-active ${service_name} 2>/dev/null; systemctl is-enabled ${service_name} 2>/dev/null`
      );

      const [activeState, enabledState] = stateResult.success
        ? stateResult.output.trim().split('\n')
        : ['unknown', 'unknown'];

      return {
        success: true,
        service: service_name,
        action,
        active: activeState === 'active',
        enabled: enabledState === 'enabled',
        state: activeState,
        enabled_state: enabledState,
        output: result.output,
        risk_level: isCritical ? 'CRITICAL' : 'MODERATE'
      };
    }

    return {
      success: result.success || result.exit_code === 0,
      service: service_name,
      action,
      output: result.output,
      error: result.error,
      exit_code: result.exit_code,
      risk_level: isCritical ? 'CRITICAL' : 'MODERATE'
    };
  }
};
