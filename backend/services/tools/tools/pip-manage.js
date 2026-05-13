/**
 * Tool: pip_manage — Manage Python packages via pip
 * Risk: MODERATE (installs/removes packages)
 */

import { executeCommand } from '../../agent-executor.js';

export default {
  name: 'pip_manage',
  description: 'Manage Python packages on the remote server using pip. Install, uninstall, list, or upgrade Python packages.',
  parameters: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: ['install', 'uninstall', 'list', 'upgrade', 'show'],
        description: 'Action to perform: "install", "uninstall", "list", "upgrade", "show" (package details)'
      },
      package: {
        type: 'string',
        description: 'Package name (required for install, uninstall, upgrade, show). Not needed for "list".'
      },
      pip_command: {
        type: 'string',
        enum: ['pip', 'pip3', 'pipx'],
        description: 'Pip command to use. Default: "pip3"',
        default: 'pip3'
      },
      virtualenv: {
        type: 'string',
        description: 'Path to virtual environment to activate before running pip'
      },
      requirements_file: {
        type: 'string',
        description: 'Path to requirements.txt file (for install action only)'
      }
    },
    required: ['action']
  },
  risk_level: 'MODERATE',
  needs_approval: false,
  category: 'system',

  async implementation(serverConfig, args) {
    const { action, package: pkg, pip_command = 'pip3', virtualenv, requirements_file } = args;

    if (!action) {
      return { success: false, error: 'action is required' };
    }

    const validPip = ['pip', 'pip3', 'pipx'].includes(pip_command) ? pip_command : 'pip3';
    let command = '';

    // Build virtualenv activation prefix if needed
    const venvPrefix = virtualenv
      ? `source "${virtualenv.replace(/[;&|`$()]/g, '')}/bin/activate" && `
      : '';

    switch (action) {
      case 'install':
        if (requirements_file) {
          const sanitizedReqFile = requirements_file.replace(/[;&|`$()]/g, '');
          command = `${venvPrefix}${validPip} install -r "${sanitizedReqFile}" 2>&1`;
        } else if (pkg) {
          const sanitizedPkg = pkg.replace(/[;&|`$()]/g, '');
          command = `${venvPrefix}${validPip} install "${sanitizedPkg}" 2>&1`;
        } else {
          return { success: false, error: 'package or requirements_file is required for install' };
        }
        break;

      case 'uninstall':
        if (!pkg) return { success: false, error: 'package is required for uninstall' };
        command = `${venvPrefix}${validPip} uninstall -y "${pkg.replace(/[;&|`$()]/g, '')}" 2>&1`;
        break;

      case 'list':
        command = `${venvPrefix}${validPip} list 2>&1`;
        break;

      case 'upgrade':
        if (!pkg) return { success: false, error: 'package is required for upgrade' };
        command = `${venvPrefix}${validPip} install --upgrade "${pkg.replace(/[;&|`$()]/g, '')}" 2>&1`;
        break;

      case 'show':
        if (!pkg) return { success: false, error: 'package is required for show' };
        command = `${venvPrefix}${validPip} show "${pkg.replace(/[;&|`$()]/g, '')}" 2>&1`;
        break;

      default:
        return { success: false, error: `Unknown action: ${action}` };
    }

    const result = await executeCommand(serverConfig, command, { timeout: 120000 });

    return {
      success: result.success,
      action,
      package: pkg,
      output: result.output,
      exit_code: result.exit_code
    };
  }
};
