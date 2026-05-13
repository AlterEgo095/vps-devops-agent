/**
 * Tool: docker_ps — List Docker containers
 * Risk: SAFE (read-only)
 */

import { executeCommand } from '../../agent-executor.js';

export default {
  name: 'docker_ps',
  description: 'List Docker containers on the remote server. Returns container ID, name, image, status, and ports. Supports filtering by name or status.',
  parameters: {
    type: 'object',
    properties: {
      all: {
        type: 'boolean',
        description: 'Show all containers (including stopped)',
        default: false
      },
      filter: {
        type: 'string',
        description: 'Filter containers by name or status (e.g., "running", "name=web")',
        default: ''
      },
      format: {
        type: 'string',
        description: 'Output format. "table" for human-readable, "json" for structured data',
        default: 'json'
      }
    },
    required: []
  },
  risk_level: 'SAFE',
  needs_approval: false,
  category: 'docker',

  async implementation(serverConfig, args) {
    const { all = false, filter = '', format = 'json' } = args;

    let command = 'docker ps';
    if (all) command += ' -a';
    if (filter) command += ` --filter "${filter}"`;

    // Use JSON format for structured output
    if (format === 'json') {
      command += ' --format \'{{json .}}\'';
    }

    const result = await executeCommand(serverConfig, command);

    if (!result.success) {
      return {
        success: false,
        error: result.error || 'Failed to list Docker containers',
        exit_code: result.exit_code
      };
    }

    // Parse JSON output
    let containers = [];
    if (format === 'json' && result.output.trim()) {
      try {
        containers = result.output.trim().split('\n')
          .filter(line => line.trim())
          .map(line => {
            try {
              const c = JSON.parse(line);
              return {
                id: c.ID || c.Id,
                name: c.Names || c.Name,
                image: c.Image,
                status: c.Status,
                state: c.State,
                ports: c.Ports || ''
              };
            } catch {
              return { raw: line };
            }
          });
      } catch {
        containers = [{ raw: result.output }];
      }
    }

    return {
      success: true,
      containers,
      count: containers.length,
      raw_output: format === 'table' ? result.output : undefined
    };
  }
};
