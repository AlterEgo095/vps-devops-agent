/**
 * Tool: apt_install — Install packages via apt
 * Risk: CRITICAL (system modification)
 */

import { executeCommand } from '../../agent-executor.js';

export default {
  name: 'apt_install',
  description: 'Install one or more packages on the remote server using apt. This is a CRITICAL operation that modifies the system and requires approval. Runs apt update before install.',
  parameters: {
    type: 'object',
    properties: {
      packages: {
        type: 'array',
        description: 'List of package names to install',
        items: { type: 'string' }
      },
      update_first: {
        type: 'boolean',
        description: 'Run apt update before installing',
        default: true
      },
      yes: {
        type: 'boolean',
        description: 'Use -y flag for non-interactive install',
        default: true
      }
    },
    required: ['packages']
  },
  risk_level: 'CRITICAL',
  needs_approval: true,
  category: 'package',

  async implementation(serverConfig, args) {
    const { packages, update_first = true, yes = true } = args;

    if (!packages || packages.length === 0) {
      return { success: false, error: 'No packages specified' };
    }

    // Validate package names (only alphanumeric, dash, dot, plus)
    const validPattern = /^[a-zA-Z0-9][a-zA-Z0-9.\-+]*$/;
    for (const pkg of packages) {
      if (!validPattern.test(pkg)) {
        return { success: false, error: `Invalid package name: ${pkg}` };
      }
    }

    const packageList = packages.join(' ');
    const yesFlag = yes ? '-y' : '';

    let output = '';

    // Update if requested
    if (update_first) {
      const updateResult = await executeCommand(
        serverConfig,
        `apt update ${yesFlag} 2>&1`,
      );
      output += '[APT UPDATE]\n' + (updateResult.output || updateResult.error) + '\n';
    }

    // Install packages
    const installResult = await executeCommand(
      serverConfig,
      `apt install ${yesFlag} ${packageList} 2>&1`,
    );

    output += '[APT INSTALL]\n' + (installResult.output || installResult.error);

    return {
      success: installResult.success,
      packages_installed: packages,
      output,
      exit_code: installResult.exit_code
    };
  }
};
