/**
 * Tool: docker_network_manage — Manage Docker networks
 * Risk: MODERATE (network lifecycle management)
 */

import { executeCommand } from '../../agent-executor.js';

export default {
  name: 'docker_network_manage',
  description: 'Manage Docker networks on the remote server. Supports listing networks, creating new networks with optional drivers (bridge, overlay, macvlan), removing networks, inspecting network details, and connecting/disconnecting containers to/from networks. Use this tool to manage container networking and isolation. List and inspect are safe read-only operations; create, connect, and disconnect are moderate risk; remove is moderate risk as it may disrupt container communication.',
  parameters: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        description: 'Action to perform on Docker networks',
        enum: ['list', 'create', 'remove', 'inspect', 'connect', 'disconnect']
      },
      network_name: {
        type: 'string',
        description: 'Name of the Docker network. Required for create, remove, inspect, connect, and disconnect actions.'
      },
      driver: {
        type: 'string',
        description: 'Network driver to use when creating a network (e.g., "bridge", "overlay", "macvlan", "host"). Defaults to "bridge".',
        default: 'bridge'
      },
      container: {
        type: 'string',
        description: 'Container name or ID to connect/disconnect from the network. Required for connect and disconnect actions.'
      },
      options: {
        type: 'string',
        description: 'Additional options for network creation (e.g., "subnet=172.20.0.0/16"). Passed as Docker network create options.'
      }
    },
    required: ['action']
  },
  risk_level: 'MODERATE',
  needs_approval: false,
  category: 'docker',

  async implementation(serverConfig, args, context) {
    const { action, network_name, driver = 'bridge', container, options } = args;

    // Validate action
    const validActions = ['list', 'create', 'remove', 'inspect', 'connect', 'disconnect'];
    if (!validActions.includes(action)) {
      return {
        success: false,
        error: `Invalid action: ${action}. Must be one of: ${validActions.join(', ')}`
      };
    }

    // Validate network_name for actions that require it
    const actionsRequiringNetwork = ['create', 'remove', 'inspect', 'connect', 'disconnect'];
    if (actionsRequiringNetwork.includes(action) && !network_name) {
      return {
        success: false,
        error: `Action "${action}" requires a network_name parameter`
      };
    }

    // Validate network_name format
    if (network_name) {
      const validNamePattern = /^[a-zA-Z0-9][a-zA-Z0-9_.\-]*$/;
      if (!validNamePattern.test(network_name)) {
        return {
          success: false,
          error: `Invalid network name: ${network_name}`
        };
      }
    }

    // Validate container for connect/disconnect
    if (['connect', 'disconnect'].includes(action) && !container) {
      return {
        success: false,
        error: `Action "${action}" requires a container parameter`
      };
    }

    // Validate container name format
    if (container) {
      const validContainerPattern = /^[a-zA-Z0-9][a-zA-Z0-9_.\-/:]*$/;
      if (!validContainerPattern.test(container)) {
        return {
          success: false,
          error: `Invalid container name: ${container}`
        };
      }
    }

    // Validate driver
    const validDrivers = ['bridge', 'overlay', 'macvlan', 'host', 'none'];
    if (driver && !validDrivers.includes(driver)) {
      return {
        success: false,
        error: `Invalid driver: ${driver}. Must be one of: ${validDrivers.join(', ')}`
      };
    }

    let command;

    switch (action) {
      case 'list': {
        command = 'docker network ls --format \'{{json .}}\' 2>&1';
        break;
      }
      case 'create': {
        command = `docker network create --driver "${driver}"`;
        if (options) {
          // Parse options string into --opt flags
          const optPairs = options.split(',').map(opt => opt.trim()).filter(Boolean);
          for (const opt of optPairs) {
            command += ` --opt ${opt}`;
          }
        }
        command += ` "${network_name}" 2>&1`;
        break;
      }
      case 'remove': {
        command = `docker network rm "${network_name}" 2>&1`;
        break;
      }
      case 'inspect': {
        command = `docker network inspect "${network_name}" 2>&1`;
        break;
      }
      case 'connect': {
        command = `docker network connect "${network_name}" "${container}" 2>&1`;
        break;
      }
      case 'disconnect': {
        command = `docker network disconnect "${network_name}" "${container}" 2>&1`;
        break;
      }
    }

    const result = await executeCommand(serverConfig, command);

    if (!result.success) {
      // Check for common errors
      if (result.output?.includes('not found') || result.output?.includes('No such network')) {
        return {
          success: false,
          error: `Network "${network_name}" not found`,
          exit_code: result.exit_code
        };
      }
      if (result.output?.includes('already exists')) {
        return {
          success: false,
          error: `Network "${network_name}" already exists`,
          exit_code: result.exit_code
        };
      }
      if (result.output?.includes('has active endpoints')) {
        return {
          success: false,
          error: `Network "${network_name}" has active endpoints and cannot be removed. Disconnect all containers first.`,
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
        error: result.error || `Failed to ${action} Docker network`,
        exit_code: result.exit_code,
        output: result.output
      };
    }

    // Process results based on action
    switch (action) {
      case 'list': {
        let networks = [];
        if (result.output.trim()) {
          try {
            networks = result.output.trim().split('\n')
              .filter(line => line.trim())
              .map(line => {
                try {
                  const net = JSON.parse(line);
                  return {
                    id: net.ID,
                    name: net.Name,
                    driver: net.Driver,
                    scope: net.Scope
                  };
                } catch {
                  return { raw: line };
                }
              });
          } catch {
            networks = [{ raw: result.output }];
          }
        }
        return {
          success: true,
          action: 'list',
          networks,
          count: networks.length
        };
      }

      case 'create':
        return {
          success: true,
          action: 'create',
          network: network_name,
          driver,
          message: `Network "${network_name}" created successfully with driver "${driver}"`,
          output: result.output
        };

      case 'remove':
        return {
          success: true,
          action: 'remove',
          network: network_name,
          message: `Network "${network_name}" removed successfully`,
          output: result.output
        };

      case 'inspect': {
        let networkData = null;
        try {
          const parsed = JSON.parse(result.output);
          networkData = Array.isArray(parsed) ? parsed[0] : parsed;
        } catch {
          networkData = { raw: result.output };
        }
        return {
          success: true,
          action: 'inspect',
          network: network_name,
          data: networkData
        };
      }

      case 'connect':
        return {
          success: true,
          action: 'connect',
          network: network_name,
          container,
          message: `Container "${container}" connected to network "${network_name}" successfully`,
          output: result.output
        };

      case 'disconnect':
        return {
          success: true,
          action: 'disconnect',
          network: network_name,
          container,
          message: `Container "${container}" disconnected from network "${network_name}" successfully`,
          output: result.output
        };
    }
  }
};
