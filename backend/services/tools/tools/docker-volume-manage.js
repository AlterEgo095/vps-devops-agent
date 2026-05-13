/**
 * Tool: docker_volume_manage — Manage Docker volumes
 * Risk: MODERATE (volume lifecycle management)
 */

import { executeCommand } from '../../agent-executor.js';

export default {
  name: 'docker_volume_manage',
  description: 'Manage Docker volumes on the remote server. Supports listing volumes, creating new volumes with optional drivers, removing volumes, and inspecting volume details. Use this tool to manage persistent data storage for Docker containers. List and inspect are safe read-only operations; create is low risk; remove is moderate risk as it permanently deletes data and may affect containers using the volume.',
  parameters: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        description: 'Action to perform on Docker volumes',
        enum: ['list', 'create', 'remove', 'inspect']
      },
      volume_name: {
        type: 'string',
        description: 'Name of the Docker volume. Required for create, remove, and inspect actions.'
      },
      driver: {
        type: 'string',
        description: 'Volume driver to use when creating a volume (e.g., "local", "nfs", "tmpfs"). Defaults to "local".',
        default: 'local'
      }
    },
    required: ['action']
  },
  risk_level: 'MODERATE',
  needs_approval: false,
  category: 'docker',

  async implementation(serverConfig, args, context) {
    const { action, volume_name, driver = 'local' } = args;

    // Validate action
    const validActions = ['list', 'create', 'remove', 'inspect'];
    if (!validActions.includes(action)) {
      return {
        success: false,
        error: `Invalid action: ${action}. Must be one of: ${validActions.join(', ')}`
      };
    }

    // Validate volume_name for actions that require it
    const actionsRequiringVolume = ['create', 'remove', 'inspect'];
    if (actionsRequiringVolume.includes(action) && !volume_name) {
      return {
        success: false,
        error: `Action "${action}" requires a volume_name parameter`
      };
    }

    // Validate volume_name format
    if (volume_name) {
      const validNamePattern = /^[a-zA-Z0-9][a-zA-Z0-9_.\-]*$/;
      if (!validNamePattern.test(volume_name)) {
        return {
          success: false,
          error: `Invalid volume name: ${volume_name}`
        };
      }
    }

    let command;

    switch (action) {
      case 'list': {
        command = 'docker volume ls --format \'{{json .}}\' 2>&1';
        break;
      }
      case 'create': {
        command = `docker volume create --driver "${driver}" "${volume_name}" 2>&1`;
        break;
      }
      case 'remove': {
        command = `docker volume rm "${volume_name}" 2>&1`;
        break;
      }
      case 'inspect': {
        command = `docker volume inspect "${volume_name}" 2>&1`;
        break;
      }
    }

    const result = await executeCommand(serverConfig, command);

    if (!result.success) {
      // Check for common errors
      if (result.output?.includes('not found') || result.output?.includes('No such volume')) {
        return {
          success: false,
          error: `Volume "${volume_name}" not found`,
          exit_code: result.exit_code
        };
      }
      if (result.output?.includes('in use') || result.output?.includes('volume is being used')) {
        return {
          success: false,
          error: `Volume "${volume_name}" is in use by one or more containers and cannot be removed. Stop and remove the containers first.`,
          exit_code: result.exit_code
        };
      }
      if (result.output?.includes('already exists')) {
        return {
          success: false,
          error: `Volume "${volume_name}" already exists`,
          exit_code: result.exit_code
        };
      }
      if (result.output?.includes('permission denied')) {
        return {
          success: false,
          error: 'Permission denied. Ensure the user has Docker access.',
          exit_code: result.exit_code
        };
      }
      return {
        success: false,
        error: result.error || `Failed to ${action} Docker volume`,
        exit_code: result.exit_code,
        output: result.output
      };
    }

    // Process results based on action
    switch (action) {
      case 'list': {
        let volumes = [];
        if (result.output.trim()) {
          try {
            volumes = result.output.trim().split('\n')
              .filter(line => line.trim())
              .map(line => {
                try {
                  const vol = JSON.parse(line);
                  return {
                    driver: vol.Driver,
                    name: vol.Name,
                    mountpoint: vol.Mountpoint
                  };
                } catch {
                  return { raw: line };
                }
              });
          } catch {
            volumes = [{ raw: result.output }];
          }
        }
        return {
          success: true,
          action: 'list',
          volumes,
          count: volumes.length
        };
      }

      case 'create':
        return {
          success: true,
          action: 'create',
          volume: volume_name,
          driver,
          message: `Volume "${volume_name}" created successfully with driver "${driver}"`,
          output: result.output
        };

      case 'remove':
        return {
          success: true,
          action: 'remove',
          volume: volume_name,
          message: `Volume "${volume_name}" removed successfully. Data has been permanently deleted.`,
          output: result.output
        };

      case 'inspect': {
        let volumeData = null;
        try {
          const parsed = JSON.parse(result.output);
          volumeData = Array.isArray(parsed) ? parsed[0] : parsed;
        } catch {
          volumeData = { raw: result.output };
        }
        return {
          success: true,
          action: 'inspect',
          volume: volume_name,
          data: volumeData
        };
      }
    }
  }
};
