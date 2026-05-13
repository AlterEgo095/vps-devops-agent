/**
 * Tool: docker_image_manage — Manage Docker images
 * Risk: MODERATE (image lifecycle management; remove is CRITICAL)
 */

import { executeCommand } from '../../agent-executor.js';

export default {
  name: 'docker_image_manage',
  description: 'Manage Docker images on the remote server. Supports pulling new images, removing images, inspecting image details, tagging images, and listing all images. Use this tool to maintain and query the Docker image inventory. List and inspect are safe read-only operations; pull and tag are moderate risk; remove is critical and requires approval.',
  parameters: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        description: 'Action to perform on Docker images',
        enum: ['pull', 'remove', 'inspect', 'tag', 'list']
      },
      image_name: {
        type: 'string',
        description: 'Name of the Docker image (e.g., "nginx", "node:18-alpine"). Required for pull, remove, inspect, and tag actions.'
      },
      tag: {
        type: 'string',
        description: 'Tag for the image (e.g., "latest", "18-alpine"). Used with pull and tag actions. Defaults to "latest" for pull.'
      },
      new_tag: {
        type: 'string',
        description: 'New tag to assign when using the tag action (e.g., "my-registry/nginx:v1"). Required for tag action.'
      }
    },
    required: ['action']
  },
  risk_level: 'MODERATE',
  needs_approval: false,
  category: 'docker',

  async implementation(serverConfig, args, context) {
    const { action, image_name, tag, new_tag } = args;

    // Validate action
    const validActions = ['pull', 'remove', 'inspect', 'tag', 'list'];
    if (!validActions.includes(action)) {
      return {
        success: false,
        error: `Invalid action: ${action}. Must be one of: ${validActions.join(', ')}`
      };
    }

    // Validate image_name for actions that require it
    const actionsRequiringImage = ['pull', 'remove', 'inspect', 'tag'];
    if (actionsRequiringImage.includes(action) && !image_name) {
      return {
        success: false,
        error: `Action "${action}" requires an image_name parameter`
      };
    }

    // Validate image_name format (alphanumeric, dash, underscore, dot, colon, slash)
    if (image_name) {
      const validImagePattern = /^[a-zA-Z0-9][a-zA-Z0-9_.\-/:]*$/;
      if (!validImagePattern.test(image_name)) {
        return {
          success: false,
          error: `Invalid image name: ${image_name}`
        };
      }
    }

    // CRITICAL action: remove requires approval
    if (action === 'remove' && !context.approvedBy) {
      return {
        success: false,
        error: `Removing Docker image "${image_name}" requires approval. This action is irreversible and may affect running services.`,
        needs_approval: true,
        risk_level: 'CRITICAL'
      };
    }

    // Tag action requires new_tag
    if (action === 'tag' && !new_tag) {
      return {
        success: false,
        error: 'Action "tag" requires a new_tag parameter'
      };
    }

    let command;

    switch (action) {
      case 'pull': {
        const imageRef = tag ? `${image_name}:${tag}` : `${image_name}:latest`;
        command = `docker pull "${imageRef}" 2>&1`;
        break;
      }
      case 'remove': {
        const imageRef = tag ? `${image_name}:${tag}` : image_name;
        command = `docker rmi "${imageRef}" 2>&1`;
        break;
      }
      case 'inspect': {
        const imageRef = tag ? `${image_name}:${tag}` : image_name;
        command = `docker image inspect "${imageRef}" 2>&1`;
        break;
      }
      case 'tag': {
        const sourceRef = tag ? `${image_name}:${tag}` : image_name;
        command = `docker tag "${sourceRef}" "${new_tag}" 2>&1`;
        break;
      }
      case 'list': {
        command = 'docker images --format \'{{json .}}\' 2>&1';
        break;
      }
    }

    const result = await executeCommand(serverConfig, command);

    if (!result.success) {
      // Check for common errors
      if (result.output?.includes('not found') || result.output?.includes('No such image')) {
        return {
          success: false,
          error: `Image "${image_name}" not found on this server`,
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
        error: result.error || `Failed to ${action} Docker image`,
        exit_code: result.exit_code,
        output: result.output
      };
    }

    // Process results based on action
    switch (action) {
      case 'pull':
        return {
          success: true,
          action: 'pull',
          image: image_name,
          tag: tag || 'latest',
          message: `Image "${image_name}:${tag || 'latest'}" pulled successfully`,
          output: result.output,
          risk_level: 'MODERATE'
        };

      case 'remove':
        return {
          success: true,
          action: 'remove',
          image: image_name,
          message: `Image "${image_name}" removed successfully`,
          output: result.output,
          risk_level: 'CRITICAL'
        };

      case 'inspect': {
        let imageData = null;
        try {
          const parsed = JSON.parse(result.output);
          imageData = Array.isArray(parsed) ? parsed[0] : parsed;
        } catch {
          imageData = { raw: result.output };
        }
        return {
          success: true,
          action: 'inspect',
          image: image_name,
          data: imageData,
          risk_level: 'SAFE'
        };
      }

      case 'tag':
        return {
          success: true,
          action: 'tag',
          source: image_name,
          new_tag,
          message: `Image "${image_name}" tagged as "${new_tag}" successfully`,
          output: result.output,
          risk_level: 'MODERATE'
        };

      case 'list': {
        let images = [];
        if (result.output.trim()) {
          try {
            images = result.output.trim().split('\n')
              .filter(line => line.trim())
              .map(line => {
                try {
                  const img = JSON.parse(line);
                  return {
                    repository: img.Repository,
                    tag: img.Tag,
                    id: img.ID,
                    created: img.CreatedSince || img.CreatedAt,
                    size: img.Size
                  };
                } catch {
                  return { raw: line };
                }
              });
          } catch {
            images = [{ raw: result.output }];
          }
        }
        return {
          success: true,
          action: 'list',
          images,
          count: images.length,
          risk_level: 'SAFE'
        };
      }
    }
  }
};
