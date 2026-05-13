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

// Import all tool definitions
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

// Register all tools
const toolDefinitions = [
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
  ragQuery
];

// Auto-register on import
for (const tool of toolDefinitions) {
  registry.register(tool);
}

console.log(`[Tools] ${registry.getStats().total} tools registered (${registry.getStats().byRiskLevel.SAFE} SAFE, ${registry.getStats().byRiskLevel.MODERATE} MODERATE, ${registry.getStats().byRiskLevel.CRITICAL} CRITICAL)`);

export { registry, executor };
export default { registry, executor };
