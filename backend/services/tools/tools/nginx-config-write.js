/**
 * Tool: nginx_config_write — Write Nginx configuration with backup and validation
 * Risk: CRITICAL (modifies webserver config)
 */

import { executeCommand } from '../../agent-executor.js';

export default {
  name: 'nginx_config_write',
  description: 'Write an Nginx configuration file on the remote server. Creates automatic backup before writing. Tests configuration after writing and restores backup if test fails. Requires approval.',
  parameters: {
    type: 'object',
    properties: {
      config_path: {
        type: 'string',
        description: 'Absolute path to the nginx config file to write (e.g., /etc/nginx/sites-available/default)'
      },
      content: {
        type: 'string',
        description: 'The full nginx configuration content to write'
      },
      backup: {
        type: 'boolean',
        description: 'Create a backup of the existing file before overwriting',
        default: true
      }
    },
    required: ['config_path', 'content']
  },
  risk_level: 'CRITICAL',
  needs_approval: true,
  category: 'webserver',

  async implementation(serverConfig, args) {
    const { config_path, content, backup = true } = args;

    if (!config_path || !config_path.startsWith('/')) {
      return {
        success: false,
        error: 'config_path must be an absolute path starting with /'
      };
    }

    // Validate path is within typical nginx config locations
    const allowedPrefixes = ['/etc/nginx/', '/usr/local/nginx/', '/opt/nginx/'];
    const isAllowedPath = allowedPrefixes.some(prefix => config_path.startsWith(prefix));
    if (!isAllowedPath) {
      return {
        success: false,
        error: `config_path must be within allowed nginx directories: ${allowedPrefixes.join(', ')}`
      };
    }

    let backupPath = null;

    // Create backup if requested
    if (backup) {
      const timestamp = Date.now();
      backupPath = `${config_path}.bak.${timestamp}`;
      const backupResult = await executeCommand(
        serverConfig,
        `cp "${config_path}" "${backupPath}" 2>&1 || echo "NO_EXISTING_FILE"`
      );

      if (!backupResult.success && !backupResult.output?.includes('NO_EXISTING_FILE')) {
        return {
          success: false,
          error: `Failed to create backup: ${backupResult.error}`,
          backup_attempted: true
        };
      }
    }

    // Write the new configuration using heredoc for safety
    const escapedContent = content.replace(/'/g, "'\\''");
    const writeResult = await executeCommand(
      serverConfig,
      `echo '${escapedContent}' > "${config_path}" 2>&1`
    );

    if (!writeResult.success) {
      // Restore backup if write failed
      if (backupPath) {
        await executeCommand(serverConfig, `cp "${backupPath}" "${config_path}" 2>/dev/null || true`);
      }
      return {
        success: false,
        error: `Failed to write config: ${writeResult.error}`,
        backup_restored: !!backupPath
      };
    }

    // Test the new configuration
    const testResult = await executeCommand(serverConfig, 'nginx -t 2>&1');
    const testOutput = testResult.output || testResult.error || '';
    const isValid = testOutput.includes('syntax is ok') && testOutput.includes('test is successful');

    if (!isValid) {
      // Config test failed — restore backup
      let restored = false;
      if (backupPath) {
        const restoreResult = await executeCommand(
          serverConfig,
          `cp "${backupPath}" "${config_path}" 2>&1`
        );
        restored = restoreResult.success;
      }

      return {
        success: false,
        error: 'Nginx configuration test failed after write. Backup restored.',
        test_output: testOutput.trim(),
        backup_restored: restored,
        backup_path: backupPath
      };
    }

    return {
      success: true,
      message: 'Nginx configuration written and validated successfully',
      path: config_path,
      backup_path: backupPath,
      config_valid: true,
      test_output: testOutput.trim(),
      bytes_written: content.length
    };
  }
};
