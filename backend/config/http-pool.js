/**
 * HTTP/HTTPS Connection Pool Configuration
 * Améliore les performances en réutilisant les connexions
 */

import http from 'http';
import https from 'https';

/**
 * Agent HTTP avec pool de connexions
 */
export const httpAgent = new http.Agent({
  keepAlive: true,
  keepAliveMsecs: 30000,
  maxSockets: 50,
  maxFreeSockets: 10,
  timeout: 60000,
  scheduling: 'lifo' // Last In First Out pour réutiliser les connexions chaudes
});

/**
 * Agent HTTPS avec pool de connexions
 */
export const httpsAgent = new https.Agent({
  keepAlive: true,
  keepAliveMsecs: 30000,
  maxSockets: 50,
  maxFreeSockets: 10,
  timeout: 60000,
  scheduling: 'lifo',
  // Options SSL/TLS sécurisées
  rejectUnauthorized: true,
  minVersion: 'TLSv1.2'
});

/**
 * Configuration Axios avec pool
 */
export const axiosConfig = {
  httpAgent,
  httpsAgent,
  timeout: 60000,
  maxRedirects: 5,
  // Headers par défaut
  headers: {
    'User-Agent': 'VPS-DevOps-Agent/1.0'
  }
};

/**
 * Nettoyage des agents (à appeler lors du shutdown)
 */
export function destroyAgents() {
  httpAgent.destroy();
  httpsAgent.destroy();
}

export default { httpAgent, httpsAgent, axiosConfig, destroyAgents };
