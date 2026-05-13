/**
 * Tool: docker_compose — Run docker compose commands
 * Risk: MODERATE (container management)
 */

import { executeCommand } from '../../agent-executor.js';

export default {
  name: 'docker_compose',
  description: 'Execute docker compose commands on the remote server. Supports up, down, restart, pull, build, and ps operations. Must specify the project directory path.',
  parameters: {
    type: 'object',
    properties: {
      project_path: {
        type: 'string',
        description: 'Absolute path to the directory containing docker-compose.yml'
      },
      command: {
        type: 'string',
        description: 'Docker compose command to execute',
        enum: ['up', 'down', 'restart', 'pull', 'build', 'ps']
      }
    },
    required: ['project_path', 'command']
  },
  risk_level: 'MODERATE',
  needs_approval: false,
  category: 'docker',

  async implementation(serverConfig, args) {
    const { project_path, command } = args;

    if (!project_path || !project_path.startsWith('/')) {
      return {
        success: false,
        error: 'project_path must be an absolute path starting with /'
      };
    }

    const validCommands = ['up', 'down', 'restart', 'pull', 'build', 'ps'];
    if (!validCommands.includes(command)) {
      return {
        success: false,
        error: `Invalid command: ${command}. Must be one of: ${validCommands.join(', ')}`
      };
    }

    // Verify the directory exists and has a compose file
    const checkResult = await executeCommand(
      serverConfig,
      `ls "${project_path}"/docker-compose.yml "${project_path}"/docker-compose.yaml "${project_path}"/compose.yml "${project_path}"/compose.yaml 2>&1 | head -1`
    );

    if (!checkResult.success) {
      return {
        success: false,
        error: `No docker compose file found in ${project_path}`
      };
    }

    // Build the docker compose command
    let composeCmd;
    switch (command) {
      case 'up':
        composeCmd = `cd "${project_path}" && docker compose up -d 2>&1`;
        break;
      case 'down':
        composeCmd = `cd "${project_path}" && docker compose down 2>&1`;
        break;
      case 'restart':
        composeCmd = `cd "${project_path}" && docker compose restart 2>&1`;
        break;
      case 'pull':
        composeCmd = `cd "${project_path}" && docker compose pull 2>&1`;
        break;
      case 'build':
        composeCmd = `cd "${project_path}" && docker compose build 2>&1`;
        break;
      case 'ps':
        composeCmd = `cd "${project_path}" && docker compose ps 2>&1`;
        break;
      default:
        return { success: false, error: `Unhandled command: ${command}` };
    }

    const result = await executeCommand(serverConfig, composeCmd);

    if (!result.success) {
      return {
        success: false,
        error: result.error || `Failed to execute docker compose ${command}`,
        exit_code: result.exit_code,
        output: result.output
      };
    }

    return {
      success: true,
      command: `docker compose ${command}`,
      project_path,
      output: result.output,
      exit_code: result.exit_code
    };
  }
};
