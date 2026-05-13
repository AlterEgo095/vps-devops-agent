/**
 * Tool: cron_list — List crontab entries
 * Risk: SAFE (read-only)
 */

import { executeCommand } from '../../agent-executor.js';

export default {
  name: 'cron_list',
  description: 'List crontab entries for a specified user on the remote server. Returns all scheduled cron jobs with their schedule expressions and commands.',
  parameters: {
    type: 'object',
    properties: {
      user: {
        type: 'string',
        description: 'System user whose crontab to list',
        default: 'root'
      }
    },
    required: []
  },
  risk_level: 'SAFE',
  needs_approval: false,
  category: 'system',

  async implementation(serverConfig, args) {
    const { user = 'root' } = args;

    // Validate username
    const validUserPattern = /^[a-z_][a-z0-9_\-]*$/i;
    if (!validUserPattern.test(user)) {
      return {
        success: false,
        error: `Invalid username: ${user}`
      };
    }

    // Get user's crontab
    const crontabResult = await executeCommand(
      serverConfig,
      `crontab -u ${user} -l 2>&1`
    );

    if (!crontabResult.success) {
      const output = crontabResult.output || crontabResult.error || '';
      if (output.includes('no crontab')) {
        return {
          success: true,
          user,
          entries: [],
          count: 0,
          message: `No crontab found for user "${user}"`
        };
      }
      return {
        success: false,
        error: `Failed to list crontab for user "${user}": ${output}`,
        exit_code: crontabResult.exit_code
      };
    }

    // Also check system-wide cron directories
    const systemCronResult = await executeCommand(
      serverConfig,
      `ls -la /etc/cron.d/ 2>/dev/null; echo "---"; cat /etc/cron.d/* 2>/dev/null || true`
    );

    // Parse crontab entries (filter out comments and blank lines)
    const lines = crontabResult.output.split('\n');
    const entries = [];
    let lineNumber = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line && !line.startsWith('#')) {
        lineNumber++;
        entries.push({
          line_number: i + 1,
          entry: line
        });
      }
    }

    return {
      success: true,
      user,
      entries,
      count: entries.length,
      raw_output: crontabResult.output,
      system_cron_available: systemCronResult.success
    };
  }
};
