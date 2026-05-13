/**
 * Tool: apt_manage — Package management via apt
 * Risk: MODERATE (install/update/upgrade) or CRITICAL (remove)
 */

import { executeCommand } from '../../agent-executor.js';

export default {
  name: 'apt_manage',
  description: 'Manage packages on the remote server using apt. Supports install, remove, update, upgrade, and list operations. Remove action is CRITICAL and requires approval.',
  parameters: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        description: 'Package management action',
        enum: ['install', 'remove', 'update', 'upgrade', 'list']
      },
      packages: {
        type: 'string',
        description: 'Space-separated package names. Required for install and remove actions.'
      }
    },
    required: ['action']
  },
  risk_level: 'MODERATE',
  needs_approval: false,
  category: 'system',

  async implementation(serverConfig, args, context) {
    const { action, packages } = args;

    // Validate action
    const validActions = ['install', 'remove', 'update', 'upgrade', 'list'];
    if (!validActions.includes(action)) {
      return {
        success: false,
        error: `Invalid action: ${action}. Must be one of: ${validActions.join(', ')}`
      };
    }

    // Validate packages for install/remove
    if ((action === 'install' || action === 'remove') && !packages) {
      return {
        success: false,
        error: `packages is required for ${action} action`
      };
    }

    // Validate package names if provided
    if (packages) {
      const validPattern = /^[a-zA-Z0-9][a-zA-Z0-9.\-+]*$/;
      const packageList = packages.trim().split(/\s+/);
      for (const pkg of packageList) {
        if (!validPattern.test(pkg)) {
          return {
            success: false,
            error: `Invalid package name: ${pkg}`
          };
        }
      }
    }

    // Remove is CRITICAL — requires approval
    if (action === 'remove' && !context.approvedBy) {
      return {
        success: false,
        error: `Action "remove" for packages "${packages}" requires approval`,
        needs_approval: true,
        risk_level: 'CRITICAL'
      };
    }

    let command;
    let output = '';

    switch (action) {
      case 'update':
        command = 'apt update -y 2>&1';
        break;

      case 'upgrade':
        command = 'apt update -y 2>&1 && apt upgrade -y 2>&1';
        break;

      case 'install':
        command = `apt update -y 2>&1 && apt install -y ${packages} 2>&1`;
        break;

      case 'remove':
        command = `apt remove -y ${packages} 2>&1`;
        break;

      case 'list': {
        // List installed packages or search
        const listCommand = packages
          ? `apt list --installed 2>/dev/null | grep -i "${packages.replace(/[;|&$`]/g, '')}"`
          : 'apt list --installed 2>/dev/null | head -50';
        const listResult = await executeCommand(serverConfig, listCommand);

        return {
          success: true,
          action: 'list',
          packages: listResult.output,
          filter: packages || undefined
        };
      }

      default:
        return { success: false, error: `Unhandled action: ${action}` };
    }

    const result = await executeCommand(serverConfig, command);

    if (!result.success && result.exit_code !== 0) {
      return {
        success: false,
        error: result.error || `apt ${action} failed`,
        exit_code: result.exit_code,
        output: result.output,
        action,
        risk_level: action === 'remove' ? 'CRITICAL' : 'MODERATE'
      };
    }

    return {
      success: true,
      action,
      packages: packages || undefined,
      output: result.output,
      exit_code: result.exit_code,
      risk_level: action === 'remove' ? 'CRITICAL' : 'MODERATE'
    };
  }
};
