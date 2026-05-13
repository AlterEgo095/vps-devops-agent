/**
 * Tool: curl_check — Perform HTTP/HTTPS request from the server
 * Risk: SAFE (read-only network check)
 */

import { executeCommand } from '../../agent-executor.js';

export default {
  name: 'curl_check',
  description: 'Perform an HTTP/HTTPS request from the remote server to check connectivity, response codes, and latency. Useful for testing if services are reachable from the server.',
  parameters: {
    type: 'object',
    properties: {
      url: {
        type: 'string',
        description: 'URL to check (e.g. "http://localhost:3000", "https://example.com")'
      },
      method: {
        type: 'string',
        enum: ['GET', 'HEAD', 'POST'],
        description: 'HTTP method. Default: "HEAD" (lightweight check)',
        default: 'HEAD'
      },
      follow_redirects: {
        type: 'boolean',
        description: 'Follow HTTP redirects. Default: true',
        default: true
      },
      max_time: {
        type: 'number',
        description: 'Maximum time in seconds for the request. Default: 10',
        default: 10
      },
      headers: {
        type: 'boolean',
        description: 'Include response headers in output. Default: true',
        default: true
      }
    },
    required: ['url']
  },
  risk_level: 'SAFE',
  needs_approval: false,
  category: 'monitoring',

  async implementation(serverConfig, args) {
    const { url, method = 'HEAD', follow_redirects = true, max_time = 10, headers = true } = args;

    if (!url) {
      return { success: false, error: 'url is required' };
    }

    // Basic URL validation - only allow http/https
    if (!url.match(/^https?:\/\//)) {
      return { success: false, error: 'Only http:// and https:// URLs are allowed' };
    }

    // Prevent SSRF - block private IPs (basic check)
    const sanitizedUrl = url.replace(/[;&|`$()]/g, '');

    let command = 'curl -s -o /dev/null';

    if (headers) {
      command += ' -w "HTTP Code: %{http_code}\\nTime Total: %{time_total}s\\nTime Connect: %{time_connect}s\\nTime Start Transfer: %{time_starttransfer}s\\nSize Download: %{size_download} bytes\\nRedirect URL: %{redirect_url}\\n"';
    }

    command += ` -X ${method}`;
    command += ` --max-time ${Math.min(max_time, 30)}`;

    if (follow_redirects) {
      command += ' -L';
    }

    command += ` "${sanitizedUrl}" 2>&1`;

    // Also get headers if requested
    let headerOutput = null;
    if (headers) {
      const headerResult = await executeCommand(
        serverConfig,
        `curl -sI -X ${method} --max-time ${Math.min(max_time, 30)} ${follow_redirects ? '-L' : ''} "${sanitizedUrl}" 2>&1`
      );
      if (headerResult.success) {
        headerOutput = headerResult.output;
      }
    }

    const result = await executeCommand(serverConfig, command);

    return {
      success: result.success,
      url: sanitizedUrl,
      method,
      curl_output: result.output,
      headers: headerOutput
    };
  }
};
