import Docker from 'dockerode';
import { v4 as uuidv4 } from 'uuid';

const docker = new Docker({ socketPath: '/var/run/docker.sock' });

/**
 * Execute command in isolated Docker container
 */
export async function executeSandboxed(command, options = {}) {
  const {
    timeout = 300000,
    memoryLimit = 512 * 1024 * 1024,
    cpuQuota = 100000,
    workDir = '/workspace',
    image = 'node:20-alpine',
    env = {}
  } = options;

  const containerId = `sandbox-${uuidv4()}`;
  let container = null;
  let output = { stdout: '', stderr: '', exitCode: null };

  try {
    container = await docker.createContainer({
      Image: image,
      name: containerId,
      Cmd: ['sh', '-c', command],
      WorkingDir: workDir,
      Env: Object.entries(env).map(([k, v]) => `${k}=${v}`),
      HostConfig: {
        Memory: memoryLimit,
        CpuQuota: cpuQuota,
        CpuPeriod: 100000,
        NetworkMode: 'none',
        ReadonlyRootfs: false,
        AutoRemove: true,
        SecurityOpt: ['no-new-privileges']
      }
    });

    await container.start();

    const result = await Promise.race([
      container.wait(),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Timeout exceeded')), timeout)
      )
    ]);

    output.exitCode = result.StatusCode;

    const logs = await container.logs({
      stdout: true,
      stderr: true,
      follow: false
    });

    const logString = logs.toString('utf8');
    const lines = logString.split('\n');
    
    lines.forEach(line => {
      if (line.length > 8) {
        const streamType = line.charCodeAt(0);
        const content = line.substring(8);
        if (streamType === 1) {
          output.stdout += content + '\n';
        } else if (streamType === 2) {
          output.stderr += content + '\n';
        }
      }
    });

    return {
      success: output.exitCode === 0,
      stdout: output.stdout.trim(),
      stderr: output.stderr.trim(),
      exitCode: output.exitCode,
      containerId
    };

  } catch (error) {
    if (container) {
      try {
        await container.stop({ t: 1 });
      } catch (e) {
        console.error('Error stopping container:', e.message);
      }
    }

    return {
      success: false,
      stdout: output.stdout,
      stderr: error.message,
      exitCode: -1,
      error: error.message
    };
  }
}

/**
 * Execute command with filesystem access
 */
export async function executeSandboxedWithMount(command, localPath, options = {}) {
  const {
    timeout = 300000,
    memoryLimit = 1024 * 1024 * 1024,
    workDir = '/workspace',
    image = 'node:20-alpine'
  } = options;

  const containerId = `sandbox-mount-${uuidv4()}`;
  let container = null;

  try {
    container = await docker.createContainer({
      Image: image,
      name: containerId,
      Cmd: ['sh', '-c', command],
      WorkingDir: workDir,
      HostConfig: {
        Memory: memoryLimit,
        Binds: [`${localPath}:${workDir}`],
        NetworkMode: 'bridge',
        AutoRemove: true,
        SecurityOpt: ['no-new-privileges']
      }
    });

    await container.start();

    const result = await Promise.race([
      container.wait(),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Timeout exceeded')), timeout)
      )
    ]);

    const logs = await container.logs({
      stdout: true,
      stderr: true,
      follow: false
    });

    const logString = logs.toString('utf8');
    let stdout = '', stderr = '';
    
    logString.split('\n').forEach(line => {
      if (line.length > 8) {
        const streamType = line.charCodeAt(0);
        const content = line.substring(8);
        if (streamType === 1) stdout += content + '\n';
        else if (streamType === 2) stderr += content + '\n';
      }
    });

    return {
      success: result.StatusCode === 0,
      stdout: stdout.trim(),
      stderr: stderr.trim(),
      exitCode: result.StatusCode,
      containerId
    };

  } catch (error) {
    if (container) {
      try {
        await container.stop({ t: 1 });
      } catch (e) {
        console.error('Error stopping container:', e.message);
      }
    }

    return {
      success: false,
      stdout: '',
      stderr: error.message,
      exitCode: -1,
      error: error.message
    };
  }
}

/**
 * Ensure Docker image is available
 */
export async function ensureImage(imageName) {
  try {
    await docker.getImage(imageName).inspect();
    return true;
  } catch (error) {
    console.log(`Pulling image ${imageName}...`);
    await new Promise((resolve, reject) => {
      docker.pull(imageName, (err, stream) => {
        if (err) return reject(err);
        docker.modem.followProgress(stream, (err, output) => {
          err ? reject(err) : resolve(output);
        });
      });
    });
    return true;
  }
}

export default {
  executeSandboxed,
  executeSandboxedWithMount,
  ensureImage
};
