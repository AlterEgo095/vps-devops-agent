/**
 * Tool: git_ops — Git operations on remote server
 * Risk: SAFE (status/log/diff) or MODERATE (checkout/pull)
 */

import { executeCommand } from '../../agent-executor.js';

export default {
  name: 'git_ops',
  description: 'Perform git operations on a repository on the remote server. Supports status, log, diff, pull, checkout, and branch listing. checkout and pull modify the working directory.',
  parameters: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        description: 'Git action to perform',
        enum: ['status', 'log', 'diff', 'pull', 'checkout', 'branch', 'stash', 'fetch']
      },
      repo_path: {
        type: 'string',
        description: 'Path to the git repository on the server',
        default: '/opt/agent-projects'
      },
      branch: {
        type: 'string',
        description: 'Branch name (for checkout/branch actions)',
        default: null
      },
      count: {
        type: 'number',
        description: 'Number of log entries to return',
        default: 10
      }
    },
    required: ['action']
  },
  risk_level: 'MODERATE',
  needs_approval: false,
  category: 'git',

  async implementation(serverConfig, args) {
    const { action, repo_path = '/opt/agent-projects', branch, count = 10 } = args;

    // Validate repo_path
    const safePath = repo_path.replace(/[^a-zA-Z0-9\/.\-_]/g, '');

    let command;
    switch (action) {
      case 'status':
        command = `cd "${safePath}" && git status --porcelain 2>&1`;
        break;
      case 'log':
        command = `cd "${safePath}" && git log --oneline -${count} 2>&1`;
        break;
      case 'diff':
        command = `cd "${safePath}" && git diff --stat 2>&1`;
        break;
      case 'pull':
        command = `cd "${safePath}" && git pull 2>&1`;
        break;
      case 'checkout':
        if (!branch) return { success: false, error: 'Branch name required for checkout' };
        command = `cd "${safePath}" && git checkout "${branch}" 2>&1`;
        break;
      case 'branch':
        command = `cd "${safePath}" && git branch -a 2>&1`;
        break;
      case 'stash':
        command = `cd "${safePath}" && git stash 2>&1`;
        break;
      case 'fetch':
        command = `cd "${safePath}" && git fetch --all 2>&1`;
        break;
      default:
        return { success: false, error: `Unknown git action: ${action}` };
    }

    const result = await executeCommand(serverConfig, command);

    return {
      success: result.success,
      action,
      repo_path: safePath,
      output: result.output,
      error: result.error,
      exit_code: result.exit_code
    };
  }
};
