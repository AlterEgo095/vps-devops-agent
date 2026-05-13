/**
 * Tool: shell_exec — Execute a shell command via SSH
 * Risk: MODERATE (subject to CommandGuard)
 */

import { executeCommand } from '../../agent-executor.js';
import { validateCommand } from '../../command-guard.js';

export default {
  name: 'shell_exec',
  description: 'Execute a shell command on the remote server. Subject to command security validation. Use specific tools (docker_ps, service_status, etc.) when available for better safety and structured output.',
  parameters: {
    type: 'object',
    properties: {
      command: {
        type: 'string',
        description: 'The shell command to execute'
      },
      timeout: {
        type: 'number',
        description: 'Execution timeout in milliseconds',
        default: 30000
      },
      working_dir: {
        type: 'string',
        description: 'Working directory for command execution',
        default: '/root'
      }
    },
    required: ['command']
  },
  risk_level: 'MODERATE',
  needs_approval: false,
  category: 'system',

  async implementation(serverConfig, args, context) {
    // CommandGuard is already checked by ToolExecutor before this
    // Double-check for safety
    const guardResult = validateCommand(args.command, {
      allowGraylist: context.allowGraylist || false,
      userId: context.userId || 'unknown'
    });

    if (!guardResult.allowed) {
      return {
        success: false,
        error: guardResult.reason,
        level: guardResult.level,
        blocked: true
      };
    }

    // Prepend cd if working_dir specified
    const command = args.working_dir && args.working_dir !== '/root'
      ? `cd ${args.working_dir} && ${args.command}`
      : args.command;

    const result = await executeCommand(serverConfig, command);

    return {
      success: result.success,
      exit_code: result.exit_code,
      output: result.output,
      error: result.error,
      duration_ms: result.duration_ms
    };
  }
};
