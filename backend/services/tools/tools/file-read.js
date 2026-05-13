/**
 * Tool: file_read — Read file contents from remote server
 * Risk: SAFE (read-only)
 */

import { executeCommand } from '../../agent-executor.js';

export default {
  name: 'file_read',
  description: 'Read the contents of a file on the remote server. Returns the file content as a string. Supports optional line range reading.',
  parameters: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Absolute path to the file to read'
      },
      start_line: {
        type: 'number',
        description: 'Starting line number (1-based). Default: 1',
        default: 1
      },
      end_line: {
        type: 'number',
        description: 'Ending line number. Default: all lines',
        default: null
      },
      encoding: {
        type: 'string',
        description: 'File encoding',
        default: 'utf-8'
      }
    },
    required: ['path']
  },
  risk_level: 'SAFE',
  needs_approval: false,
  category: 'file',

  async implementation(serverConfig, args) {
    const { path, start_line = 1, end_line } = args;

    let command;
    if (end_line) {
      // Read specific line range
      command = `sed -n '${start_line},${end_line}p' "${path}"`;
    } else if (start_line > 1) {
      // Read from start_line to end
      command = `tail -n +${start_line} "${path}"`;
    } else {
      // Read entire file
      command = `cat "${path}"`;
    }

    const result = await executeCommand(serverConfig, command);

    if (!result.success) {
      return {
        success: false,
        error: result.error || `Failed to read file: ${path}`,
        exit_code: result.exit_code
      };
    }

    // Get file info
    const statResult = await executeCommand(serverConfig, `stat -c '%s %Y' "${path}" 2>/dev/null || echo "0 0"`);
    const [size, mtime] = statResult.success ? statResult.output.trim().split(' ') : ['0', '0'];

    return {
      success: true,
      path,
      content: result.output,
      size_bytes: parseInt(size) || 0,
      modified: mtime ? new Date(parseInt(mtime) * 1000).toISOString() : null,
      lines_read: result.output.split('\n').length
    };
  }
};
