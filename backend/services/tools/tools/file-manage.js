/**
 * Tool: file_manage — File operations (read/write/delete/permissions)
 * Risk: MODERATE (general) or CRITICAL (delete, chmod 777, recursive chown)
 */

import { executeCommand } from '../../agent-executor.js';

export default {
  name: 'file_manage',
  description: 'Perform file operations on the remote server: read, write, delete, change permissions (chmod), change ownership (chown), create directories, or check existence. Delete and dangerous permission changes require approval.',
  parameters: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        description: 'File operation to perform',
        enum: ['read', 'write', 'delete', 'chmod', 'chown', 'mkdir', 'exists']
      },
      path: {
        type: 'string',
        description: 'Absolute path to the file or directory'
      },
      content: {
        type: 'string',
        description: 'Content to write (for write action)'
      },
      mode: {
        type: 'string',
        description: 'Permission mode (for chmod action, e.g., "755", "644")'
      },
      owner: {
        type: 'string',
        description: 'Owner and optional group (for chown action, e.g., "www-data:www-data")'
      },
      recursive: {
        type: 'boolean',
        description: 'Apply operation recursively (for chmod, chown, delete)',
        default: false
      }
    },
    required: ['action', 'path']
  },
  risk_level: 'MODERATE',
  needs_approval: false,
  category: 'file',

  async implementation(serverConfig, args, context) {
    const { action, path, content, mode, owner, recursive = false } = args;

    if (!path || !path.startsWith('/')) {
      return {
        success: false,
        error: 'path must be an absolute path starting with /'
      };
    }

    // Determine if this is a critical action requiring approval
    const isCriticalAction =
      action === 'delete' ||
      (action === 'chmod' && mode === '777') ||
      (action === 'chown' && recursive);

    if (isCriticalAction && !context.approvedBy) {
      return {
        success: false,
        error: `Action "${action}" on "${path}" requires approval`,
        needs_approval: true,
        risk_level: 'CRITICAL'
      };
    }

    switch (action) {
      case 'read': {
        const result = await executeCommand(serverConfig, `cat "${path}" 2>&1`);
        if (!result.success) {
          return {
            success: false,
            error: result.error || `Failed to read file: ${path}`,
            exit_code: result.exit_code
          };
        }
        // Get file metadata
        const statResult = await executeCommand(
          serverConfig,
          `stat -c '%s %Y %a %U:%G' "${path}" 2>/dev/null || echo "0 0 0000 unknown:unknown"`
        );
        const statParts = statResult.output?.trim().split(' ') || [];
        return {
          success: true,
          action: 'read',
          path,
          content: result.output,
          size_bytes: parseInt(statParts[0]) || 0,
          modified: statParts[1] ? new Date(parseInt(statParts[1]) * 1000).toISOString() : null,
          permissions: statParts[2],
          owner: statParts[3]
        };
      }

      case 'write': {
        if (content === undefined || content === null) {
          return { success: false, error: 'content is required for write action' };
        }
        // Ensure parent directory exists
        const dir = path.substring(0, path.lastIndexOf('/'));
        if (dir) {
          await executeCommand(serverConfig, `mkdir -p "${dir}"`);
        }
        // Write content using heredoc
        const escapedContent = content.replace(/'/g, "'\\''");
        const writeResult = await executeCommand(
          serverConfig,
          `echo '${escapedContent}' > "${path}" 2>&1`
        );
        if (!writeResult.success) {
          return {
            success: false,
            error: writeResult.error || 'Failed to write file',
            exit_code: writeResult.exit_code
          };
        }
        return {
          success: true,
          action: 'write',
          path,
          bytes_written: content.length,
          lines_written: content.split('\n').length
        };
      }

      case 'delete': {
        // Prevent deleting critical system directories
        const protectedPaths = ['/', '/etc', '/usr', '/var', '/bin', '/sbin', '/boot', '/lib', '/sys', '/proc', '/dev'];
        if (protectedPaths.includes(path)) {
          return {
            success: false,
            error: `Cannot delete protected system path: ${path}`
          };
        }
        const rmFlag = recursive ? '-rf' : '-f';
        const result = await executeCommand(serverConfig, `rm ${rmFlag} "${path}" 2>&1`);
        if (!result.success) {
          return {
            success: false,
            error: result.error || `Failed to delete: ${path}`,
            exit_code: result.exit_code
          };
        }
        return {
          success: true,
          action: 'delete',
          path,
          recursive,
          risk_level: 'CRITICAL'
        };
      }

      case 'chmod': {
        if (!mode) {
          return { success: false, error: 'mode is required for chmod action' };
        }
        // Validate mode (numeric or symbolic)
        const validNumericMode = /^[0-7]{3,4}$/;
        const validSymbolicMode = /^[ugoa]+[+\-][rwxXst]+$/;
        if (!validNumericMode.test(mode) && !validSymbolicMode.test(mode)) {
          return {
            success: false,
            error: `Invalid permission mode: ${mode}. Use numeric (e.g., "755") or symbolic (e.g., "u+rw") format.`
          };
        }
        const rFlag = recursive ? '-R' : '';
        const result = await executeCommand(
          serverConfig,
          `chmod ${rFlag} ${mode} "${path}" 2>&1`
        );
        if (!result.success) {
          return {
            success: false,
            error: result.error || `Failed to chmod ${path}`,
            exit_code: result.exit_code
          };
        }
        return {
          success: true,
          action: 'chmod',
          path,
          mode,
          recursive,
          risk_level: mode === '777' ? 'CRITICAL' : 'MODERATE'
        };
      }

      case 'chown': {
        if (!owner) {
          return { success: false, error: 'owner is required for chown action' };
        }
        // Validate owner format (user or user:group)
        const validOwnerPattern = /^[a-z_][a-z0-9_.\-]*(:[a-z_][a-z0-9_.\-]*)?$/i;
        if (!validOwnerPattern.test(owner)) {
          return {
            success: false,
            error: `Invalid owner format: ${owner}. Use "user" or "user:group" format.`
          };
        }
        const chownRFlag = recursive ? '-R' : '';
        const result = await executeCommand(
          serverConfig,
          `chown ${chownRFlag} ${owner} "${path}" 2>&1`
        );
        if (!result.success) {
          return {
            success: false,
            error: result.error || `Failed to chown ${path}`,
            exit_code: result.exit_code
          };
        }
        return {
          success: true,
          action: 'chown',
          path,
          owner,
          recursive,
          risk_level: recursive ? 'CRITICAL' : 'MODERATE'
        };
      }

      case 'mkdir': {
        const mkRFlag = recursive ? '-p' : '';
        const result = await executeCommand(
          serverConfig,
          `mkdir ${mkRFlag} "${path}" 2>&1`
        );
        if (!result.success) {
          return {
            success: false,
            error: result.error || `Failed to create directory: ${path}`,
            exit_code: result.exit_code
          };
        }
        return {
          success: true,
          action: 'mkdir',
          path,
          recursive
        };
      }

      case 'exists': {
        const result = await executeCommand(
          serverConfig,
          `test -e "${path}" && echo "EXISTS" || echo "NOT_FOUND"`
        );
        const exists = result.output?.includes('EXISTS');
        // Get additional info if it exists
        let info = null;
        if (exists) {
          const typeResult = await executeCommand(
            serverConfig,
            `test -d "${path}" && echo "DIRECTORY" || (test -f "${path}" && echo "FILE" || echo "OTHER")`
          );
          info = {
            type: typeResult.output?.trim(),
          };
          if (typeResult.output?.includes('FILE')) {
            const statResult = await executeCommand(
              serverConfig,
              `stat -c '%s %Y %a %U:%G' "${path}" 2>/dev/null`
            );
            if (statResult.success) {
              const [size, mtime, perm, own] = statResult.output.trim().split(' ');
              info.size_bytes = parseInt(size) || 0;
              info.modified = mtime ? new Date(parseInt(mtime) * 1000).toISOString() : null;
              info.permissions = perm;
              info.owner = own;
            }
          }
        }
        return {
          success: true,
          action: 'exists',
          path,
          exists,
          info
        };
      }

      default:
        return {
          success: false,
          error: `Invalid action: ${action}. Must be read, write, delete, chmod, chown, mkdir, or exists.`
        };
    }
  }
};
