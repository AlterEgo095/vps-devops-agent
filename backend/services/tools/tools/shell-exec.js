/**
 * Tool: shell_exec — Execute a raw shell command via SSH
 * Risk: CRITICAL (requires human approval — use specific tools instead!)
 * 
 * IMPORTANT: This tool is a LAST RESORT. Always prefer specific tools:
 * - docker_ps, docker_logs, docker_container_manage, docker_compose for Docker
 * - service_status, systemctl, service_manage for services
 * - nginx_config_read, nginx_config_write, nginx_reload, nginx_test for Nginx
 * - pm2_list, pm2_restart, pm2_logs for PM2
 * - file_read, file_write, file_manage for files
 * - env_read, env_write for environment variables
 * - disk_usage, memory_info, network_info, process_list for monitoring
 * - firewall_status, firewall_manage, ssl_cert_check for security
 * - cron_list, cron_manage for cron jobs
 * - rag_query for infrastructure context
 * 
 * Using shell_exec requires human approval because raw commands
 * bypass the structured safety checks of specific tools.
 */

import { executeCommand } from '../../agent-executor.js';
import { validateCommand } from '../../command-guard.js';

export default {
  name: 'shell_exec',
  description: 'LAST RESORT: Execute a raw shell command on the remote server. REQUIRES HUMAN APPROVAL. Always prefer specific tools (docker_ps, service_status, nginx_config_write, etc.) over this tool. This tool bypasses structured safety checks and should only be used when no specific tool covers the needed operation. Subject to CommandGuard validation.',
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
  risk_level: 'CRITICAL',
  needs_approval: true,
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
