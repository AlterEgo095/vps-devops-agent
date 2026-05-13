/**
 * Tool: service_status — Check systemd service status
 * Risk: SAFE (read-only)
 */

import { executeCommand } from '../../agent-executor.js';

export default {
  name: 'service_status',
  description: 'Check the status of a systemd service on the remote server. Returns service state, PID, memory usage, and uptime.',
  parameters: {
    type: 'object',
    properties: {
      service: {
        type: 'string',
        description: 'Service name (e.g., "nginx", "docker", "mysql")'
      },
      verbose: {
        type: 'boolean',
        description: 'Include detailed status output',
        default: false
      }
    },
    required: ['service']
  },
  risk_level: 'SAFE',
  needs_approval: false,
  category: 'system',

  async implementation(serverConfig, args) {
    const { service, verbose = false } = args;

    // Get service status
    const result = await executeCommand(serverConfig, `systemctl status ${service} --no-pager`);

    // Also get active state and sub-state quickly
    const stateResult = await executeCommand(
      serverConfig,
      `systemctl is-active ${service} 2>/dev/null; systemctl is-enabled ${service} 2>/dev/null`
    );

    const [activeState, enabledState] = stateResult.success
      ? stateResult.output.trim().split('\n')
      : ['unknown', 'unknown'];

    const isActive = activeState === 'active';
    const isEnabled = enabledState === 'enabled';

    return {
      success: true,
      service,
      active: isActive,
      enabled: isEnabled,
      state: activeState,
      status_output: verbose ? result.output : undefined,
      exists: !result.output.includes('could not be found') && !result.output.includes('not be found')
    };
  }
};
