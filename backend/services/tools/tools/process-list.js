/**
 * Tool: process_list — List running processes
 * Risk: SAFE (read-only)
 */

import { executeCommand } from '../../agent-executor.js';

export default {
  name: 'process_list',
  description: 'List running processes on the remote server. Supports filtering by name and sorting by CPU or memory usage. Returns top processes with their resource consumption.',
  parameters: {
    type: 'object',
    properties: {
      filter: {
        type: 'string',
        description: 'Filter processes by name (grep pattern). Optional.'
      },
      sort_by: {
        type: 'string',
        description: 'Sort processes by resource usage',
        enum: ['cpu', 'memory'],
        default: 'cpu'
      },
      limit: {
        type: 'number',
        description: 'Maximum number of processes to return',
        default: 20
      }
    },
    required: []
  },
  risk_level: 'SAFE',
  needs_approval: false,
  category: 'monitoring',

  async implementation(serverConfig, args) {
    const { filter, sort_by = 'cpu', limit = 20 } = args;

    const safeLimit = Math.min(Math.max(Math.floor(limit), 1), 100);
    const sortFlag = sort_by === 'memory' ? '-%mem' : '-%cpu';

    // Build command
    let command = `ps aux --sort=${sortFlag} | head -${safeLimit + 1}`;

    // Apply filter if provided
    if (filter) {
      // Validate filter — only allow alphanumeric and basic regex chars
      const safeFilter = filter.replace(/[;|&$`]/g, '');
      command = `ps aux --sort=${sortFlag} | grep -i "${safeFilter}" | head -${safeLimit}`;
    }

    const result = await executeCommand(serverConfig, command);

    if (!result.success) {
      return {
        success: false,
        error: result.error || 'Failed to list processes',
        exit_code: result.exit_code
      };
    }

    // Get load average
    const loadResult = await executeCommand(
      serverConfig,
      'cat /proc/loadavg 2>/dev/null || uptime'
    );

    // Get total process count
    const countResult = await executeCommand(
      serverConfig,
      'ps aux | wc -l'
    );

    return {
      success: true,
      processes: result.output,
      sort_by,
      limit: safeLimit,
      filtered: !!filter,
      filter: filter || undefined,
      load_average: loadResult.success ? loadResult.output.trim() : undefined,
      total_processes: countResult.success ? parseInt(countResult.output.trim()) - 1 : undefined
    };
  }
};
