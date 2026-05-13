/**
 * Tool: system_update — Update system packages (apt update + upgrade)
 * Risk: CRITICAL (modifies system packages, can break services)
 */

import { executeCommand } from '../../agent-executor.js';

export default {
  name: 'system_update',
  description: 'Update system packages on the remote server. Runs apt update and optionally apt upgrade. This is a potentially disruptive operation that can restart services.',
  parameters: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: ['update', 'upgrade', 'full-upgrade', 'dist-upgrade'],
        description: 'Type of update: "update" (refresh package lists), "upgrade" (install updates), "full-upgrade" (upgrade with removals), "dist-upgrade" (distribution upgrade). Default: "update"',
        default: 'update'
      },
      yes: {
        type: 'boolean',
        description: 'Auto-confirm prompts (-y flag). Default: true',
        default: true
      },
      security_only: {
        type: 'boolean',
        description: 'Only apply security updates (Ubuntu only). Default: false',
        default: false
      }
    },
    required: []
  },
  risk_level: 'CRITICAL',
  needs_approval: true,
  category: 'system',

  async implementation(serverConfig, args) {
    const { action = 'update', yes = true, security_only = false } = args;

    const yFlag = yes ? ' -y' : '';
    let command;

    if (security_only && action !== 'update') {
      // Ubuntu unattended-upgrades for security only
      command = `unattended-upgrade -v 2>&1 || apt upgrade${yFlag} 2>&1`;
    } else {
      switch (action) {
        case 'update':
          command = `apt update${yFlag} 2>&1`;
          break;
        case 'upgrade':
          command = `apt update${yFlag} && apt upgrade${yFlag} 2>&1`;
          break;
        case 'full-upgrade':
          command = `apt update${yFlag} && apt full-upgrade${yFlag} 2>&1`;
          break;
        case 'dist-upgrade':
          command = `apt update${yFlag} && apt dist-upgrade${yFlag} 2>&1`;
          break;
        default:
          command = `apt update${yFlag} 2>&1`;
      }
    }

    const result = await executeCommand(serverConfig, command, { timeout: 600000 }); // 10 min timeout

    if (!result.success) {
      return {
        success: false,
        error: result.error || 'System update failed',
        exit_code: result.exit_code,
        output: result.output
      };
    }

    return {
      success: true,
      message: `System ${action} completed successfully`,
      action,
      output: result.output
    };
  }
};
