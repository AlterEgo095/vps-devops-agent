/**
 * Tool: compose_validate — Validate a docker-compose file
 * Risk: SAFE (read-only validation)
 */

import { executeCommand } from '../../agent-executor.js';

export default {
  name: 'compose_validate',
  description: 'Validate a docker-compose.yml file on the remote server. Checks syntax and configuration without starting any services.',
  parameters: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Path to the docker-compose.yml file or directory containing it'
      },
      file: {
        type: 'string',
        description: 'Specific compose file name if not docker-compose.yml (e.g. "docker-compose.prod.yml")'
      }
    },
    required: ['path']
  },
  risk_level: 'SAFE',
  needs_approval: false,
  category: 'docker',

  async implementation(serverConfig, args) {
    const { path, file } = args;

    if (!path) {
      return { success: false, error: 'path is required' };
    }

    const sanitizedPath = path.replace(/[;&|`$()]/g, '');
    let command = 'docker compose';

    if (file) {
      const sanitizedFile = file.replace(/[;&|`$()]/g, '');
      command += ` -f "${sanitizedPath}/${sanitizedFile}"`;
    } else {
      command += ` -f "${sanitizedPath}/docker-compose.yml"`;
    }

    // Try docker compose plugin first, then docker-compose standalone
    command += ' config --quiet 2>&1';

    let result = await executeCommand(serverConfig, command);

    if (!result.success && result.output?.includes('not found')) {
      // Fallback to docker-compose standalone
      let fallbackCmd = `docker-compose`;
      if (file) {
        const sanitizedFile = file.replace(/[;&|`$()]/g, '');
        fallbackCmd += ` -f "${sanitizedPath}/${sanitizedFile}"`;
      } else {
        fallbackCmd += ` -f "${sanitizedPath}/docker-compose.yml"`;
      }
      fallbackCmd += ' config --quiet 2>&1';
      result = await executeCommand(serverConfig, fallbackCmd);
    }

    // Get the config output for details
    let configOutput = null;
    if (result.success) {
      let configCmd = `docker compose -f "${sanitizedPath}/docker-compose.yml" config 2>&1`;
      const configResult = await executeCommand(serverConfig, configCmd);
      if (configResult.success) {
        configOutput = configResult.output?.substring(0, 5000);
      }
    }

    return {
      success: result.success,
      message: result.success ? 'Docker Compose file is valid' : 'Docker Compose file has errors',
      path: sanitizedPath,
      errors: result.success ? undefined : result.output,
      config: configOutput
    };
  }
};
