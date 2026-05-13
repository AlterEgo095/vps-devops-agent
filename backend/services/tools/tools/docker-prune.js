/**
 * Tool: docker_prune — Remove unused Docker resources
 * Risk: CRITICAL (deletes Docker resources)
 */

import { executeCommand } from '../../agent-executor.js';

export default {
  name: 'docker_prune',
  description: 'Remove unused Docker data (stopped containers, dangling images, unused networks, build cache) on the remote server. Frees disk space. Requires human approval because it permanently removes resources.',
  parameters: {
    type: 'object',
    properties: {
      target: {
        type: 'string',
        enum: ['system', 'containers', 'images', 'volumes', 'networks', 'builder'],
        description: 'What to prune: "system" (all unused), "containers" (stopped), "images" (dangling), "volumes" (unused), "networks" (unused), "builder" (build cache). Default: "system"',
        default: 'system'
      },
      force: {
        type: 'boolean',
        description: 'Skip confirmation prompt (--force flag). Default: true',
        default: true
      },
      filter: {
        type: 'string',
        description: 'Filter criteria (e.g. "until=24h" for resources older than 24 hours)'
      }
    },
    required: []
  },
  risk_level: 'CRITICAL',
  needs_approval: true,
  category: 'docker',

  async implementation(serverConfig, args) {
    const { target = 'system', force = true, filter } = args;

    let command = 'docker';

    switch (target) {
      case 'system':
        command += ' system prune';
        break;
      case 'containers':
        command += ' container prune';
        break;
      case 'images':
        command += ' image prune';
        break;
      case 'volumes':
        command += ' volume prune';
        break;
      case 'networks':
        command += ' network prune';
        break;
      case 'builder':
        command += ' builder prune';
        break;
      default:
        command += ' system prune';
    }

    if (force) {
      command += ' --force';
    }

    if (filter) {
      const sanitizedFilter = filter.replace(/[;&|`$()]/g, '');
      command += ` --filter "${sanitizedFilter}"`;
    }

    // For system prune with volumes
    if (target === 'system' && args.volumes) {
      command += ' --volumes';
    }

    command += ' 2>&1';

    const result = await executeCommand(serverConfig, command, { timeout: 120000 });

    if (!result.success) {
      return {
        success: false,
        error: result.error || 'Docker prune failed',
        exit_code: result.exit_code,
        output: result.output
      };
    }

    // Get disk space freed
    const diskResult = await executeCommand(serverConfig, 'df -h / 2>/dev/null | tail -1');

    return {
      success: true,
      message: `Docker ${target} prune completed successfully`,
      target,
      output: result.output,
      disk_after: diskResult.success ? diskResult.output : undefined
    };
  }
};
