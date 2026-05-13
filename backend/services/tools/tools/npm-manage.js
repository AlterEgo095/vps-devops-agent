/**
 * Tool: npm_manage — Manage npm packages on the server
 * Risk: MODERATE (package installation and removal)
 */

import { executeCommand } from '../../agent-executor.js';

export default {
  name: 'npm_manage',
  description: 'Manage npm (Node.js package manager) packages on the remote server. Supports listing installed packages, installing new packages, uninstalling packages, updating packages, checking for outdated packages, and cleaning the npm cache. Use this tool to manage Node.js dependencies and development tools. Install and uninstall are moderate risk as they modify the system; update and cache_clean are moderate risk; list and outdated are safe read-only operations.',
  parameters: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        description: 'Action to perform with npm',
        enum: ['list', 'install', 'uninstall', 'update', 'outdated', 'cache_clean']
      },
      package_name: {
        type: 'string',
        description: 'Name of the npm package (e.g., "express", "pm2", "typescript"). Required for install and uninstall actions. Optional for update (updates all if omitted).'
      },
      global: {
        type: 'boolean',
        description: 'Operate on global packages instead of local project packages. Defaults to true for server-level package management.',
        default: true
      }
    },
    required: ['action']
  },
  risk_level: 'MODERATE',
  needs_approval: false,
  category: 'system',

  async implementation(serverConfig, args, context) {
    const { action, package_name, global = true } = args;

    // Validate action
    const validActions = ['list', 'install', 'uninstall', 'update', 'outdated', 'cache_clean'];
    if (!validActions.includes(action)) {
      return {
        success: false,
        error: `Invalid action: ${action}. Must be one of: ${validActions.join(', ')}`
      };
    }

    // Validate package_name for actions that require it
    if (['install', 'uninstall'].includes(action) && !package_name) {
      return {
        success: false,
        error: `Action "${action}" requires a package_name parameter`
      };
    }

    // Validate package_name format if provided
    if (package_name) {
      // Allow scoped packages like @types/node
      const validPackagePattern = /^(@[a-zA-Z0-9_-]+\/)?[a-zA-Z0-9_][a-zA-Z0-9_.-]*$/;
      if (!validPackagePattern.test(package_name)) {
        return {
          success: false,
          error: `Invalid package name: ${package_name}`
        };
      }
    }

    const globalFlag = global ? '-g' : '';

    let command;

    switch (action) {
      case 'list': {
        command = `npm list ${globalFlag} --depth=0 --json 2>&1`;
        break;
      }
      case 'install': {
        command = `npm install ${globalFlag} "${package_name}" 2>&1`;
        break;
      }
      case 'uninstall': {
        command = `npm uninstall ${globalFlag} "${package_name}" 2>&1`;
        break;
      }
      case 'update': {
        if (package_name) {
          command = `npm update ${globalFlag} "${package_name}" 2>&1`;
        } else {
          command = `npm update ${globalFlag} 2>&1`;
        }
        break;
      }
      case 'outdated': {
        command = `npm outdated ${globalFlag} --json 2>&1`;
        break;
      }
      case 'cache_clean': {
        command = 'npm cache clean --force 2>&1';
        break;
      }
    }

    const result = await executeCommand(serverConfig, command);

    // npm outdated returns non-zero exit code when packages are outdated, but it's not an error
    const isOutdatedNonError = action === 'outdated' && result.exit_code === 1 && result.output;

    if (!result.success && !isOutdatedNonError) {
      // Check for common errors
      if (result.output?.includes('command not found') || result.output?.includes('npm: not found')) {
        return {
          success: false,
          error: 'npm is not installed on this server. Install Node.js first: curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash - && sudo apt install -y nodejs'
        };
      }
      if (result.output?.includes('EACCES') || result.output?.includes('permission denied')) {
        return {
          success: false,
          error: 'Permission denied. Try running with sudo or configure npm to use a directory you have access to.',
          exit_code: result.exit_code
        };
      }
      if (result.output?.includes('404 Not Found') || result.output?.includes('not found in the registry')) {
        return {
          success: false,
          error: `Package "${package_name}" not found in the npm registry`,
          exit_code: result.exit_code
        };
      }
      if (result.output?.includes('ENOENT') && action === 'uninstall') {
        return {
          success: false,
          error: `Package "${package_name}" is not installed`,
          exit_code: result.exit_code
        };
      }
      return {
        success: false,
        error: result.error || `Failed to ${action} npm package`,
        exit_code: result.exit_code,
        output: result.output
      };
    }

    // Process results based on action
    switch (action) {
      case 'list': {
        let packages = {};
        try {
          const parsed = JSON.parse(result.output);
          const deps = parsed.dependencies || {};
          packages = Object.entries(deps).map(([name, info]) => ({
            name,
            version: info.version || info.required?.version || 'unknown',
            path: info.path || ''
          }));
        } catch {
          // Fallback: parse text output
          packages = result.output.split('\n')
            .filter(line => line.includes('@'))
            .map(line => {
              const match = line.match(/([a-zA-Z0-9@/_.-]+)@([0-9.]+)/);
              return match ? { name: match[1], version: match[2] } : null;
            })
            .filter(Boolean);
        }
        return {
          success: true,
          action: 'list',
          packages,
          count: Array.isArray(packages) ? packages.length : Object.keys(packages).length,
          global,
          risk_level: 'SAFE'
        };
      }

      case 'install':
        return {
          success: true,
          action: 'install',
          package: package_name,
          global,
          message: `Package "${package_name}" installed ${global ? 'globally' : 'locally'} successfully`,
          output: result.output,
          risk_level: 'MODERATE'
        };

      case 'uninstall':
        return {
          success: true,
          action: 'uninstall',
          package: package_name,
          global,
          message: `Package "${package_name}" uninstalled ${global ? 'globally' : 'locally'} successfully`,
          output: result.output,
          risk_level: 'MODERATE'
        };

      case 'update':
        return {
          success: true,
          action: 'update',
          package: package_name || 'all',
          global,
          message: `Package${package_name ? ` "${package_name}"` : 's'} updated ${global ? 'globally' : 'locally'} successfully`,
          output: result.output,
          risk_level: 'MODERATE'
        };

      case 'outdated': {
        let outdated = {};
        try {
          outdated = JSON.parse(result.output);
        } catch {
          // No outdated packages or unparseable output
          outdated = {};
        }
        const outdatedList = Object.entries(outdated).map(([name, info]) => ({
          name,
          current: info.current || 'unknown',
          wanted: info.wanted || 'unknown',
          latest: info.latest || 'unknown'
        }));
        return {
          success: true,
          action: 'outdated',
          outdated: outdatedList,
          count: outdatedList.length,
          global,
          risk_level: 'SAFE'
        };
      }

      case 'cache_clean':
        return {
          success: true,
          action: 'cache_clean',
          message: 'npm cache cleaned successfully',
          output: result.output,
          risk_level: 'MODERATE'
        };
    }
  }
};
