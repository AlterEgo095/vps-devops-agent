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

// Import all tool definitions — Docker advanced tools
import dockerImageManage from './tools/docker-image-manage.js';
import dockerNetworkManage from './tools/docker-network-manage.js';
import dockerVolumeManage from './tools/docker-volume-manage.js';

// Import all tool definitions — Security advanced tools
import certbotManage from './tools/certbot-manage.js';

// Import all tool definitions — System advanced tools
import swapManage from './tools/swap-manage.js';
import npmManage from './tools/npm-manage.js';

// Import all tool definitions — Monitoring advanced tools
import dnsCheck from './tools/dns-check.js';
import kernelInfo from './tools/kernel-info.js';

// Import all tool definitions — Process extended tools
import pm2Start from './tools/pm2-start.js';
import pm2Stop from './tools/pm2-stop.js';
import pm2Delete from './tools/pm2-delete.js';
import pm2Describe from './tools/pm2-describe.js';
import pm2Save from './tools/pm2-save.js';

// Import all tool definitions — Docker extended tools
import dockerBuild from './tools/docker-build.js';
import dockerExec from './tools/docker-exec.js';
import dockerLogsTail from './tools/docker-logs-tail.js';
import composeValidate from './tools/compose-validate.js';
import dockerPrune from './tools/docker-prune.js';

// Import all tool definitions — Nginx extended tools
import nginxSitesList from './tools/nginx-sites-list.js';

// Import all tool definitions — System extended tools
import systemUpdate from './tools/system-update.js';
import systemInfo from './tools/system-info.js';
import uptimeCheck from './tools/uptime-check.js';
import portCheck from './tools/port-check.js';
import curlCheck from './tools/curl-check.js';
import pipManage from './tools/pip-manage.js';

// Import all tool definitions — File extended tools
import fileSearch from './tools/file-search.js';

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
  fileManage,

  // Docker advanced tools
  dockerImageManage,
  dockerNetworkManage,
  dockerVolumeManage,

  // Security advanced tools
  certbotManage,

  // System advanced tools
  swapManage,
  npmManage,

  // Monitoring advanced tools
  dnsCheck,
  kernelInfo,

  // Process extended tools
  pm2Start,
  pm2Stop,
  pm2Delete,
  pm2Describe,
  pm2Save,

  // Docker extended tools
  dockerBuild,
  dockerExec,
  dockerLogsTail,
  composeValidate,
  dockerPrune,

  // Nginx extended tools
  nginxSitesList,

  // System extended tools
  systemUpdate,
  systemInfo,
  uptimeCheck,
  portCheck,
  curlCheck,
  pipManage,

  // File extended tools
  fileSearch
];

// Auto-register on import
for (const tool of toolDefinitions) {
  registry.register(tool);
}

console.log(`[Tools] ${registry.getStats().total} tools registered (${registry.getStats().byRiskLevel.SAFE} SAFE, ${registry.getStats().byRiskLevel.MODERATE} MODERATE, ${registry.getStats().byRiskLevel.CRITICAL} CRITICAL)`);

export { registry, executor };
export default { registry, executor };
