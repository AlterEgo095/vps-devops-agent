/**
 * Tool: log_read — Read system/application logs
 * Risk: SAFE (read-only, limited follow mode)
 */

import { executeCommand } from '../../agent-executor.js';

export default {
  name: 'log_read',
  description: 'Read system or application logs on the remote server. Supports filtering with grep patterns and tailing. When follow mode is enabled, captures output for a limited duration instead of streaming indefinitely.',
  parameters: {
    type: 'object',
    properties: {
      log_path: {
        type: 'string',
        description: 'Absolute path to the log file (e.g., /var/log/nginx/error.log, /var/log/syslog)'
      },
      lines: {
        type: 'number',
        description: 'Number of lines to read from the end of the log',
        default: 100
      },
      filter: {
        type: 'string',
        description: 'Grep pattern to filter log entries. Optional.'
      },
      follow: {
        type: 'boolean',
        description: 'If true, use tail -f for a limited duration (5 seconds) to capture live logs',
        default: false
      }
    },
    required: ['log_path']
  },
  risk_level: 'SAFE',
  needs_approval: false,
  category: 'monitoring',

  async implementation(serverConfig, args) {
    const { log_path, lines = 100, filter, follow = false } = args;

    if (!log_path || !log_path.startsWith('/')) {
      return {
        success: false,
        error: 'log_path must be an absolute path starting with /'
      };
    }

    // Validate path doesn't contain suspicious characters
    if (/[;&|$`]/.test(log_path)) {
      return {
        success: false,
        error: 'Invalid characters in log_path'
      };
    }

    const safeLines = Math.min(Math.max(Math.floor(lines), 1), 5000);

    let command;

    if (follow) {
      // Use timeout with tail -f for limited duration (5 seconds)
      if (filter) {
        const safeFilter = filter.replace(/[;|&$`]/g, '');
        command = `timeout 5 tail -f -n ${safeLines} "${log_path}" 2>&1 | grep -i "${safeFilter}" || true`;
      } else {
        command = `timeout 5 tail -f -n ${safeLines} "${log_path}" 2>&1 || true`;
      }
    } else {
      if (filter) {
        const safeFilter = filter.replace(/[;|&$`]/g, '');
        command = `tail -n ${safeLines} "${log_path}" 2>&1 | grep -i "${safeFilter}"`;
      } else {
        command = `tail -n ${safeLines} "${log_path}" 2>&1`;
      }
    }

    const result = await executeCommand(serverConfig, command);

    if (!result.success && result.exit_code !== 0 && !result.output) {
      return {
        success: false,
        error: result.error || `Failed to read log file: ${log_path}`,
        exit_code: result.exit_code
      };
    }

    // Get file metadata
    const statResult = await executeCommand(
      serverConfig,
      `stat -c '%s %Y' "${log_path}" 2>/dev/null || echo "0 0"`
    );
    const [size, mtime] = statResult.success ? statResult.output.trim().split(' ') : ['0', '0'];

    const lineCount = (result.output || '').split('\n').filter(l => l.trim()).length;

    return {
      success: true,
      log_path,
      content: result.output,
      lines_returned: lineCount,
      lines_requested: safeLines,
      filtered: !!filter,
      filter: filter || undefined,
      follow_mode: follow,
      file_size_bytes: parseInt(size) || 0,
      last_modified: mtime ? new Date(parseInt(mtime) * 1000).toISOString() : null
    };
  }
};
