/**
 * Monitoring Service
 * Collects system and application metrics for monitoring dashboard
 * SÉCURITÉ: Utilise secure-exec au lieu de child_process.exec
 */

import os from 'os';
import { promises as fs } from 'fs';
// SÉCURITÉ: Remplacer exec par secure-exec
import { secureExec } from './secure-exec.js';

// Store for application metrics
const appMetrics = {
    requests: {
        total: 0,
        success: 0,
        error: 0,
        byEndpoint: {},
        byMethod: {},
    },
    latency: {
        avg: 0,
        min: Infinity,
        max: 0,
        p95: 0,
        samples: []
    },
    errors: {
        total: 0,
        byType: {},
        lastErrors: []
    },
    startTime: Date.now(),
    uptime: 0
};

/**
 * Collect system metrics (CPU, RAM, Disk, Network)
 */
export async function collectSystemMetrics() {
    try {
        const metrics = {
            timestamp: new Date().toISOString(),
            cpu: await getCPUMetrics(),
            memory: getMemoryMetrics(),
            disk: await getDiskMetrics(),
            network: await getNetworkMetrics(),
            process: getProcessMetrics()
        };

        return metrics;
    } catch (error) {
        console.error('Error collecting system metrics:', error);
        throw error;
    }
}

/**
 * Get CPU metrics
 */
async function getCPUMetrics() {
    const cpus = os.cpus();
    const loadAvg = os.loadavg();
    
    // Calculate CPU usage percentage
    let totalIdle = 0;
    let totalTick = 0;
    
    cpus.forEach(cpu => {
        for (let type in cpu.times) {
            totalTick += cpu.times[type];
        }
        totalIdle += cpu.times.idle;
    });
    
    const idle = totalIdle / cpus.length;
    const total = totalTick / cpus.length;
    const usage = 100 - ~~(100 * idle / total);
    
    return {
        cores: cpus.length,
        model: cpus[0].model,
        speed: cpus[0].speed,
        usage: usage,
        loadAverage: {
            '1min': loadAvg[0].toFixed(2),
            '5min': loadAvg[1].toFixed(2),
            '15min': loadAvg[2].toFixed(2)
        }
    };
}

/**
 * Get memory metrics
 */
function getMemoryMetrics() {
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;
    
    return {
        total: totalMem,
        free: freeMem,
        used: usedMem,
        usagePercent: ((usedMem / totalMem) * 100).toFixed(2),
        totalGB: (totalMem / (1024 ** 3)).toFixed(2),
        freeGB: (freeMem / (1024 ** 3)).toFixed(2),
        usedGB: (usedMem / (1024 ** 3)).toFixed(2)
    };
}

/**
 * Get disk metrics
 * SÉCURITÉ: Utilise secureExec au lieu de execAsync
 */
async function getDiskMetrics() {
    try {
        // SÉCURITÉ: Commande sécurisée avec arguments séparés
        const { stdout } = await secureExec('df', ['-h', '/'], {
            timeout: 5000
        });
        
        const lines = stdout.trim().split('\n');
        const dataLine = lines[lines.length - 1];
        const parts = dataLine.trim().split(/\s+/);
        
        return {
            filesystem: parts[0] || 'unknown',
            size: parts[1] || '0',
            used: parts[2] || '0',
            available: parts[3] || '0',
            usagePercent: parts[4] || '0%',
            mountPoint: parts[5] || '/'
        };
    } catch (error) {
        console.error('Error getting disk metrics:', error.message);
        return {
            filesystem: 'unknown',
            size: '0',
            used: '0',
            available: '0',
            usagePercent: '0%',
            mountPoint: '/'
        };
    }
}

/**
 * Get network metrics
 */
async function getNetworkMetrics() {
    const networkInterfaces = os.networkInterfaces();
    const interfaces = [];
    
    for (const [name, nets] of Object.entries(networkInterfaces)) {
        if (nets) {
            const ipv4 = nets.find(net => net.family === 'IPv4');
            const ipv6 = nets.find(net => net.family === 'IPv6');
            
            if (ipv4 || ipv6) {
                interfaces.push({
                    name,
                    ipv4: ipv4 ? ipv4.address : null,
                    ipv6: ipv6 ? ipv6.address : null,
                    mac: ipv4 ? ipv4.mac : (ipv6 ? ipv6.mac : null)
                });
            }
        }
    }
    
    return { interfaces };
}

/**
 * Get process metrics
 */
function getProcessMetrics() {
    const memUsage = process.memoryUsage();
    
    return {
        pid: process.pid,
        uptime: process.uptime(),
        memory: {
            rss: memUsage.rss,
            heapTotal: memUsage.heapTotal,
            heapUsed: memUsage.heapUsed,
            external: memUsage.external,
            rssGB: (memUsage.rss / (1024 ** 3)).toFixed(2),
            heapUsedGB: (memUsage.heapUsed / (1024 ** 3)).toFixed(2)
        },
        cpu: process.cpuUsage()
    };
}

/**
 * Get application metrics
 */
export function getAppMetrics() {
    appMetrics.uptime = Date.now() - appMetrics.startTime;
    
    // Calculate average latency
    if (appMetrics.latency.samples.length > 0) {
        const sum = appMetrics.latency.samples.reduce((a, b) => a + b, 0);
        appMetrics.latency.avg = (sum / appMetrics.latency.samples.length).toFixed(2);
        
        // Calculate p95
        const sorted = [...appMetrics.latency.samples].sort((a, b) => a - b);
        const p95Index = Math.floor(sorted.length * 0.95);
        appMetrics.latency.p95 = sorted[p95Index] || 0;
    }
    
    return appMetrics;
}

/**
 * Record request metrics
 */
export function recordRequest(method, endpoint, statusCode, latency) {
    appMetrics.requests.total++;
    
    if (statusCode >= 200 && statusCode < 400) {
        appMetrics.requests.success++;
    } else {
        appMetrics.requests.error++;
    }
    
    // Track by endpoint
    if (!appMetrics.requests.byEndpoint[endpoint]) {
        appMetrics.requests.byEndpoint[endpoint] = 0;
    }
    appMetrics.requests.byEndpoint[endpoint]++;
    
    // Track by method
    if (!appMetrics.requests.byMethod[method]) {
        appMetrics.requests.byMethod[method] = 0;
    }
    appMetrics.requests.byMethod[method]++;
    
    // Record latency
    appMetrics.latency.samples.push(latency);
    appMetrics.latency.min = Math.min(appMetrics.latency.min, latency);
    appMetrics.latency.max = Math.max(appMetrics.latency.max, latency);
    
    // Keep only last 1000 samples
    if (appMetrics.latency.samples.length > 1000) {
        appMetrics.latency.samples.shift();
    }
}

/**
 * Record error metrics
 */
export function recordError(errorType, errorMessage) {
    appMetrics.errors.total++;
    
    if (!appMetrics.errors.byType[errorType]) {
        appMetrics.errors.byType[errorType] = 0;
    }
    appMetrics.errors.byType[errorType]++;
    
    appMetrics.errors.lastErrors.push({
        type: errorType,
        message: errorMessage,
        timestamp: new Date().toISOString()
    });
    
    // Keep only last 100 errors
    if (appMetrics.errors.lastErrors.length > 100) {
        appMetrics.errors.lastErrors.shift();
    }
}

/**
 * Reset metrics
 */
export function resetMetrics() {
    appMetrics.requests = {
        total: 0,
        success: 0,
        error: 0,
        byEndpoint: {},
        byMethod: {}
    };
    appMetrics.latency = {
        avg: 0,
        min: Infinity,
        max: 0,
        p95: 0,
        samples: []
    };
    appMetrics.errors = {
        total: 0,
        byType: {},
        lastErrors: []
    };
}

export default {
    collectSystemMetrics,
    getAppMetrics,
    recordRequest,
    recordError,
    resetMetrics
};
