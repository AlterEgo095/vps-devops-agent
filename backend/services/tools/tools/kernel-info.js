/**
 * Tool: kernel_info — Kernel information and diagnostics
 * Risk: SAFE (read-only monitoring tool)
 */

import { executeCommand } from '../../agent-executor.js';

export default {
  name: 'kernel_info',
  description: 'Retrieve kernel information and diagnostics from the remote server. Supports viewing kernel version and build info, listing loaded kernel modules, reading kernel parameters (sysctl), and getting detailed kernel version strings. Use this tool to diagnose kernel-related issues, check module availability, verify kernel parameters, and gather system information for troubleshooting. All actions are safe read-only operations.',
  parameters: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        description: 'Kernel information action to perform',
        enum: ['info', 'modules', 'parameters', 'version']
      },
      module_name: {
        type: 'string',
        description: 'Specific kernel module name to query (e.g., "nf_conntrack", "br_netfilter", "overlay"). Used with modules action to get details about a specific module. If omitted, lists all loaded modules.'
      },
      param_name: {
        type: 'string',
        description: 'Specific kernel parameter name to query (e.g., "net.ipv4.ip_forward", "vm.swappiness"). Used with parameters action. If omitted, lists all kernel parameters.'
      }
    },
    required: ['action']
  },
  risk_level: 'SAFE',
  needs_approval: false,
  category: 'monitoring',

  async implementation(serverConfig, args, context) {
    const { action, module_name, param_name } = args;

    // Validate action
    const validActions = ['info', 'modules', 'parameters', 'version'];
    if (!validActions.includes(action)) {
      return {
        success: false,
        error: `Invalid action: ${action}. Must be one of: ${validActions.join(', ')}`
      };
    }

    // Validate module_name format if provided
    if (module_name) {
      const validModulePattern = /^[a-zA-Z0-9_][a-zA-Z0-9_.-]*$/;
      if (!validModulePattern.test(module_name)) {
        return {
          success: false,
          error: `Invalid module name: ${module_name}`
        };
      }
    }

    // Validate param_name format if provided
    if (param_name) {
      const validParamPattern = /^[a-zA-Z0-9_.][a-zA-Z0-9_.\-/]*$/;
      if (!validParamPattern.test(param_name)) {
        return {
          success: false,
          error: `Invalid parameter name: ${param_name}`
        };
      }
    }

    let command;

    switch (action) {
      case 'info': {
        // Comprehensive kernel info
        command = 'echo "=== Kernel Release ===" && uname -r && echo "" && echo "=== Kernel Version ===" && uname -v && echo "" && echo "=== Machine Hardware ===" && uname -m && echo "" && echo "=== OS ===" && uname -o && echo "" && echo "=== Hostname ===" && uname -n && echo "" && echo "=== Uptime ===" && uptime && echo "" && echo "=== Kernel cmdline ===" && cat /proc/cmdline 2>/dev/null || echo "Unable to read /proc/cmdline" 2>&1';
        break;
      }
      case 'modules': {
        if (module_name) {
          // Get info about a specific module
          command = `modinfo "${module_name}" 2>&1`;
        } else {
          // List all loaded modules
          command = 'lsmod 2>&1';
        }
        break;
      }
      case 'parameters': {
        if (param_name) {
          // Get a specific kernel parameter
          command = `sysctl -n "${param_name}" 2>&1`;
        } else {
          // List all kernel parameters
          command = 'sysctl -a 2>/dev/null | head -500 2>&1';
        }
        break;
      }
      case 'version': {
        command = 'uname -r && echo "" && cat /proc/version 2>/dev/null || echo "Unable to read /proc/version" 2>&1';
        break;
      }
    }

    const result = await executeCommand(serverConfig, command);

    if (!result.success) {
      // Check for common errors
      if (result.output?.includes('Unknown parameter') || result.output?.includes('cannot stat')) {
        return {
          success: false,
          error: `Kernel parameter "${param_name}" not found`,
          exit_code: result.exit_code
        };
      }
      if (result.output?.includes('Module') && result.output?.includes('not found')) {
        return {
          success: false,
          error: `Kernel module "${module_name}" not found`,
          exit_code: result.exit_code
        };
      }
      if (result.output?.includes('permission denied') || result.output?.includes('Operation not permitted')) {
        return {
          success: false,
          error: 'Permission denied. Some kernel information requires elevated privileges.',
          exit_code: result.exit_code
        };
      }
      return {
        success: false,
        error: result.error || `Failed to retrieve kernel ${action}`,
        exit_code: result.exit_code,
        output: result.output
      };
    }

    // Process results based on action
    switch (action) {
      case 'info': {
        // Parse the structured output
        const outputLines = result.output.split('\n');
        const info = {};
        for (const line of outputLines) {
          if (line.startsWith('Kernel Release:')) info.kernel_release = line.split('=== Kernel Release ===').join('').trim() || outputLines[1]?.trim();
        }
        // Simple structured parsing
        let currentSection = '';
        const sections = {};
        for (const line of outputLines) {
          if (line.includes('===')) {
            currentSection = line.replace(/=/g, '').trim();
            sections[currentSection] = [];
          } else if (currentSection && line.trim()) {
            sections[currentSection].push(line.trim());
          }
        }
        return {
          success: true,
          action: 'info',
          kernel_release: sections['Kernel Release']?.[0] || 'unknown',
          kernel_version: sections['Kernel Version']?.[0] || 'unknown',
          architecture: sections['Machine Hardware']?.[0] || 'unknown',
          os: sections['OS']?.[0] || 'unknown',
          hostname: sections['Hostname']?.[0] || 'unknown',
          uptime: sections['Uptime']?.join(' ') || 'unknown',
          kernel_cmdline: sections['Kernel cmdline']?.join(' ') || 'unknown',
          raw_output: result.output
        };
      }

      case 'modules': {
        if (module_name) {
          // Parse modinfo output
          const moduleInfo = {};
          const infoLines = result.output.trim().split('\n');
          for (const line of infoLines) {
            const colonIndex = line.indexOf(':');
            if (colonIndex > 0) {
              const key = line.substring(0, colonIndex).trim().replace(/\s+/g, '_').toLowerCase();
              const value = line.substring(colonIndex + 1).trim();
              moduleInfo[key] = value;
            }
          }
          return {
            success: true,
            action: 'modules',
            module: module_name,
            info: moduleInfo,
            raw_output: result.output
          };
        } else {
          // Parse lsmod output
          const modLines = result.output.trim().split('\n');
          const modules = modLines.slice(1) // Skip header
            .filter(line => line.trim())
            .map(line => {
              const parts = line.trim().split(/\s+/);
              return {
                name: parts[0],
                size: parts[1] || '0',
                used_by: parts[2] || '0',
                dependencies: parts.slice(3).join(' ') || ''
              };
            });
          return {
            success: true,
            action: 'modules',
            modules,
            count: modules.length,
            message: `${modules.length} kernel modules currently loaded`
          };
        }
      }

      case 'parameters': {
        if (param_name) {
          return {
            success: true,
            action: 'parameters',
            parameter: param_name,
            value: result.output.trim(),
            message: `Kernel parameter "${param_name}" = "${result.output.trim()}"`
          };
        } else {
          // Parse all kernel parameters
          const params = result.output.trim().split('\n')
            .filter(line => line.includes('='))
            .map(line => {
              const eqIndex = line.indexOf('=');
              return {
                name: line.substring(0, eqIndex).trim(),
                value: line.substring(eqIndex + 1).trim()
              };
            });
          return {
            success: true,
            action: 'parameters',
            parameters: params,
            count: params.length,
            message: `Retrieved ${params.length} kernel parameters (showing first 500)`
          };
        }
      }

      case 'version': {
        const lines = result.output.trim().split('\n').filter(l => l.trim());
        return {
          success: true,
          action: 'version',
          kernel_release: lines[0] || 'unknown',
          full_version: lines.slice(1).join(' ') || 'unknown',
          raw_output: result.output
        };
      }
    }
  }
};
