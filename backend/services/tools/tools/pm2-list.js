/**
 * Tool: pm2_list — List PM2 processes
 * Risk: SAFE (read-only)
 */

import { executeCommand } from '../../agent-executor.js';

export default {
  name: 'pm2_list',
  description: 'List all PM2 managed processes on the remote server. Returns process name, status, CPU, memory, uptime, and restart count.',
  parameters: {
    type: 'object',
    properties: {}
  },
  risk_level: 'SAFE',
  needs_approval: false,
  category: 'system',

  async implementation(serverConfig, args) {
    // Get structured output via jlist
    const jsonResult = await executeCommand(serverConfig, 'pm2 jlist 2>/dev/null || pm2 list --no-color');

    if (!jsonResult.success) {
      return {
        success: false,
        error: jsonResult.error || 'Failed to list PM2 processes',
        exit_code: jsonResult.exit_code
      };
    }

    let processes = [];
    try {
      const parsed = JSON.parse(jsonResult.output);
      processes = parsed.map(p => ({
        name: p.name,
        pm_id: p.pm_id,
        status: p.pm2_env?.status,
        cpu: p.monit?.cpu,
        memory: p.monit?.memory,
        uptime: p.pm2_env?.pm_uptime,
        restarts: p.pm2_env?.restart_time,
        script: p.pm2_env?.pm_exec_path,
        interpreter: p.pm2_env?.exec_interpreter
      }));
    } catch {
      // Fallback to plain text
      const textResult = await executeCommand(serverConfig, 'pm2 list --no-color');
      return {
        success: true,
        raw_output: textResult.output,
        processes: [],
        count: 0
      };
    }

    return {
      success: true,
      processes,
      count: processes.length,
      running: processes.filter(p => p.status === 'online').length,
      stopped: processes.filter(p => p.status !== 'online').length
    };
  }
};
