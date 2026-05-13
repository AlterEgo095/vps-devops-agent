/**
 * Tool: docker_build — Build a Docker image on the remote server
 * Risk: MODERATE (creates a new image, uses disk space)
 */

import { executeCommand } from '../../agent-executor.js';

export default {
  name: 'docker_build',
  description: 'Build a Docker image from a Dockerfile on the remote server. Supports build arguments, tags, and custom Dockerfile paths.',
  parameters: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Path to the directory containing the Dockerfile (build context)'
      },
      tag: {
        type: 'string',
        description: 'Name and tag for the built image (e.g. "myapp:latest")'
      },
      dockerfile: {
        type: 'string',
        description: 'Path to Dockerfile if not in the build context root (default: Dockerfile)'
      },
      build_args: {
        type: 'string',
        description: 'Build arguments as KEY=VALUE pairs separated by spaces (e.g. "NODE_ENV=production VERSION=1.0")'
      },
      no_cache: {
        type: 'boolean',
        description: 'Build without using cache. Default: false',
        default: false
      }
    },
    required: ['path']
  },
  risk_level: 'MODERATE',
  needs_approval: false,
  category: 'docker',

  async implementation(serverConfig, args) {
    const { path, tag, dockerfile, build_args, no_cache } = args;

    if (!path) {
      return { success: false, error: 'path is required' };
    }

    // Sanitize path
    const sanitizedPath = path.replace(/[;&|`$()]/g, '');

    let command = 'docker build';

    // Add tag
    if (tag) {
      const sanitizedTag = tag.replace(/[;&|`$()]/g, '');
      command += ` -t "${sanitizedTag}"`;
    }

    // Add custom Dockerfile path
    if (dockerfile) {
      const sanitizedDockerfile = dockerfile.replace(/[;&|`$()]/g, '');
      command += ` -f "${sanitizedDockerfile}"`;
    }

    // Add build arguments
    if (build_args) {
      const argPairs = build_args.split(/\s+/).filter(pair => /^[A-Za-z_][A-Za-z0-9_]*=.+$/.test(pair));
      for (const pair of argPairs) {
        command += ` --build-arg ${pair}`;
      }
    }

    // No cache
    if (no_cache) {
      command += ' --no-cache';
    }

    command += ` "${sanitizedPath}" 2>&1`;

    const result = await executeCommand(serverConfig, command, { timeout: 300000 }); // 5 min timeout for builds

    if (!result.success) {
      return {
        success: false,
        error: result.error || 'Failed to build Docker image',
        exit_code: result.exit_code,
        output: result.output
      };
    }

    return {
      success: true,
      message: `Docker image built successfully from ${sanitizedPath}`,
      tag: tag || 'unnamed',
      output: result.output
    };
  }
};
