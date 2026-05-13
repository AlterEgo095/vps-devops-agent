/**
 * Tool: port_check — Check open ports and listening services
 * Risk: SAFE (read-only)
 */

import { executeCommand } from '../../agent-executor.js';

export default {
  name: 'port_check',
  description: 'Check open ports and listening services on the remote server. Shows which ports are in use and by which processes.',
  parameters: {
    type: 'object',
    properties: {
      port: {
        type: 'number',
        description: 'Specific port number to check (optional, shows all if not specified)'
      },
      protocol: {
        type: 'string',
        enum: ['tcp', 'udp', 'both'],
        description: 'Protocol to check. Default: "both"',
        default: 'both'
      }
    },
    required: []
  },
  risk_level: 'SAFE',
  needs_approval: false,
  category: 'monitoring',

  async implementation(serverConfig, args) {
    const { port, protocol = 'both' } = args;

    const results = {};

    if (port) {
      // Check specific port
      const specificResult = await executeCommand(
        serverConfig,
        `ss -tlnp 2>/dev/null | grep ':${port} ' || netstat -tlnp 2>/dev/null | grep ':${port} ' || echo "Port ${port} not found in listening sockets"`
      );
      results.port_check = specificResult.success ? specificResult.output : `Unable to check port ${port}`;
    } else {
      // Show all listening ports
      let cmd = 'ss -tlnp 2>/dev/null || netstat -tlnp 2>/dev/null';
      if (protocol === 'udp') {
        cmd = 'ss -ulnp 2>/dev/null || netstat -ulnp 2>/dev/null';
      } else if (protocol === 'both') {
        cmd = 'ss -tulnp 2>/dev/null || netstat -tulnp 2>/dev/null';
      }

      const allPortsResult = await executeCommand(serverConfig, cmd);
      results.listening_ports = allPortsResult.success ? allPortsResult.output : 'Unable to list ports';
    }

    return {
      success: true,
      ...results
    };
  }
};
