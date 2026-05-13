/**
 * Tool: nginx_test — Test Nginx configuration
 * Risk: SAFE (read-only check)
 */

import { executeCommand } from '../../agent-executor.js';

export default {
  name: 'nginx_test',
  description: 'Test Nginx configuration syntax on the remote server. Returns whether the config is valid and any error messages. Safe to run at any time.',
  parameters: {
    type: 'object',
    properties: {
      config_path: {
        type: 'string',
        description: 'Path to nginx config file to test (default: test all configs)',
        default: null
      }
    },
    required: []
  },
  risk_level: 'SAFE',
  needs_approval: false,
  category: 'system',

  async implementation(serverConfig, args) {
    const { config_path } = args;

    let command = 'nginx -t 2>&1';
    if (config_path) {
      command = `nginx -t -c "${config_path}" 2>&1`;
    }

    const result = await executeCommand(serverConfig, command);

    // nginx -t returns exit code 0 for success, non-zero for failure
    // But outputs to stderr, so capture both
    const output = result.output || result.error || '';
    const isValid = output.includes('syntax is ok') && output.includes('test is successful');

    return {
      success: true,
      valid: isValid,
      output: output.trim(),
      config_path: config_path || '/etc/nginx/nginx.conf'
    };
  }
};
