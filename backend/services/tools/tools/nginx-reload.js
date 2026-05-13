/**
 * Tool: nginx_reload — Reload Nginx configuration
 * Risk: MODERATE (service restart)
 */

import { executeCommand } from '../../agent-executor.js';

export default {
  name: 'nginx_reload',
  description: 'Reload Nginx configuration on the remote server. Optionally tests configuration before reloading. Uses systemctl reload nginx or nginx -s reload.',
  parameters: {
    type: 'object',
    properties: {
      config_test: {
        type: 'boolean',
        description: 'Run nginx -t before reloading to verify config is valid',
        default: true
      }
    },
    required: []
  },
  risk_level: 'MODERATE',
  needs_approval: false,
  category: 'webserver',

  async implementation(serverConfig, args) {
    const { config_test = true } = args;

    // Test config first if requested
    if (config_test) {
      const testResult = await executeCommand(serverConfig, 'nginx -t 2>&1');
      const testOutput = testResult.output || testResult.error || '';
      const isValid = testOutput.includes('syntax is ok') && testOutput.includes('test is successful');

      if (!isValid) {
        return {
          success: false,
          error: 'Nginx configuration test failed. Reload aborted.',
          test_output: testOutput.trim(),
          config_valid: false
        };
      }
    }

    // Try systemctl reload first, fallback to nginx -s reload
    const reloadResult = await executeCommand(
      serverConfig,
      'systemctl reload nginx 2>&1 || nginx -s reload 2>&1'
    );

    if (!reloadResult.success) {
      return {
        success: false,
        error: reloadResult.error || 'Failed to reload Nginx',
        exit_code: reloadResult.exit_code
      };
    }

    return {
      success: true,
      message: 'Nginx reloaded successfully',
      config_tested: config_test,
      output: reloadResult.output
    };
  }
};
