/**
 * Tool: docker_exec — Execute a command inside a running Docker container
 * Risk: MODERATE (executes command inside container)
 */

import { executeCommand } from '../../agent-executor.js';

export default {
  name: 'docker_exec',
  description: 'Execute a command inside a running Docker container on the remote server. Useful for debugging, running migrations, inspecting files inside containers.',
  parameters: {
    type: 'object',
    properties: {
      container: {
        type: 'string',
        description: 'Container name or ID to execute the command in'
      },
      command: {
        type: 'string',
        description: 'Command to execute inside the container'
      },
      user: {
        type: 'string',
        description: 'User to run the command as (e.g. "root", "www-data"). Default: container default user'
      },
      workdir: {
        type: 'string',
        description: 'Working directory inside the container for command execution'
      },
      interactive: {
        type: 'boolean',
        description: 'Allocate a pseudo-TTY. Default: false',
        default: false
      }
    },
    required: ['container', 'command']
  },
  risk_level: 'MODERATE',
  needs_approval: false,
  category: 'docker',

  async implementation(serverConfig, args) {
    const { container, command, user, workdir, interactive } = args;

    if (!container || !command) {
      return { success: false, error: 'container and command are required' };
    }

    // Sanitize container name
    const sanitizedContainer = container.replace(/[;&|`$()]/g, '');
    const sanitizedCommand = command.replace(/[;&|`]/g, '');

    let dockerCmd = 'docker exec';

    if (interactive) {
      dockerCmd += ' -it';
    }

    if (user) {
      const sanitizedUser = user.replace(/[;&|`$()]/g, '');
      dockerCmd += ` --user "${sanitizedUser}"`;
    }

    if (workdir) {
      const sanitizedWorkdir = workdir.replace(/[;&|`$()]/g, '');
      dockerCmd += ` --workdir "${sanitizedWorkdir}"`;
    }

    dockerCmd += ` ${sanitizedContainer} bash -c ${JSON.stringify(sanitizedCommand)} 2>&1`;

    const result = await executeCommand(serverConfig, dockerCmd);

    if (!result.success) {
      return {
        success: false,
        error: result.error || `Failed to execute command in container: ${sanitizedContainer}`,
        exit_code: result.exit_code,
        output: result.output
      };
    }

    return {
      success: true,
      message: `Command executed in container "${sanitizedContainer}"`,
      container: sanitizedContainer,
      output: result.output
    };
  }
};
