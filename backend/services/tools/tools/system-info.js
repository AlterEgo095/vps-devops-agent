/**
 * Tool: system_info — Get comprehensive system information
 * Risk: SAFE (read-only)
 */

import { executeCommand } from '../../agent-executor.js';

export default {
  name: 'system_info',
  description: 'Get comprehensive system information from the remote server including OS, kernel, CPU, memory, disk, hostname, and uptime. A single tool call instead of multiple monitoring tools.',
  parameters: {
    type: 'object',
    properties: {
      sections: {
        type: 'array',
        items: {
          type: 'string',
          enum: ['os', 'cpu', 'memory', 'disk', 'network', 'uptime', 'hostname']
        },
        description: 'Which sections to include. Default: all sections'
      }
    },
    required: []
  },
  risk_level: 'SAFE',
  needs_approval: false,
  category: 'monitoring',

  async implementation(serverConfig, args) {
    const { sections } = args;
    const requested = sections || ['os', 'cpu', 'memory', 'disk', 'network', 'uptime', 'hostname'];
    const results = {};

    const commands = {
      os: 'cat /etc/os-release 2>/dev/null | head -10',
      cpu: 'lscpu 2>/dev/null | head -20',
      memory: 'free -h 2>/dev/null',
      disk: 'df -h 2>/dev/null | head -20',
      network: 'hostname -I 2>/dev/null; echo "---"; ip route show default 2>/dev/null | head -5',
      uptime: 'uptime 2>/dev/null; echo "---"; cat /proc/loadavg 2>/dev/null',
      hostname: 'hostname 2>/dev/null; echo "---"; cat /etc/hosts 2>/dev/null | head -10'
    };

    for (const section of requested) {
      if (commands[section]) {
        const result = await executeCommand(serverConfig, commands[section]);
        results[section] = result.success ? result.output : `Unable to get ${section} info`;
      }
    }

    return {
      success: true,
      ...results
    };
  }
};
