/**
 * Tool: file_write — Write or modify a file on the remote server
 * Risk: MODERATE (creates/modifies files)
 */

import { executeCommand } from '../../agent-executor.js';

export default {
  name: 'file_write',
  description: 'Write content to a file on the remote server. Creates the file if it does not exist. Optionally creates a backup before overwriting. Use with caution on system files.',
  parameters: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Absolute path to the file to write'
      },
      content: {
        type: 'string',
        description: 'Content to write to the file'
      },
      create_backup: {
        type: 'boolean',
        description: 'Create a .bak copy before overwriting',
        default: true
      },
      append: {
        type: 'boolean',
        description: 'Append to file instead of overwriting',
        default: false
      },
      permissions: {
        type: 'string',
        description: 'File permissions (e.g., "644", "755")',
        default: null
      }
    },
    required: ['path', 'content']
  },
  risk_level: 'MODERATE',
  needs_approval: false,
  category: 'file',

  async implementation(serverConfig, args) {
    const { path, content, create_backup = true, append = false, permissions } = args;

    // Create backup if requested and file exists
    if (create_backup) {
      const backupCmd = `cp "${path}" "${path}.bak.$(date +%s)" 2>/dev/null || true`;
      await executeCommand(serverConfig, backupCmd);
    }

    // Ensure parent directory exists
    const dir = path.substring(0, path.lastIndexOf('/'));
    if (dir) {
      await executeCommand(serverConfig, `mkdir -p "${dir}"`);
    }

    // Write content via heredoc (handles multi-line content safely)
    // Escape single quotes in content for heredoc
    const escapedContent = content.replace(/'/g, "'\\''");
    const redirectOp = append ? '>>' : '>';
    const writeCmd = `echo '${escapedContent}' ${redirectOp} "${path}"`;

    const result = await executeCommand(serverConfig, writeCmd);

    if (!result.success) {
      return {
        success: false,
        error: result.error || 'Failed to write file',
        exit_code: result.exit_code
      };
    }

    // Set permissions if specified
    if (permissions) {
      await executeCommand(serverConfig, `chmod ${permissions} "${path}"`);
    }

    // Verify the write
    const verifyResult = await executeCommand(serverConfig, `wc -l "${path}"`);

    return {
      success: true,
      path,
      bytes_written: content.length,
      lines_written: content.split('\n').length,
      backup_created: create_backup,
      permissions_set: permissions || 'inherited',
      verified: verifyResult.success
    };
  }
};
