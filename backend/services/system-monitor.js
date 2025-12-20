import si from 'systeminformation';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

class SystemMonitor {
  constructor(db) {
    this.db = db;
    this.metrics = {
      cpu: { usage: 0, cores: 0, temperature: null },
      memory: { used: 0, total: 0, percent: 0 },
      disk: { used: 0, total: 0, percent: 0 },
      network: { rx: 0, tx: 0, rxSec: 0, txSec: 0 },
      docker: { containers: 0, running: 0, images: 0 },
      uptime: 0,
      loadAverage: [0, 0, 0]
    };
    
    this.previousNetworkStats = null;
    this.lastUpdateTime = Date.now();
  }

  /**
   * Collecter toutes les métriques système
   */
  async collectMetrics() {
    try {
      const [cpu, mem, disk, network, uptime, load] = await Promise.all([
        this.getCpuMetrics(),
        this.getMemoryMetrics(),
        this.getDiskMetrics(),
        this.getNetworkMetrics(),
        this.getUptime(),
        this.getLoadAverage()
      ]);

      // Docker metrics (optionnel)
      const docker = await this.getDockerMetrics().catch(() => ({
        containers: 0,
        running: 0,
        images: 0
      }));

      this.metrics = {
        cpu,
        memory: mem,
        disk,
        network,
        docker,
        uptime,
        loadAverage: load,
        timestamp: Date.now()
      };

      return this.metrics;
    } catch (error) {
      console.error('Error collecting metrics:', error);
      throw error;
    }
  }

  /**
   * Métriques CPU
   */
  async getCpuMetrics() {
    const cpuData = await si.cpu();
    const currentLoad = await si.currentLoad();
    const cpuTemp = await si.cpuTemperature().catch(() => ({ main: null }));

    return {
      usage: Math.round(currentLoad.currentLoad * 10) / 10,
      cores: cpuData.cores,
      model: cpuData.brand,
      speed: cpuData.speed,
      temperature: cpuTemp.main,
      loadUser: Math.round(currentLoad.currentLoadUser * 10) / 10,
      loadSystem: Math.round(currentLoad.currentLoadSystem * 10) / 10
    };
  }

  /**
   * Métriques Mémoire
   */
  async getMemoryMetrics() {
    const mem = await si.mem();
    
    return {
      used: mem.used,
      total: mem.total,
      percent: Math.round((mem.used / mem.total) * 100 * 10) / 10,
      usedMB: Math.round(mem.used / 1024 / 1024),
      totalMB: Math.round(mem.total / 1024 / 1024),
      free: mem.free,
      freeMB: Math.round(mem.free / 1024 / 1024),
      available: mem.available,
      swapUsed: mem.swapused,
      swapTotal: mem.swaptotal
    };
  }

  /**
   * Métriques Disque
   */
  async getDiskMetrics() {
    const fsSize = await si.fsSize();
    
    // Prendre le disque principal (/)
    const rootDisk = fsSize.find(fs => fs.mount === '/') || fsSize[0];
    
    if (!rootDisk) {
      return { used: 0, total: 0, percent: 0, usedGB: 0, totalGB: 0 };
    }

    return {
      used: rootDisk.used,
      total: rootDisk.size,
      percent: Math.round(rootDisk.use * 10) / 10,
      usedGB: Math.round(rootDisk.used / 1024 / 1024 / 1024 * 10) / 10,
      totalGB: Math.round(rootDisk.size / 1024 / 1024 / 1024 * 10) / 10,
      available: rootDisk.available,
      mount: rootDisk.mount,
      fs: rootDisk.fs
    };
  }

  /**
   * Métriques Réseau
   */
  async getNetworkMetrics() {
    const networkStats = await si.networkStats();
    const primaryInterface = networkStats[0];
    
    if (!primaryInterface) {
      return { rx: 0, tx: 0, rxSec: 0, txSec: 0 };
    }

    const currentTime = Date.now();
    let rxSec = 0;
    let txSec = 0;

    if (this.previousNetworkStats) {
      const timeDiff = (currentTime - this.lastUpdateTime) / 1000; // en secondes
      rxSec = Math.round((primaryInterface.rx_bytes - this.previousNetworkStats.rx) / timeDiff);
      txSec = Math.round((primaryInterface.tx_bytes - this.previousNetworkStats.tx) / timeDiff);
    }

    this.previousNetworkStats = {
      rx: primaryInterface.rx_bytes,
      tx: primaryInterface.tx_bytes
    };
    this.lastUpdateTime = currentTime;

    return {
      rx: primaryInterface.rx_bytes,
      tx: primaryInterface.tx_bytes,
      rxSec: this.formatBytes(rxSec) + '/s',
      txSec: this.formatBytes(txSec) + '/s',
      rxTotal: this.formatBytes(primaryInterface.rx_bytes),
      txTotal: this.formatBytes(primaryInterface.tx_bytes),
      interface: primaryInterface.iface
    };
  }

  /**
   * Métriques Docker
   */
  async getDockerMetrics() {
    try {
      const { stdout: containers } = await execAsync('docker ps -a --format "{{.ID}}"');
      const { stdout: running } = await execAsync('docker ps --format "{{.ID}}"');
      const { stdout: images } = await execAsync('docker images -q');

      return {
        containers: containers.trim().split('\n').filter(Boolean).length,
        running: running.trim().split('\n').filter(Boolean).length,
        images: images.trim().split('\n').filter(Boolean).length
      };
    } catch (error) {
      return { containers: 0, running: 0, images: 0 };
    }
  }

  /**
   * Uptime système
   */
  async getUptime() {
    const time = await si.time();
    return time.uptime; // en secondes
  }

  /**
   * Load Average
   */
  async getLoadAverage() {
    const load = await si.currentLoad();
    return [
      Math.round(load.avgLoad * 100) / 100,
      0, // 5 min (non disponible via systeminformation)
      0  // 15 min (non disponible via systeminformation)
    ];
  }

  /**
   * Obtenir les processus top CPU
   */
  async getTopProcesses(limit = 10) {
    const processes = await si.processes();
    return processes.list
      .sort((a, b) => b.cpu - a.cpu)
      .slice(0, limit)
      .map(p => ({
        pid: p.pid,
        name: p.name,
        cpu: Math.round(p.cpu * 10) / 10,
        mem: Math.round(p.mem * 10) / 10,
        command: p.command
      }));
  }

  /**
   * Vérifier les seuils d'alerte
   */
  checkAlerts(thresholds = {}) {
    const alerts = [];
    const defaults = {
      cpu: 80,
      memory: 85,
      disk: 90
    };

    const limits = { ...defaults, ...thresholds };

    if (this.metrics.cpu.usage > limits.cpu) {
      alerts.push({
        type: 'cpu',
        level: 'warning',
        message: `CPU usage élevé: ${this.metrics.cpu.usage}% (seuil: ${limits.cpu}%)`,
        value: this.metrics.cpu.usage,
        threshold: limits.cpu
      });
    }

    if (this.metrics.memory.percent > limits.memory) {
      alerts.push({
        type: 'memory',
        level: 'warning',
        message: `Mémoire élevée: ${this.metrics.memory.percent}% (seuil: ${limits.memory}%)`,
        value: this.metrics.memory.percent,
        threshold: limits.memory
      });
    }

    if (this.metrics.disk.percent > limits.disk) {
      alerts.push({
        type: 'disk',
        level: this.metrics.disk.percent > 95 ? 'critical' : 'warning',
        message: `Disque plein: ${this.metrics.disk.percent}% (seuil: ${limits.disk}%)`,
        value: this.metrics.disk.percent,
        threshold: limits.disk
      });
    }

    return alerts;
  }

  /**
   * Formater les bytes
   */
  formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  }

  /**
   * Formater l'uptime
   */
  formatUptime(seconds) {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    
    const parts = [];
    if (days > 0) parts.push(`${days}j`);
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0) parts.push(`${minutes}m`);
    
    return parts.join(' ') || '0m';
  }

  /**
   * Obtenir les métriques actuelles (sans recollecte)
   */
  getCurrentMetrics() {
    return {
      ...this.metrics,
      uptimeFormatted: this.formatUptime(this.metrics.uptime)
    };
  }

  /**
   * Save current metrics to database
   */
  saveMetrics(metrics) {
    try {
      const stmt = this.db.prepare(`
        INSERT INTO metrics_history (
          timestamp, cpu_usage, cpu_cores, cpu_temperature,
          memory_used, memory_total, memory_percent,
          disk_used, disk_total, disk_percent,
          network_rx, network_tx, network_rx_sec, network_tx_sec,
          docker_containers, docker_running, docker_images,
          uptime, load_avg_1, load_avg_5, load_avg_15
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      stmt.run(
        Date.now(),
        metrics.cpu.usage,
        metrics.cpu.cores,
        metrics.cpu.temperature,
        metrics.memory.used,
        metrics.memory.total,
        metrics.memory.percent,
        metrics.disk.used,
        metrics.disk.total,
        metrics.disk.percent,
        metrics.network.rx,
        metrics.network.tx,
        metrics.network.rxSec,
        metrics.network.txSec,
        metrics.docker.containers,
        metrics.docker.running,
        metrics.docker.images,
        metrics.uptime,
        metrics.loadAverage[0],
        metrics.loadAverage[1],
        metrics.loadAverage[2]
      );

      return { success: true };
    } catch (error) {
      console.error('Error saving metrics:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get metrics history from database
   */
  getMetricsHistory(since = Date.now() - 86400000, limit = 100) {
    try {
      const stmt = this.db.prepare(`
        SELECT * FROM metrics_history
        WHERE timestamp >= ?
        ORDER BY timestamp DESC
        LIMIT ?
      `);

      const rows = stmt.all(since, limit);
      return rows;
    } catch (error) {
      console.error('Error fetching metrics history:', error);
      return [];
    }
  }

  /**
   * Clean old metrics (keep last N days)
   */
  cleanOldMetrics(daysToKeep = 30) {
    try {
      const cutoffTime = Date.now() - (daysToKeep * 86400000);
      const stmt = this.db.prepare('DELETE FROM metrics_history WHERE timestamp < ?');
      const result = stmt.run(cutoffTime);
      return { success: true, deleted: result.changes };
    } catch (error) {
      console.error('Error cleaning old metrics:', error);
      return { success: false, error: error.message };
    }
  }

}

export default SystemMonitor;
