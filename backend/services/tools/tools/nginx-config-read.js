/**
 * Tool: nginx_config_read — Read Nginx configuration files
 * Risk: SAFE (read-only)
 */

import { executeCommand } from '../../agent-executor.js';

export default {
  name: 'nginx_config_read',
  description: 'Read an Nginx configuration file from the remote server. Common paths: /etc/nginx/nginx.conf, /etc/nginx/sites-available/default, /etc/nginx/sites-enabled/*, /etc/nginx/conf.d/*.',
  parameters: {
    type: 'object',
    properties: {
      config_path: {
        type: 'string',
        description: 'Absolute path to the nginx config file to read (e.g., /etc/nginx/sites-available/default)'
      }
    },
    required: ['config_path']
  },
  risk_level: 'SAFE',
  needs_approval: false,
  category: 'webserver',

  async implementation(serverConfig, args) {
    const { config_path } = args;

    if (!config_path || !config_path.startsWith('/')) {
      return {
        success: false,
        error: 'config_path must be an absolute path starting with /'
      };
    }

    const result = await executeCommand(serverConfig, `cat "${config_path}" 2>&1`);

    if (!result.success && result.exit_code !== 0) {
      return {
        success: false,
        error: result.error || `Failed to read config file: ${config_path}`,
        exit_code: result.exit_code
      };
    }

    // Get file metadata
    const statResult = await executeCommand(
      serverConfig,
      `stat -c '%s %Y' "${config_path}" 2>/dev/null || echo "0 0"`
    );
    const [size, mtime] = statResult.success ? statResult.output.trim().split(' ') : ['0', '0'];

    return {
      success: true,
      path: config_path,
      content: result.output,
      size_bytes: parseInt(size) || 0,
      modified: mtime ? new Date(parseInt(mtime) * 1000).toISOString() : null,
      lines: result.output.split('\n').length
    };
  }
};
