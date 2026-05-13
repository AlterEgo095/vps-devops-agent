/**
 * Tool: docker_logs_tail — Tail/follow Docker container logs
 * Risk: SAFE (read-only monitoring)
 */

import { executeCommand } from '../../agent-executor.js';

export default {
  name: 'docker_logs_tail',
  description: 'Get recent Docker container logs on the remote server with filtering options. Can filter by time range, show only specific number of lines, or follow live logs.',
  parameters: {
    type: 'object',
    properties: {
      container: {
        type: 'string',
        description: 'Container name or ID'
      },
      tail: {
        type: 'number',
        description: 'Number of recent lines to show. Default: 100',
        default: 100
      },
      since: {
        type: 'string',
        description: 'Show logs since timestamp (e.g. "2024-01-01", "1h30m", "30m")'
      },
      until: {
        type: 'string',
        description: 'Show logs until timestamp'
      },
      timestamps: {
        type: 'boolean',
        description: 'Show timestamps. Default: true',
        default: true
      }
    },
    required: ['container']
  },
  risk_level: 'SAFE',
  needs_approval: false,
  category: 'docker',

  async implementation(serverConfig, args) {
    const { container, tail, since, until, timestamps } = args;

    if (!container) {
      return { success: false, error: 'container is required' };
    }

    const sanitizedContainer = container.replace(/[;&|`$()]/g, '');
    let command = `docker logs`;

    if (tail) {
      command += ` --tail ${Math.min(Math.max(tail, 1), 5000)}`;
    }

    if (since) {
      const sanitizedSince = since.replace(/[;&|`$()]/g, '');
      command += ` --since "${sanitizedSince}"`;
    }

    if (until) {
      const sanitizedUntil = until.replace(/[;&|`$()]/g, '');
      command += ` --until "${sanitizedUntil}"`;
    }

    if (timestamps !== false) {
      command += ' --timestamps';
    }

    command += ` ${sanitizedContainer} 2>&1`;

    const result = await executeCommand(serverConfig, command, { timeout: 30000 });

    if (!result.success) {
      return {
        success: false,
        error: result.error || `Failed to get logs for container: ${sanitizedContainer}`,
        exit_code: result.exit_code
      };
    }

    return {
      success: true,
      container: sanitizedContainer,
      output: result.output
    };
  }
};
