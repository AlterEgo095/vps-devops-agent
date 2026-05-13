/**
 * Tool: pm2_start — Start a new PM2 process
 * Risk: MODERATE (starts a new process)
 */

import { executeCommand } from '../../agent-executor.js';

export default {
  name: 'pm2_start',
  description: 'Start a new process with PM2 on the remote server. Supports Node.js scripts, npm commands, and other executable scripts. The process will be daemonized and auto-restarted on failure.',
  parameters: {
    type: 'object',
    properties: {
      script: {
        type: 'string',
        description: 'Path to the script or command to start (e.g. "app.js", "npm run start", "ecosystem.config.js")'
      },
      name: {
        type: 'string',
        description: 'Name for the PM2 process (optional, defaults to script filename)'
      },
      interpreter: {
        type: 'string',
        description: 'Interpreter to use (e.g. "node", "python3", "bash"). Default: auto-detected'
      },
      cwd: {
        type: 'string',
        description: 'Working directory for the process'
      },
      instances: {
        type: 'number',
        description: 'Number of instances to start (for cluster mode). Default: 1'
      },
      env_vars: {
        type: 'string',
        description: 'Environment variables as KEY=VALUE pairs separated by spaces (e.g. "NODE_ENV=production PORT=3000")'
      },
      args: {
        type: 'string',
        description: 'Additional arguments to pass to the script'
      }
    },
    required: ['script']
  },
  risk_level: 'MODERATE',
  needs_approval: false,
  category: 'process',

  async implementation(serverConfig, args) {
    const { script, name, interpreter, cwd, instances, env_vars, args: scriptArgs } = args;

    if (!script) {
      return { success: false, error: 'script is required' };
    }

    // Build PM2 start command
    let command = 'pm2 start';

    // Sanitize and add script
    const sanitizedScript = script.replace(/[;&|`$()]/g, '');
    command += ` ${sanitizedScript}`;

    // Add name if specified
    if (name) {
      const sanitizedName = name.replace(/[;&|`$()]/g, '');
      command += ` --name "${sanitizedName}"`;
    }

    // Add interpreter if specified
    if (interpreter) {
      const sanitizedInterpreter = interpreter.replace(/[;&|`$()]/g, '');
      command += ` --interpreter "${sanitizedInterpreter}"`;
    }

    // Add working directory
    if (cwd) {
      const sanitizedCwd = cwd.replace(/[;&|`$()]/g, '');
      command += ` --cwd "${sanitizedCwd}"`;
    }

    // Add instances for cluster mode
    if (instances && instances > 1) {
      command += ` -i ${Math.min(instances, 16)}`;
    }

    // Add environment variables
    if (env_vars) {
      // Only allow KEY=VALUE format
      const envPairs = env_vars.split(/\s+/).filter(pair => /^[A-Za-z_][A-Za-z0-9_]*=.+$/.test(pair));
      if (envPairs.length > 0) {
        command += ` --env ${envPairs.join(' ')}`;
      }
    }

    // Add script arguments
    if (scriptArgs) {
      const sanitizedArgs = scriptArgs.replace(/[;&|`$()]/g, '');
      command += ` -- ${sanitizedArgs}`;
    }

    command += ' 2>&1';

    const result = await executeCommand(serverConfig, command);

    if (!result.success) {
      return {
        success: false,
        error: result.error || 'Failed to start PM2 process',
        exit_code: result.exit_code
      };
    }

    // Get the updated process list
    const listResult = await executeCommand(serverConfig, 'pm2 list 2>&1');

    return {
      success: true,
      message: `PM2 process started successfully: ${name || script}`,
      script,
      name: name || script,
      output: result.output,
      process_list: listResult.success ? listResult.output : undefined
    };
  }
};
