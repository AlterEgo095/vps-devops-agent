/**
 * Tool: swap_manage — Manage swap space on the server
 * Risk: CRITICAL (modifies system memory configuration)
 */

import { executeCommand } from '../../agent-executor.js';

export default {
  name: 'swap_manage',
  description: 'Manage swap space on the remote server. Supports checking current swap status, creating new swap files, removing swap files, enabling swap (swapon), and disabling swap (swapoff). Use this tool to manage virtual memory configuration. All actions are critical as they directly affect system memory management and can impact server stability. Creating swap requires disk space; removing or disabling swap may cause OOM (Out of Memory) errors if physical RAM is insufficient. Requires explicit approval for all actions.',
  parameters: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        description: 'Action to perform on swap space',
        enum: ['status', 'create', 'remove', 'swapon', 'swapoff']
      },
      size_mb: {
        type: 'integer',
        description: 'Size of the swap file in megabytes (e.g., 1024 for 1GB, 4096 for 4GB). Required for create action. Recommended values: 1024, 2048, 4096.',
        minimum: 1,
        maximum: 65536
      },
      swap_file: {
        type: 'string',
        description: 'Path to the swap file (e.g., "/swapfile", "/swapfile2"). Defaults to "/swapfile" if not specified. Used with remove, swapon, and swapoff actions.',
        default: '/swapfile'
      }
    },
    required: ['action']
  },
  risk_level: 'CRITICAL',
  needs_approval: true,
  category: 'system',

  async implementation(serverConfig, args, context) {
    const { action, size_mb, swap_file = '/swapfile' } = args;

    // Validate action
    const validActions = ['status', 'create', 'remove', 'swapon', 'swapoff'];
    if (!validActions.includes(action)) {
      return {
        success: false,
        error: `Invalid action: ${action}. Must be one of: ${validActions.join(', ')}`
      };
    }

    // Validate size_mb for create action
    if (action === 'create' && !size_mb) {
      return {
        success: false,
        error: 'Action "create" requires a size_mb parameter'
      };
    }

    if (size_mb && (size_mb < 1 || size_mb > 65536)) {
      return {
        success: false,
        error: `Invalid swap size: ${size_mb} MB. Must be between 1 and 65536 MB.`
      };
    }

    // Validate swap_file path
    const validPathPattern = /^\/[a-zA-Z0-9_\-./]*$/;
    if (!validPathPattern.test(swap_file)) {
      return {
        success: false,
        error: `Invalid swap file path: ${swap_file}`
      };
    }

    // Ensure swap_file is not a dangerous path
    const dangerousPaths = ['/etc', '/bin', '/usr', '/var', '/boot', '/dev', '/proc', '/sys'];
    for (const dangerous of dangerousPaths) {
      if (swap_file.startsWith(dangerous + '/') || swap_file === dangerous) {
        return {
          success: false,
          error: `Swap file path "${swap_file}" is not allowed. Use a path in the root directory or a safe location (e.g., "/swapfile", "/mnt/swapfile").`
        };
      }
    }

    let command;

    switch (action) {
      case 'status': {
        command = 'echo "=== Swap Summary ===" && swapon --show && echo "" && echo "=== Free Memory ===" && free -h && echo "" && echo "=== Swap Config in /etc/fstab ===" && grep swap /etc/fstab 2>/dev/null || echo "No swap entries in /etc/fstab" 2>&1';
        break;
      }
      case 'create': {
        // Create swap file with proper permissions and format
        command = `fallocate -l ${size_mb}M "${swap_file}" && chmod 600 "${swap_file}" && mkswap "${swap_file}" && swapon "${swap_file}" && echo "${swap_file} none swap sw 0 0" >> /etc/fstab && echo "Swap file created and enabled successfully" 2>&1`;
        break;
      }
      case 'remove': {
        // Disable swap and remove the file, also clean fstab
        command = `swapoff "${swap_file}" 2>/dev/null; sed -i '\\|^${swap_file}|d' /etc/fstab && rm -f "${swap_file}" && echo "Swap file removed successfully" 2>&1`;
        break;
      }
      case 'swapon': {
        command = `swapon "${swap_file}" 2>&1`;
        break;
      }
      case 'swapoff': {
        command = `swapoff "${swap_file}" 2>&1`;
        break;
      }
    }

    const result = await executeCommand(serverConfig, command);

    if (!result.success) {
      // Check for common errors
      if (result.output?.includes('cannot stat') || result.output?.includes('No such file')) {
        return {
          success: false,
          error: `Swap file "${swap_file}" does not exist`,
          exit_code: result.exit_code
        };
      }
      if (result.output?.includes('fallocate failed') || result.output?.includes('No space left')) {
        return {
          success: false,
          error: `Failed to allocate ${size_mb}MB for swap file. Insufficient disk space.`,
          exit_code: result.exit_code
        };
      }
      if (result.output?.includes('Operation not permitted') || result.output?.includes('Permission denied')) {
        return {
          success: false,
          error: 'Permission denied. Swap management requires root/sudo privileges.',
          exit_code: result.exit_code
        };
      }
      if (result.output?.includes('Invalid argument') && action === 'swapon') {
        return {
          success: false,
          error: `Swap file "${swap_file}" needs to be formatted with mkswap before it can be enabled.`,
          exit_code: result.exit_code
        };
      }
      return {
        success: false,
        error: result.error || `Failed to ${action} swap`,
        exit_code: result.exit_code,
        output: result.output
      };
    }

    // Process results based on action
    switch (action) {
      case 'status': {
        // Parse swap information
        const swapLines = result.output.split('\n').filter(line => line.trim());
        return {
          success: true,
          action: 'status',
          output: result.output,
          risk_level: 'SAFE'
        };
      }

      case 'create':
        return {
          success: true,
          action: 'create',
          swap_file,
          size_mb,
          message: `Swap file "${swap_file}" created with ${size_mb}MB and enabled. Entry added to /etc/fstab for persistence.`,
          output: result.output,
          risk_level: 'CRITICAL'
        };

      case 'remove':
        return {
          success: true,
          action: 'remove',
          swap_file,
          message: `Swap file "${swap_file}" disabled, removed from /etc/fstab, and deleted.`,
          output: result.output,
          risk_level: 'CRITICAL'
        };

      case 'swapon':
        return {
          success: true,
          action: 'swapon',
          swap_file,
          message: `Swap file "${swap_file}" enabled successfully`,
          output: result.output,
          risk_level: 'CRITICAL'
        };

      case 'swapoff':
        return {
          success: true,
          action: 'swapoff',
          swap_file,
          message: `Swap file "${swap_file}" disabled successfully. Warning: ensure sufficient physical RAM is available.`,
          output: result.output,
          risk_level: 'CRITICAL'
        };
    }
  }
};
