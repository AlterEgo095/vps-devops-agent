/**
 * Tool: docker_container_manage — Start/stop/restart Docker containers
 * Risk: MODERATE (container lifecycle management)
 */

import { executeCommand } from '../../agent-executor.js';

export default {
  name: 'docker_container_manage',
  description: 'Start, stop, or restart a specific Docker container on the remote server. Stop and restart actions require approval as they affect running services.',
  parameters: {
    type: 'object',
    properties: {
      container_name: {
        type: 'string',
        description: 'Name or ID of the Docker container'
      },
      action: {
        type: 'string',
        description: 'Action to perform on the container',
        enum: ['start', 'stop', 'restart']
      }
    },
    required: ['container_name', 'action']
  },
  risk_level: 'MODERATE',
  needs_approval: false,
  category: 'docker',

  async implementation(serverConfig, args, context) {
    const { container_name, action } = args;

    // Validate container name (alphanumeric, dash, underscore, slash for image IDs)
    const validNamePattern = /^[a-zA-Z0-9][a-zA-Z0-9_.\-/:]*$/;
    if (!validNamePattern.test(container_name)) {
      return {
        success: false,
        error: `Invalid container name: ${container_name}`
      };
    }

    const validActions = ['start', 'stop', 'restart'];
    if (!validActions.includes(action)) {
      return {
        success: false,
        error: `Invalid action: ${action}. Must be one of: ${validActions.join(', ')}`
      };
    }

    // Stop and restart are more destructive — require approval
    const criticalActions = ['stop', 'restart'];
    const isCritical = criticalActions.includes(action);

    if (isCritical && !context.approvedBy) {
      return {
        success: false,
        error: `Action "${action}" on container "${container_name}" requires approval`,
        needs_approval: true,
        risk_level: 'CRITICAL'
      };
    }

    // Execute the docker command
    const result = await executeCommand(
      serverConfig,
      `docker ${action} "${container_name}" 2>&1`
    );

    if (!result.success) {
      return {
        success: false,
        error: result.error || `Failed to ${action} container "${container_name}"`,
        exit_code: result.exit_code,
        output: result.output
      };
    }

    // Get container status after action
    const statusResult = await executeCommand(
      serverConfig,
      `docker ps -a --filter "name=${container_name}" --format "{{.Names}} {{.Status}}" 2>&1`
    );

    return {
      success: true,
      container: container_name,
      action,
      message: `Container "${container_name}" ${action}ed successfully`,
      output: result.output,
      current_status: statusResult.success ? statusResult.output.trim() : undefined,
      risk_level: isCritical ? 'CRITICAL' : 'MODERATE'
    };
  }
};
