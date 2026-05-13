/**
 * Tool: backup_create — Create a backup of a directory
 * Risk: MODERATE (creates backup files, uses disk space)
 */

import { executeCommand } from '../../agent-executor.js';

export default {
  name: 'backup_create',
  description: 'Create a compressed tar backup of a directory on the remote server. Backups are stored in the specified destination directory with a timestamped filename. Uses tar.gz compression.',
  parameters: {
    type: 'object',
    properties: {
      source_path: {
        type: 'string',
        description: 'Absolute path to the directory to back up'
      },
      backup_name: {
        type: 'string',
        description: 'Custom name for the backup file (without extension). Defaults to directory name + timestamp.'
      },
      destination: {
        type: 'string',
        description: 'Directory where the backup file will be stored',
        default: '/opt/backups'
      }
    },
    required: ['source_path']
  },
  risk_level: 'MODERATE',
  needs_approval: false,
  category: 'backup',

  async implementation(serverConfig, args) {
    const { source_path, backup_name, destination = '/opt/backups' } = args;

    if (!source_path || !source_path.startsWith('/')) {
      return {
        success: false,
        error: 'source_path must be an absolute path starting with /'
      };
    }

    if (!destination.startsWith('/')) {
      return {
        success: false,
        error: 'destination must be an absolute path starting with /'
      };
    }

    // Ensure destination directory exists
    const mkdirResult = await executeCommand(
      serverConfig,
      `mkdir -p "${destination}" 2>&1`
    );

    if (!mkdirResult.success) {
      return {
        success: false,
        error: `Failed to create backup destination directory: ${mkdirResult.error}`
      };
    }

    // Verify source directory exists
    const checkSource = await executeCommand(
      serverConfig,
      `test -d "${source_path}" && echo "EXISTS" || echo "NOT_FOUND"`
    );

    if (!checkSource.output?.includes('EXISTS')) {
      return {
        success: false,
        error: `Source directory does not exist: ${source_path}`
      };
    }

    // Generate backup filename
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
    const dirName = source_path.split('/').filter(Boolean).pop() || 'backup';
    const name = backup_name || `${dirName}-${timestamp}`;
    const backupFile = `${destination}/${name}.tar.gz`;

    // Create the backup using tar
    const tarResult = await executeCommand(
      serverConfig,
      `tar -czf "${backupFile}" -C "$(dirname "${source_path}")" "$(basename "${source_path}")" 2>&1`
    );

    if (!tarResult.success) {
      return {
        success: false,
        error: tarResult.error || `Failed to create backup of ${source_path}`,
        exit_code: tarResult.exit_code
      };
    }

    // Get backup file size
    const sizeResult = await executeCommand(
      serverConfig,
      `stat -c '%s' "${backupFile}" 2>/dev/null || echo "0"`
    );

    // Get source directory size for comparison
    const sourceSizeResult = await executeCommand(
      serverConfig,
      `du -sb "${source_path}" 2>/dev/null | cut -f1 || echo "0"`
    );

    const backupSize = parseInt(sizeResult.output?.trim()) || 0;
    const sourceSize = parseInt(sourceSizeResult.output?.trim()) || 0;

    // Verify the backup file
    const verifyResult = await executeCommand(
      serverConfig,
      `tar -tzf "${backupFile}" >/dev/null 2>&1 && echo "VALID" || echo "INVALID"`
    );

    return {
      success: true,
      message: `Backup created successfully: ${backupFile}`,
      source_path,
      backup_file: backupFile,
      backup_name: name,
      backup_size_bytes: backupSize,
      source_size_bytes: sourceSize,
      compression_ratio: sourceSize > 0 ? ((1 - backupSize / sourceSize) * 100).toFixed(1) + '%' : 'N/A',
      verified: verifyResult.output?.includes('VALID') || false,
      destination
    };
  }
};
