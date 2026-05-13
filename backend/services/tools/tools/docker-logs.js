/**
 * Tool: docker_logs — Get container logs
 * Risk: SAFE (read-only)
 */

import { executeCommand } from '../../agent-executor.js';

export default {
  name: 'docker_logs',
  description: 'Get logs from a Docker container on the remote server. Supports tail, since, and timestamps options.',
  parameters: {
    type: 'object',
    properties: {
      container: {
        type: 'string',
        description: 'Container name or ID'
      },
      tail: {
        type: 'number',
        description: 'Number of lines to show from the end of logs',
        default: 100
      },
      since: {
        type: 'string',
        description: 'Show logs since timestamp (e.g., "2024-01-01") or relative (e.g., "1h", "30m")',
        default: null
      },
      timestamps: {
        type: 'boolean',
        description: 'Show timestamps in log output',
        default: true
      }
    },
    required: ['container']
  },
  risk_level: 'SAFE',
  needs_approval: false,
  category: 'docker',

  async implementation(serverConfig, args) {
    const { container, tail = 100, since, timestamps = true } = args;

    let command = `docker logs "${container}" --tail ${tail}`;
    if (timestamps) command += ' --timestamps';
    if (since) command += ` --since "${since}"`;

    const result = await executeCommand(serverConfig, command);

    if (!result.success) {
      return {
        success: false,
        error: result.error || `Failed to get logs for container: ${container}`,
        exit_code: result.exit_code
      };
    }

    return {
      success: true,
      container,
      logs: result.output,
      lines_returned: result.output.split('\n').filter(l => l.trim()).length,
      stderr: result.error || null
    };
  }
};
