/**
 * Tool: network_info — Get network information
 * Risk: SAFE (read-only)
 */

import { executeCommand } from '../../agent-executor.js';

export default {
  name: 'network_info',
  description: 'Get network information on the remote server. Supports different detail levels: interfaces (IP addresses), connections (listening sockets), ports (port bindings), or DNS (resolver configuration).',
  parameters: {
    type: 'object',
    properties: {
      detail: {
        type: 'string',
        description: 'Level of network detail to retrieve',
        enum: ['interfaces', 'connections', 'ports', 'dns'],
        default: 'interfaces'
      }
    },
    required: []
  },
  risk_level: 'SAFE',
  needs_approval: false,
  category: 'monitoring',

  async implementation(serverConfig, args) {
    const { detail = 'interfaces' } = args;

    let command;
    let secondaryCommand;

    switch (detail) {
      case 'interfaces':
        command = 'ip addr 2>&1';
        secondaryCommand = 'ip route 2>&1';
        break;

      case 'connections':
        command = 'ss -tulpn 2>&1';
        secondaryCommand = 'ss -s 2>&1';
        break;

      case 'ports':
        command = 'netstat -tulpn 2>&1';
        secondaryCommand = 'ss -tulpn 2>&1';
        break;

      case 'dns':
        command = 'cat /etc/resolv.conf 2>&1';
        secondaryCommand = 'cat /etc/hosts 2>&1';
        break;

      default:
        return {
          success: false,
          error: `Invalid detail level: ${detail}. Must be interfaces, connections, ports, or dns.`
        };
    }

    const result = await executeCommand(serverConfig, command);

    if (!result.success) {
      return {
        success: false,
        error: result.error || `Failed to get network info (${detail})`,
        exit_code: result.exit_code
      };
    }

    // Get secondary info
    const secondaryResult = await executeCommand(serverConfig, secondaryCommand);

    // Build response
    const response = {
      success: true,
      detail,
      output: result.output,
      secondary_output: secondaryResult.success ? secondaryResult.output : undefined
    };

    // Add labels based on detail type
    switch (detail) {
      case 'interfaces':
        response.interfaces = result.output;
        response.routes = secondaryResult.success ? secondaryResult.output : undefined;
        break;
      case 'connections':
        response.listening_sockets = result.output;
        response.socket_summary = secondaryResult.success ? secondaryResult.output : undefined;
        break;
      case 'ports':
        response.port_bindings = result.output;
        response.alternative_output = secondaryResult.success ? secondaryResult.output : undefined;
        break;
      case 'dns':
        response.resolv_conf = result.output;
        response.hosts_file = secondaryResult.success ? secondaryResult.output : undefined;
        break;
    }

    return response;
  }
};
