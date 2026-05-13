/**
 * ============================================================
 * Tools Module — Function Calling System
 * ============================================================
 *
 * Central module that registers all tools and exports
 * the registry and executor for use by other modules.
 *
 * @module Tools
 * @version 2.0.0
 */

import registry from './registry.js';
import executor from './executor.js';

// Import all tool definitions — Original tools
import shellExec from './tools/shell-exec.js';
import fileRead from './tools/file-read.js';
import fileWrite from './tools/file-write.js';
import dockerPs from './tools/docker-ps.js';
import dockerLogs from './tools/docker-logs.js';
import serviceStatus from './tools/service-status.js';
import nginxTest from './tools/nginx-test.js';
import pm2List from './tools/pm2-list.js';
import aptInstall from './tools/apt-install.js';
import systemctl from './tools/systemctl.js';
import gitOps from './tools/git-ops.js';
import ragQuery from './tools/rag-query.js';

// Import all tool definitions — Webserver tools
import nginxReload from './tools/nginx-reload.js';
import nginxConfigRead from './tools/nginx-config-read.js';
import nginxConfigWrite from './tools/nginx-config-write.js';

// Import all tool definitions — Process tools
import pm2Restart from './tools/pm2-restart.js';
import pm2Logs from './tools/pm2-logs.js';

// Import all tool definitions — Docker tools
import dockerCompose from './tools/docker-compose.js';
import dockerContainerManage from './tools/docker-container-manage.js';

// Import all tool definitions — Config tools
import envRead from './tools/env-read.js';
import envWrite from './tools/env-write.js';

// Import all tool definitions — System tools
import cronList from './tools/cron-list.js';
import cronManage from './tools/cron-manage.js';
import userManage from './tools/user-manage.js';
import serviceManage from './tools/service-manage.js';
import aptManage from './tools/apt-manage.js';

// Import all tool definitions — Security tools
import firewallStatus from './tools/firewall-status.js';
import firewallManage from './tools/firewall-manage.js';
import sslCertCheck from './tools/ssl-cert-check.js';

// Import all tool definitions — Monitoring tools
import diskUsage from './tools/disk-usage.js';
import memoryInfo from './tools/memory-info.js';
import processList from './tools/process-list.js';
import networkInfo from './tools/network-info.js';
import logRead from './tools/log-read.js';

// Import all tool definitions — Backup tools
import backupCreate from './tools/backup-create.js';

// Import all tool definitions — File tools
import fileManage from './tools/file-manage.js';

// Register all tools
const toolDefinitions = [
  // Original tools
  shellExec,
  fileRead,
  fileWrite,
  dockerPs,
  dockerLogs,
  serviceStatus,
  nginxTest,
  pm2List,
  aptInstall,
  systemctl,
  gitOps,
  ragQuery,

  // Webserver tools
  nginxReload,
  nginxConfigRead,
  nginxConfigWrite,

  // Process tools
  pm2Restart,
  pm2Logs,

  // Docker tools
  dockerCompose,
  dockerContainerManage,

  // Config tools
  envRead,
  envWrite,

  // System tools
  cronList,
  cronManage,
  userManage,
  serviceManage,
  aptManage,

  // Security tools
  firewallStatus,
  firewallManage,
  sslCertCheck,

  // Monitoring tools
  diskUsage,
  memoryInfo,
  processList,
  networkInfo,
  logRead,

  // Backup tools
  backupCreate,

  // File tools
  fileManage
];

// Auto-register on import
for (const tool of toolDefinitions) {
  registry.register(tool);
}

console.log(`[Tools] ${registry.getStats().total} tools registered (${registry.getStats().byRiskLevel.SAFE} SAFE, ${registry.getStats().byRiskLevel.MODERATE} MODERATE, ${registry.getStats().byRiskLevel.CRITICAL} CRITICAL)`);

export { registry, executor };
export default { registry, executor };
