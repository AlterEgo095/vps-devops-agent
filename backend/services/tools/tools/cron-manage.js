/**
 * Tool: cron_manage — Add or remove crontab entries
 * Risk: CRITICAL (modifies scheduled tasks)
 */

import { executeCommand } from '../../agent-executor.js';

export default {
  name: 'cron_manage',
  description: 'Add or remove crontab entries on the remote server. For adding: specify schedule (cron expression) and command. For removing: specify the line number from cron_list output. Requires approval.',
  parameters: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        description: 'Action to perform',
        enum: ['add', 'remove']
      },
      schedule: {
        type: 'string',
        description: 'Cron schedule expression (e.g., "0 2 * * *" for daily at 2am). Required for add action.'
      },
      command: {
        type: 'string',
        description: 'Command to execute. Required for add action.'
      },
      user: {
        type: 'string',
        description: 'System user whose crontab to modify',
        default: 'root'
      },
      line_number: {
        type: 'number',
        description: 'Line number to remove (from cron_list output). Required for remove action.'
      }
    },
    required: ['action']
  },
  risk_level: 'CRITICAL',
  needs_approval: true,
  category: 'system',

  async implementation(serverConfig, args) {
    const { action, schedule, command, user = 'root', line_number } = args;

    // Validate username
    const validUserPattern = /^[a-z_][a-z0-9_\-]*$/i;
    if (!validUserPattern.test(user)) {
      return {
        success: false,
        error: `Invalid username: ${user}`
      };
    }

    if (action === 'add') {
      // Validate required fields for add
      if (!schedule) {
        return { success: false, error: 'schedule is required for add action' };
      }
      if (!command) {
        return { success: false, error: 'command is required for add action' };
      }

      // Basic cron expression validation (5 fields + command)
      const cronParts = schedule.trim().split(/\s+/);
      if (cronParts.length !== 5) {
        return {
          success: false,
          error: `Invalid cron schedule: "${schedule}". Must have exactly 5 fields (minute hour day month weekday).`
        };
      }

      // Build the cron entry
      const cronEntry = `${schedule} ${command}`;

      // Add entry to crontab
      // First get existing crontab, then append new entry
      const result = await executeCommand(
        serverConfig,
        `(crontab -u ${user} -l 2>/dev/null; echo "${cronEntry}") | crontab -u ${user} - 2>&1`
      );

      if (!result.success) {
        return {
          success: false,
          error: result.error || `Failed to add crontab entry for user "${user}"`,
          exit_code: result.exit_code
        };
      }

      return {
        success: true,
        message: 'Crontab entry added successfully',
        action: 'add',
        user,
        entry: cronEntry,
        schedule,
        command
      };

    } else if (action === 'remove') {
      // Validate required fields for remove
      if (line_number === undefined || line_number === null) {
        return { success: false, error: 'line_number is required for remove action' };
      }

      if (!Number.isInteger(line_number) || line_number < 1) {
        return { success: false, error: 'line_number must be a positive integer' };
      }

      // Get current crontab, remove the specified line, and update
      const result = await executeCommand(
        serverConfig,
        `crontab -u ${user} -l 2>/dev/null | sed '${line_number}d' | crontab -u ${user} - 2>&1`
      );

      if (!result.success) {
        return {
          success: false,
          error: result.error || `Failed to remove crontab entry at line ${line_number}`,
          exit_code: result.exit_code
        };
      }

      return {
        success: true,
        message: `Crontab entry at line ${line_number} removed successfully`,
        action: 'remove',
        user,
        line_number
      };

    } else {
      return {
        success: false,
        error: `Invalid action: ${action}. Must be "add" or "remove".`
      };
    }
  }
};
