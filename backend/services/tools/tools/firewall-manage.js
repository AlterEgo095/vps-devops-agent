/**
 * Tool: firewall_manage — Add/remove firewall rules
 * Risk: CRITICAL (modifies security rules)
 */

import { executeCommand } from '../../agent-executor.js';

export default {
  name: 'firewall_manage',
  description: 'Add or remove firewall rules on the remote server using UFW. Supports allow/deny rules with port, protocol, and optional source IP. Requires approval.',
  parameters: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        description: 'Firewall action to perform',
        enum: ['allow', 'deny', 'delete']
      },
      port: {
        type: 'string',
        description: 'Port number or service name (e.g., "80", "443", "ssh", "3000:3010")'
      },
      protocol: {
        type: 'string',
        description: 'Network protocol',
        default: 'tcp'
      },
      source: {
        type: 'string',
        description: 'Source IP address or CIDR (e.g., "192.168.1.0/24", "10.0.0.1"). Optional — if omitted, applies to all sources.'
      }
    },
    required: ['action', 'port']
  },
  risk_level: 'CRITICAL',
  needs_approval: true,
  category: 'security',

  async implementation(serverConfig, args) {
    const { action, port, protocol = 'tcp', source } = args;

    // Validate action
    const validActions = ['allow', 'deny', 'delete'];
    if (!validActions.includes(action)) {
      return {
        success: false,
        error: `Invalid action: ${action}. Must be one of: ${validActions.join(', ')}`
      };
    }

    // Validate port (number, range, or service name)
    const validPortPattern = /^[a-zA-Z0-9][a-zA-Z0-9:\-]*$/;
    if (!validPortPattern.test(port)) {
      return {
        success: false,
        error: `Invalid port: ${port}`
      };
    }

    // Validate protocol
    const validProtocols = ['tcp', 'udp', 'both'];
    const effectiveProtocol = protocol.toLowerCase();
    if (!validProtocols.includes(effectiveProtocol)) {
      return {
        success: false,
        error: `Invalid protocol: ${protocol}. Must be tcp, udp, or both.`
      };
    }

    // Validate source IP if provided
    if (source) {
      const validSourcePattern = /^[0-9a-fA-F.:\/]+$/;
      if (!validSourcePattern.test(source)) {
        return {
          success: false,
          error: `Invalid source IP/CIDR: ${source}`
        };
      }
    }

    // Build UFW command
    let ufwCmd;
    if (action === 'delete') {
      // Delete an existing rule
      if (source) {
        ufwCmd = `ufw delete ${action} from ${source} to any port ${port} proto ${effectiveProtocol} 2>&1`;
      } else {
        ufwCmd = `ufw delete ${action} ${port}/${effectiveProtocol} 2>&1`;
      }
    } else {
      // allow or deny
      if (source) {
        ufwCmd = `ufw ${action} from ${source} to any port ${port} proto ${effectiveProtocol} 2>&1`;
      } else {
        ufwCmd = `ufw ${action} ${port}/${effectiveProtocol} 2>&1`;
      }
    }

    const result = await executeCommand(serverConfig, ufwCmd);

    if (!result.success) {
      // Check if UFW is not available
      if (result.output?.includes('command not found')) {
        return {
          success: false,
          error: 'UFW is not installed on this server. Install it with: apt install ufw'
        };
      }
      return {
        success: false,
        error: result.error || `Failed to ${action} firewall rule for port ${port}`,
        exit_code: result.exit_code,
        output: result.output
      };
    }

    // Get updated status
    const statusResult = await executeCommand(
      serverConfig,
      'ufw status 2>&1'
    );

    return {
      success: true,
      message: `Firewall rule ${action} for port ${port}/${effectiveProtocol} ${source ? `from ${source}` : ''} applied successfully`,
      action,
      port,
      protocol: effectiveProtocol,
      source: source || 'any',
      output: result.output,
      updated_status: statusResult.success ? statusResult.output : undefined
    };
  }
};
