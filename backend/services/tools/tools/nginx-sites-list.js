/**
 * Tool: nginx_sites_list — List Nginx enabled/available sites
 * Risk: SAFE (read-only)
 */

import { executeCommand } from '../../agent-executor.js';

export default {
  name: 'nginx_sites_list',
  description: 'List Nginx enabled and available site configurations on the remote server. Shows symlinks in sites-enabled and files in sites-available.',
  parameters: {
    type: 'object',
    properties: {
      type: {
        type: 'string',
        enum: ['enabled', 'available', 'both'],
        description: 'Which sites to list: "enabled" (active sites), "available" (all configured), or "both". Default: "both"',
        default: 'both'
      }
    },
    required: []
  },
  risk_level: 'SAFE',
  needs_approval: false,
  category: 'webserver',

  async implementation(serverConfig, args) {
    const { type = 'both' } = args;

    const results = {};

    if (type === 'enabled' || type === 'both') {
      const enabledResult = await executeCommand(
        serverConfig,
        'ls -la /etc/nginx/sites-enabled/ 2>/dev/null || echo "No sites-enabled directory"'
      );
      results.enabled = enabledResult.success ? enabledResult.output : 'Unable to list enabled sites';
    }

    if (type === 'available' || type === 'both') {
      const availableResult = await executeCommand(
        serverConfig,
        'ls -la /etc/nginx/sites-available/ 2>/dev/null || echo "No sites-available directory"'
      );
      results.available = availableResult.success ? availableResult.output : 'Unable to list available sites';
    }

    return {
      success: true,
      sites: results
    };
  }
};
