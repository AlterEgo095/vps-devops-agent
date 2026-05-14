/**
 * Server Metrics Route - Real-time SSH-based metrics collection
 * Collects CPU, RAM, Disk, Network data from remote servers
 * Uses a single combined SSH command to avoid channel limits
 * Updates the servers table with fresh metrics
 */

import express from 'express';
import { Client } from 'ssh2';
import { db } from '../services/database-sqlite.js';
import { authenticateToken } from '../middleware/auth.js';
import { decryptPassword } from '../services/crypto-manager.js';

const router = express.Router();
router.use(authenticateToken);

/**
 * Execute a single SSH command and return output
 */
function sshExec(conn, command, timeout = 20000) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            reject(new Error(`SSH command timeout after ${timeout}ms`));
        }, timeout);
        
        conn.exec(command, (err, stream) => {
            if (err) { clearTimeout(timer); return reject(err); }
            let stdout = '', stderr = '';
            stream.on('data', (data) => { stdout += data.toString(); });
            stream.stderr.on('data', (data) => { stderr += data.toString(); });
            stream.on('close', (code) => {
                clearTimeout(timer);
                resolve({ stdout, stderr, code });
            });
        });
    });
}

/**
 * Create SSH connection to a server
 */
function createSSHConnection(server) {
    return new Promise((resolve, reject) => {
        const conn = new Client();
        const timeout = setTimeout(() => {
            conn.end();
            reject(new Error('SSH connection timeout'));
        }, 20000);
        
        conn.on('ready', () => {
            clearTimeout(timeout);
            resolve(conn);
        });
        
        conn.on('error', (err) => {
            clearTimeout(timeout);
            reject(err);
        });
        
        const connConfig = {
            host: server.host,
            port: server.port || 22,
            username: server.username,
            readyTimeout: 15000,
            tryKeyboard: true
        };
        
        if (server.auth_type === 'key' || server.auth_type === 'ssh_key') {
            connConfig.privateKey = server.encrypted_credentials;
        } else {
            try {
                connConfig.password = decryptPassword(server.encrypted_credentials);
            } catch (e) {
                connConfig.password = server.encrypted_credentials;
            }
        }
        
        // Handler pour keyboard-interactive (nécessaire pour certains serveurs PAM)
        conn.on('keyboard-interactive', (name, instructions, lang, prompts, finish) => {
            const password = connConfig.password || '';
            finish(prompts.map(() => password));
        });
        
        conn.connect(connConfig);
    });
}

/**
 * Collect comprehensive metrics from a remote server via SSH
 * Uses a SINGLE combined command to avoid MaxSessions/channel issues
 */
async function collectRemoteMetrics(server) {
    let conn;
    try {
        conn = await createSSHConnection(server);
        
        // Single combined command - all metrics in one SSH exec
        // Each section separated by unique delimiters for reliable parsing
        const combinedCommand = `echo "===CPU===" && grep 'cpu ' /proc/stat | awk '{usage=($2+$4)*100/($2+$4+$5)} END {print usage}' && echo "===CORES===" && nproc && echo "===MODEL===" && lscpu 2>/dev/null | grep 'Model name' | head -1 | sed 's/Model name:\\s*//' && echo "===MEM===" && free -b | grep Mem && echo "===SWAP===" && free -b | grep Swap && echo "===DISK===" && df -B1 / | tail -1 && echo "===UPTIME===" && cat /proc/uptime | awk '{print int($1)}' && echo "===OS===" && head -2 /etc/os-release | sed 's/.*=//;s/"//g' | tr '\\n' ' ' && echo "===KERNEL===" && uname -r && echo "===LOAD===" && cat /proc/loadavg && echo "===DOCKER===" && (docker ps -q 2>/dev/null | wc -l; echo '---'; docker ps -a -q 2>/dev/null | wc -l) 2>/dev/null || echo '0---0'`;
        
        const result = await sshExec(conn, combinedCommand);
        const output = result.stdout;
        
        if (!output || output.length < 20) {
            throw new Error('Empty metrics response from server');
        }
        
        // Parse the delimited output
        const sections = {};
        const sectionRegex = /===(\w+)===\s*([\s\S]*?)(?====|$)/g;
        let match;
        while ((match = sectionRegex.exec(output)) !== null) {
            sections[match[1]] = match[2].trim();
        }
        
        // Parse CPU usage
        const cpuUsage = Math.round(parseFloat(sections.CPU) * 10) / 10 || 0;
        const cpuCores = parseInt(sections.CORES) || 1;
        const cpuModel = sections.MODEL || 'Unknown';
        
        // Parse Memory
        const memParts = (sections.MEM || '').trim().split(/\s+/);
        const memTotal = parseInt(memParts[1]) || 1;
        const memUsed = parseInt(memParts[2]) || 0;
        const memAvailable = parseInt(memParts[6]) || 0;
        const memPercent = memTotal > 0 ? Math.round((memUsed / memTotal) * 100 * 10) / 10 : 0;
        
        // Parse Swap
        const swapParts = (sections.SWAP || '').trim().split(/\s+/);
        const swapTotal = parseInt(swapParts[1]) || 0;
        const swapUsed = parseInt(swapParts[2]) || 0;
        
        // Parse Disk
        const diskParts = (sections.DISK || '').trim().split(/\s+/);
        const diskTotal = parseInt(diskParts[1]) || 1;
        const diskUsed = parseInt(diskParts[2]) || 0;
        const diskPercent = parseFloat((diskParts[4] || '0').replace('%', '')) || 0;
        
        // Parse Uptime
        const uptimeSeconds = parseInt(sections.UPTIME) || 0;
        
        // Parse OS
        const osInfo = [sections.OS, sections.KERNEL].filter(Boolean).join(' | ') || 'Unknown';
        
        // Parse Load Average
        const loadParts = (sections.LOAD || '0 0 0').trim().split(/\s+/);
        const loadAverage = [
            parseFloat(loadParts[0]) || 0,
            parseFloat(loadParts[1]) || 0,
            parseFloat(loadParts[2]) || 0
        ];
        
        // Parse Docker
        const dockerParts = (sections.DOCKER || '0---0').split('---');
        const dockerRunning = parseInt(dockerParts[0]) || 0;
        const dockerTotal = parseInt(dockerParts[1]) || 0;
        
        // Build metrics object
        const metrics = {
            cpu: {
                usage: cpuUsage,
                cores: cpuCores,
                model: cpuModel,
                loadAverage: loadAverage
            },
            memory: {
                total: memTotal,
                used: memUsed,
                available: memAvailable,
                percent: memPercent,
                totalGB: Math.round(memTotal / 1073741824 * 100) / 100,
                usedGB: Math.round(memUsed / 1073741824 * 100) / 100,
                availableGB: Math.round(memAvailable / 1073741824 * 100) / 100,
                swapTotal: swapTotal,
                swapUsed: swapUsed
            },
            disk: {
                total: diskTotal,
                used: diskUsed,
                percent: diskPercent,
                totalGB: Math.round(diskTotal / 1073741824 * 100) / 100,
                usedGB: Math.round(diskUsed / 1073741824 * 100) / 100
            },
            uptime: uptimeSeconds,
            uptimeDays: Math.floor(uptimeSeconds / 86400),
            os: osInfo,
            docker: {
                running: dockerRunning,
                total: dockerTotal
            },
            timestamp: Date.now()
        };
        
        conn.end();
        return { success: true, metrics };
        
    } catch (error) {
        if (conn && !conn.ended) {
            try { conn.end(); } catch (e) {}
        }
        return { success: false, error: `(SSH) ${error.message}`, metrics: null };
    }
}

/**
 * GET /api/server-metrics/:id - Get real-time metrics for a specific server
 */
router.get('/:id', async (req, res) => {
    try {
        const userId = req.user.id;
        const serverId = req.params.id;
        
        const server = db.prepare(`
            SELECT id, name, host, port, username, auth_type, encrypted_credentials, status
            FROM servers
            WHERE id = ? AND user_id = ?
        `).get(serverId, userId);
        
        if (!server) {
            return res.status(404).json({ success: false, error: 'Server not found' });
        }
        
        const result = await collectRemoteMetrics(server);
        
        if (result.success) {
            // Update server table with fresh metrics
            try {
                db.prepare(`
                    UPDATE servers SET
                        cpu_usage = ?,
                        memory_usage = ?,
                        disk_usage = ?,
                        uptime = ?,
                        os_info = ?,
                        status = 'online',
                        last_check = datetime('now'),
                        last_check_at = datetime('now'),
                        updated_at = datetime('now')
                    WHERE id = ? AND user_id = ?
                `).run(
                    result.metrics.cpu.usage,
                    result.metrics.memory.percent,
                    result.metrics.disk.percent,
                    result.metrics.uptime,
                    result.metrics.os,
                    serverId,
                    userId
                );
                
                // Save to metrics history
                // Save to metrics history
                try {
                    db.prepare(`
                        INSERT INTO metrics_history (
                            timestamp, server_id, cpu_usage, cpu_cores,
                            memory_used, memory_total, memory_percent,
                            disk_used, disk_total, disk_percent,
                            docker_containers, docker_running,
                            uptime, load_avg_1, load_avg_5, load_avg_15
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    `).run(
                        Date.now(),
                        serverId,
                        result.metrics.cpu.usage,
                        result.metrics.cpu.cores,
                        result.metrics.memory.used,
                        result.metrics.memory.total,
                        result.metrics.memory.percent,
                        result.metrics.disk.used,
                        result.metrics.disk.total,
                        result.metrics.disk.percent,
                        result.metrics.docker.total,
                        result.metrics.docker.running,
                        result.metrics.uptime,
                        result.metrics.cpu.loadAverage[0],
                        result.metrics.cpu.loadAverage[1],
                        result.metrics.cpu.loadAverage[2]
                    );
                } catch (histErr) {
                    console.warn('Metrics history save failed:', histErr.message);
                }
                
            } catch (updateErr) {
                console.warn('Server metrics update failed:', updateErr.message);
            }
            
            res.json({ success: true, data: result.metrics, serverName: server.name });
        } else {
            // Mark server as offline on failure
            try {
                db.prepare(`
                    UPDATE servers SET status = 'offline', last_check = datetime('now'), updated_at = datetime('now')
                    WHERE id = ? AND user_id = ?
                `).run(serverId, userId);
            } catch (e) {}
            
            res.status(503).json({ success: false, error: result.error, serverName: server.name });
        }
        
    } catch (error) {
        console.error('Error collecting server metrics:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * POST /api/server-metrics/refresh-all - Refresh all user's servers
 */
router.post('/refresh-all', async (req, res) => {
    try {
        const userId = req.user.id;
        
        const servers = db.prepare(`
            SELECT id, name, host, port, username, auth_type, encrypted_credentials, status
            FROM servers
            WHERE user_id = ?
        `).all(userId);
        
        if (!servers.length) {
            return res.json({ success: true, results: [], count: 0 });
        }
        
        const results = [];
        for (const server of servers) {
            const result = await collectRemoteMetrics(server);
            
            if (result.success) {
                try {
                    db.prepare(`
                        UPDATE servers SET
                            cpu_usage = ?,
                            memory_usage = ?,
                            disk_usage = ?,
                            uptime = ?,
                            os_info = ?,
                            status = 'online',
                            last_check = datetime('now'),
                            last_check_at = datetime('now'),
                            updated_at = datetime('now')
                        WHERE id = ? AND user_id = ?
                    `).run(
                        result.metrics.cpu.usage,
                        result.metrics.memory.percent,
                        result.metrics.disk.percent,
                        result.metrics.uptime,
                        result.metrics.os,
                        server.id,
                        userId
                    );
                } catch (e) {
                    console.warn('Failed to update server:', e.message);
                }
            } else {
                try {
                    db.prepare(`
                        UPDATE servers SET status = 'offline', last_check = datetime('now'), updated_at = datetime('now')
                        WHERE id = ? AND user_id = ?
                    `).run(server.id, userId);
                } catch (e) {}
            }
            
            results.push({
                serverId: server.id,
                serverName: server.name,
                success: result.success,
                metrics: result.success ? result.metrics : null,
                error: result.success ? null : result.error
            });
        }
        
        res.json({ success: true, results, count: results.length });
        
    } catch (error) {
        console.error('Error refreshing all servers:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * GET /api/server-metrics - List all servers with cached metrics
 */
router.get('/', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const servers = db.prepare(`
            SELECT id, name, host, status, cpu_usage, memory_usage, disk_usage, uptime, os_info, last_check
            FROM servers
            WHERE user_id = ?
            ORDER BY name
        `).all(userId);
        
        res.json({ success: true, servers, count: servers.length });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

export default router;