/**
 * Tool: file_search — Search for files and content on the server
 * Risk: SAFE (read-only)
 */

import { executeCommand } from '../../agent-executor.js';

export default {
  name: 'file_search',
  description: 'Search for files by name pattern or content on the remote server. Combines find and grep capabilities for flexible searching.',
  parameters: {
    type: 'object',
    properties: {
      type: {
        type: 'string',
        enum: ['name', 'content'],
        description: 'Search type: "name" (find files by name pattern) or "content" (grep in files). Default: "name"',
        default: 'name'
      },
      pattern: {
        type: 'string',
        description: 'Search pattern: filename pattern for "name" type, or text to search for "content" type'
      },
      path: {
        type: 'string',
        description: 'Directory to search in. Default: "/"',
        default: '/'
      },
      max_depth: {
        type: 'number',
        description: 'Maximum directory depth. Default: 5',
        default: 5
      },
      file_type: {
        type: 'string',
        description: 'File extension filter for content search (e.g. ".js", ".conf")'
      },
      case_sensitive: {
        type: 'boolean',
        description: 'Case-sensitive search. Default: false',
        default: false
      },
      max_results: {
        type: 'number',
        description: 'Maximum number of results. Default: 50',
        default: 50
      }
    },
    required: ['pattern']
  },
  risk_level: 'SAFE',
  needs_approval: false,
  category: 'file',

  async implementation(serverConfig, args) {
    const { type = 'name', pattern, path = '/', max_depth = 5, file_type, case_sensitive = false, max_results = 50 } = args;

    if (!pattern) {
      return { success: false, error: 'pattern is required' };
    }

    const sanitizedPattern = pattern.replace(/[;&|`$()]/g, '');
    const sanitizedPath = path.replace(/[;&|`$()]/g, '');
    const limit = Math.min(max_results, 200);

    let command;

    if (type === 'name') {
      // Find files by name pattern
      command = `find "${sanitizedPath}" -maxdepth ${max_depth} -name "${sanitizedPattern}" -type f 2>/dev/null | head -${limit}`;
    } else {
      // Search content in files
      let grepFlags = '-r';
      if (!case_sensitive) grepFlags += 'i';

      let includeFilter = '';
      if (file_type) {
        const sanitizedType = file_type.replace(/[;&|`$()]/g, '');
        includeFilter = ` --include="*${sanitizedType}"`;
      }

      command = `grep ${grepFlags}${includeFilter} "${sanitizedPattern}" "${sanitizedPath}" 2>/dev/null | head -${limit}`;
    }

    const result = await executeCommand(serverConfig, command);

    if (!result.success) {
      return {
        success: true,
        message: 'No results found',
        results: [],
        output: result.output || ''
      };
    }

    return {
      success: true,
      type,
      pattern: sanitizedPattern,
      path: sanitizedPath,
      output: result.output
    };
  }
};
