/**
 * Tool: firewall_status — Check UFW/iptables firewall status
 * Risk: SAFE (read-only)
 */

import { executeCommand } from '../../agent-executor.js';

export default {
  name: 'firewall_status',
  description: 'Check the firewall status on the remote server. Tries UFW first, then falls back to iptables. Returns active rules, default policies, and open ports.',
  parameters: {
    type: 'object',
    properties: {}
  },
  risk_level: 'SAFE',
  needs_approval: false,
  category: 'security',

  async implementation(serverConfig) {
    // Try UFW status first
    const ufwResult = await executeCommand(
      serverConfig,
      'ufw status verbose 2>&1'
    );

    if (ufwResult.success && !ufwResult.output.includes('command not found')) {
      const isActive = ufwResult.output.toLowerCase().includes('status: active');

      // Also get numbered rules for easier reference
      const numberedResult = await executeCommand(
        serverConfig,
        'ufw status numbered 2>&1'
      );

      return {
        success: true,
        firewall_type: 'ufw',
        active: isActive,
        status_output: ufwResult.output,
        numbered_rules: numberedResult.success ? numberedResult.output : undefined
      };
    }

    // Fallback to iptables
    const iptablesResult = await executeCommand(
      serverConfig,
      'iptables -L -n -v 2>&1'
    );

    if (iptablesResult.success && !iptablesResult.output.includes('command not found')) {
      // Also get NAT and mangle tables
      const natResult = await executeCommand(
        serverConfig,
        'iptables -t nat -L -n 2>&1 || true'
      );

      return {
        success: true,
        firewall_type: 'iptables',
        active: true,
        status_output: iptablesResult.output,
        nat_output: natResult.success ? natResult.output : undefined
      };
    }

    // No firewall tool found
    return {
      success: true,
      firewall_type: 'none',
      active: false,
      message: 'Neither UFW nor iptables is available on this server',
      ufw_output: ufwResult.output,
      iptables_output: iptablesResult.output
    };
  }
};
