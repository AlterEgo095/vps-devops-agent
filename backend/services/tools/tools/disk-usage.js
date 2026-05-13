/**
 * Tool: disk_usage — Get disk usage information
 * Risk: SAFE (read-only)
 */

import { executeCommand } from '../../agent-executor.js';

export default {
  name: 'disk_usage',
  description: 'Get disk usage information on the remote server. Shows filesystem usage for the specified path or mount point. Returns total, used, and available space.',
  parameters: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Path or mount point to check disk usage for',
        default: '/'
      },
      human_readable: {
        type: 'boolean',
        description: 'Display sizes in human-readable format (KB, MB, GB)',
        default: true
      }
    },
    required: []
  },
  risk_level: 'SAFE',
  needs_approval: false,
  category: 'monitoring',

  async implementation(serverConfig, args) {
    const { path = '/', human_readable = true } = args;

    // Validate path
    if (!path.startsWith('/')) {
      return {
        success: false,
        error: 'path must be an absolute path starting with /'
      };
    }

    const hFlag = human_readable ? '-h' : '';

    // Get disk usage for the specified path
    const dfResult = await executeCommand(
      serverConfig,
      `df ${hFlag} "${path}" 2>&1`
    );

    if (!dfResult.success) {
      return {
        success: false,
        error: dfResult.error || `Failed to get disk usage for ${path}`,
        exit_code: dfResult.exit_code
      };
    }

    // Get all filesystems overview
    const allResult = await executeCommand(
      serverConfig,
      `df ${hFlag} 2>&1`
    );

    // Get directory size breakdown (top-level dirs in the path)
    const duResult = await executeCommand(
      serverConfig,
      `du ${hFlag} -s "${path}"/* 2>/dev/null | sort -rh | head -15`
    );

    // Get inode usage
    const inodeResult = await executeCommand(
      serverConfig,
      `df -i "${path}" 2>&1`
    );

    return {
      success: true,
      path,
      disk_usage: dfResult.output,
      all_filesystems: allResult.success ? allResult.output : undefined,
      directory_breakdown: duResult.success ? duResult.output : undefined,
      inode_usage: inodeResult.success ? inodeResult.output : undefined
    };
  }
};
