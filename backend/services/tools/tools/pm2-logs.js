/**
 * Tool: pm2_logs — Get PM2 process logs
 * Risk: SAFE (read-only)
 */

import { executeCommand } from '../../agent-executor.js';

export default {
  name: 'pm2_logs',
  description: 'Retrieve logs from PM2 managed processes on the remote server. Supports filtering by process name and limiting the number of lines.',
  parameters: {
    type: 'object',
    properties: {
      process_name: {
        type: 'string',
        description: 'PM2 process name or ID. Use "--all" for all processes.',
        default: '--all'
      },
      lines: {
        type: 'number',
        description: 'Number of log lines to retrieve',
        default: 50
      }
    },
    required: []
  },
  risk_level: 'SAFE',
  needs_approval: false,
  category: 'process',

  async implementation(serverConfig, args) {
    const { process_name = '--all', lines = 50 } = args;

    // Sanitize inputs
    const safeLines = Math.min(Math.max(Math.floor(lines), 1), 1000);
    const safeName = process_name.trim();

    // Validate process name
    const validPattern = /^[a-zA-Z0-9][a-zA-Z0-9._\-]*$|^--all$|^\d+$/;
    if (!validPattern.test(safeName)) {
      return {
        success: false,
        error: `Invalid process name: ${safeName}`
      };
    }

    // Get logs without streaming (--nostream to avoid hanging)
    const logsResult = await executeCommand(
      serverConfig,
      `pm2 logs ${safeName} --nostream --lines ${safeLines} 2>&1`
    );

    if (!logsResult.success) {
      return {
        success: false,
        error: logsResult.error || 'Failed to retrieve PM2 logs',
        exit_code: logsResult.exit_code
      };
    }

    // Also get error logs separately
    const errLogsResult = await executeCommand(
      serverConfig,
      `pm2 logs ${safeName} --nostream --lines ${safeLines} --err 2>&1`
    );

    return {
      success: true,
      process: safeName,
      lines_requested: safeLines,
      logs: logsResult.output,
      error_logs: errLogsResult.success ? errLogsResult.output : undefined,
      has_errors: errLogsResult.success && errLogsResult.output.trim().length > 0
    };
  }
};
