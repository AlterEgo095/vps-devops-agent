/**
 * Tool: user_manage — Create/delete/list system users
 * Risk: CRITICAL (modifies system users)
 */

import { executeCommand } from '../../agent-executor.js';

export default {
  name: 'user_manage',
  description: 'Create, delete, or list system users on the remote server. Create supports specifying shell and groups. Delete removes the user account. Requires approval for create and delete actions.',
  parameters: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        description: 'Action to perform',
        enum: ['create', 'delete', 'list']
      },
      username: {
        type: 'string',
        description: 'Username for create/delete operations'
      },
      shell: {
        type: 'string',
        description: 'Login shell for the new user',
        default: '/bin/bash'
      },
      groups: {
        type: 'string',
        description: 'Comma-separated list of groups to add the user to (e.g., "docker,sudo,www-data")'
      }
    },
    required: ['action']
  },
  risk_level: 'CRITICAL',
  needs_approval: true,
  category: 'system',

  async implementation(serverConfig, args) {
    const { action, username, shell = '/bin/bash', groups } = args;

    if (action === 'list') {
      // List all users with UID >= 1000 (regular users) plus some system users
      const result = await executeCommand(
        serverConfig,
        'awk -F: \'$3 >= 1000 || $1 == "root" {printf "%-20s UID:%-6s Shell:%s\\n", $1, $3, $7}\' /etc/passwd 2>&1'
      );

      if (!result.success) {
        return {
          success: false,
          error: result.error || 'Failed to list users'
        };
      }

      // Also get who's currently logged in
      const whoResult = await executeCommand(serverConfig, 'who 2>&1 || true');

      return {
        success: true,
        action: 'list',
        users: result.output,
        logged_in: whoResult.success ? whoResult.output : undefined
      };

    } else if (action === 'create') {
      if (!username) {
        return { success: false, error: 'username is required for create action' };
      }

      // Validate username
      const validUsernamePattern = /^[a-z_][a-z0-9_\-]*$/;
      if (!validUsernamePattern.test(username)) {
        return {
          success: false,
          error: `Invalid username: "${username}". Use lowercase letters, numbers, underscores, and hyphens.`
        };
      }

      // Validate shell path
      const validShellPattern = /^\/[a-zA-Z0-9_\-\/]+$/;
      if (!validShellPattern.test(shell)) {
        return {
          success: false,
          error: `Invalid shell path: "${shell}"`
        };
      }

      // Build useradd command
      let cmd = `useradd -m -s ${shell}`;

      if (groups) {
        // Validate groups format
        const groupList = groups.split(',').map(g => g.trim());
        const validGroupPattern = /^[a-z_][a-z0-9_\-]*$/;
        for (const group of groupList) {
          if (!validGroupPattern.test(group)) {
            return {
              success: false,
              error: `Invalid group name: "${group}"`
            };
          }
        }
        cmd += ` -G ${groupList.join(',')}`;
      }

      cmd += ` ${username} 2>&1`;

      const result = await executeCommand(serverConfig, cmd);

      if (!result.success) {
        if (result.output?.includes('already exists')) {
          return {
            success: false,
            error: `User "${username}" already exists`,
            exit_code: result.exit_code
          };
        }
        return {
          success: false,
          error: result.error || `Failed to create user "${username}"`,
          exit_code: result.exit_code,
          output: result.output
        };
      }

      return {
        success: true,
        message: `User "${username}" created successfully`,
        action: 'create',
        username,
        shell,
        groups: groups || 'default'
      };

    } else if (action === 'delete') {
      if (!username) {
        return { success: false, error: 'username is required for delete action' };
      }

      // Prevent deleting critical users
      const protectedUsers = ['root', 'admin', 'ubuntu', 'ec2-user', 'centos', 'debian'];
      if (protectedUsers.includes(username)) {
        return {
          success: false,
          error: `Cannot delete protected user: "${username}"`
        };
      }

      const result = await executeCommand(
        serverConfig,
        `userdel -r ${username} 2>&1`
      );

      if (!result.success) {
        if (result.output?.includes('does not exist')) {
          return {
            success: false,
            error: `User "${username}" does not exist`,
            exit_code: result.exit_code
          };
        }
        return {
          success: false,
          error: result.error || `Failed to delete user "${username}"`,
          exit_code: result.exit_code,
          output: result.output
        };
      }

      return {
        success: true,
        message: `User "${username}" deleted successfully`,
        action: 'delete',
        username
      };

    } else {
      return {
        success: false,
        error: `Invalid action: ${action}. Must be "create", "delete", or "list".`
      };
    }
  }
};
