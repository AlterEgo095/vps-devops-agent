/**
 * Tool: memory_info — Get memory/RAM information
 * Risk: SAFE (read-only)
 */

import { executeCommand } from '../../agent-executor.js';

export default {
  name: 'memory_info',
  description: 'Get memory (RAM) and swap information on the remote server. Shows total, used, free, and cached memory in human-readable format.',
  parameters: {
    type: 'object',
    properties: {}
  },
  risk_level: 'SAFE',
  needs_approval: false,
  category: 'monitoring',

  async implementation(serverConfig) {
    // Get memory info from free command
    const freeResult = await executeCommand(
      serverConfig,
      'free -h 2>&1'
    );

    if (!freeResult.success) {
      return {
        success: false,
        error: freeResult.error || 'Failed to get memory information',
        exit_code: freeResult.exit_code
      };
    }

    // Get detailed memory info from /proc/meminfo
    const meminfoResult = await executeCommand(
      serverConfig,
      'cat /proc/meminfo | head -10 2>&1'
    );

    // Get top memory-consuming processes
    const topMemResult = await executeCommand(
      serverConfig,
      'ps aux --sort=-%mem | head -11 2>&1'
    );

    // Get swappiness setting
    const swappinessResult = await executeCommand(
      serverConfig,
      'cat /proc/sys/vm/swappiness 2>/dev/null || echo "unknown"'
    );

    return {
      success: true,
      memory_summary: freeResult.output,
      meminfo_detail: meminfoResult.success ? meminfoResult.output : undefined,
      top_memory_processes: topMemResult.success ? topMemResult.output : undefined,
      swappiness: swappinessResult.success ? swappinessResult.output.trim() : undefined
    };
  }
};
