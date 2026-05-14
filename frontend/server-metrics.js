/**
 * Server Metrics Manager - Real-time remote server monitoring
 * Fetches metrics via SSH through the /api/server-metrics endpoint
 * Displays live CPU, RAM, Disk, Uptime, Docker stats
 */

class ServerMetricsManager {
    constructor() {
        this.servers = [];
        this.metricsCache = {};
        this.refreshInterval = null;
        this.isLoading = false;
        this.lastRefresh = null;
        this.REFRESH_RATE = 60000; // 60 seconds
    }
    
    async init() {
        await this.fetchServers();
        await this.refreshAllMetrics();
        this.startAutoRefresh();
        this.setupVisibilityHandler();
        console.log('✅ Server Metrics Manager initialized');
    }
    
    async fetchServers() {
        try {
            const token = localStorage.getItem('authToken');
            if (!token) return;
            
            const response = await fetch('/api/servers', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            
            if (response.status === 401 || response.status === 403) {
                console.warn('[Metrics] Auth token expired');
                return;
            }
            const data = await response.json();
            this.servers = data.servers || [];
        } catch (error) {
            console.error('Failed to fetch servers:', error);
        }
    }
    
    async refreshAllMetrics() {
        if (this.isLoading) return;
        this.isLoading = true;
        this.updateRefreshIndicator(true);
        
        try {
            const token = localStorage.getItem('authToken');
            if (!token) return;
            
            const response = await fetch('/api/server-metrics/refresh-all', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            
            if (response.status === 401 || response.status === 403) {
                console.warn('[Metrics] Auth token expired - stopping metrics polling');
                if (this.refreshInterval) {
                    clearInterval(this.refreshInterval);
                    this.refreshInterval = null;
                }
                return;
            }
            
            const data = await response.json();
            
            if (data.success) {
                for (const result of data.results) {
                    this.metricsCache[result.serverId] = {
                        ...result.metrics,
                        serverName: result.serverName,
                        success: result.success,
                        error: result.error,
                        timestamp: Date.now()
                    };
                }
                
                this.lastRefresh = Date.now();
                this.renderMetricsWidgets();
                this.updateDashboardStats();
            }
        } catch (error) {
            console.error('Failed to refresh metrics:', error);
        } finally {
            this.isLoading = false;
            this.updateRefreshIndicator(false);
        }
    }
    
    async refreshServerMetrics(serverId) {
        try {
            const token = localStorage.getItem('authToken');
            if (!token) return;
            
            const response = await fetch(`/api/server-metrics/${serverId}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            
            const data = await response.json();
            
            if (data.success) {
                this.metricsCache[serverId] = {
                    ...data.data,
                    serverName: data.serverName,
                    success: true,
                    timestamp: Date.now()
                };
                
                this.renderServerMetricCard(serverId);
                this.updateDashboardStats();
            }
            
            return data;
        } catch (error) {
            console.error(`Failed to refresh metrics for server ${serverId}:`, error);
            return { success: false, error: error.message };
        }
    }
    
    updateDashboardStats() {
        // Update the QuickStatsManager if available
        const serverIds = Object.keys(this.metricsCache);
        if (!serverIds.length) return;
        
        let cpuSum = 0, ramSum = 0, count = 0;
        for (const id of serverIds) {
            const m = this.metricsCache[id];
            if (m && m.success) {
                cpuSum += m.cpu?.usage || 0;
                ramSum += m.memory?.percent || 0;
                count++;
            }
        }
        
        if (count > 0) {
            const cpuAvg = Math.round(cpuSum / count * 10) / 10;
            const ramAvg = Math.round(ramSum / count * 10) / 10;
            
            // Update dashboard stat elements
            const cpuEl = document.getElementById('stat-cpu-avg');
            const ramEl = document.getElementById('stat-ram-avg');
            
            if (cpuEl) cpuEl.textContent = `${cpuAvg}%`;
            if (ramEl) ramEl.textContent = `${ramAvg}%`;
            
            // Update progress bars if they exist
            const cpuBar = document.getElementById('cpu-progress-bar');
            const ramBar = document.getElementById('ram-progress-bar');
            if (cpuBar) cpuBar.style.width = `${cpuAvg}%`;
            if (ramBar) ramBar.style.width = `${ramAvg}%`;
        }
    }
    
    renderMetricsWidgets() {
        // Target the metrics-cards-wrapper inside the server-metrics-container
        let container = document.getElementById('metrics-cards-wrapper');
        if (!container) {
            // Fallback: try the main container
            container = document.getElementById('server-metrics-container');
        }
        if (!container) return;
        
        container.innerHTML = '';
        
        for (const server of this.servers) {
            const metrics = this.metricsCache[server.id];
            if (!metrics) continue;
            
            const card = document.createElement('div');
            card.id = `metrics-card-${server.id}`;
            card.className = 'metrics-card';
            card.innerHTML = this.buildMetricCardHTML(server, metrics);
            container.appendChild(card);
        }
    }
    
    renderServerMetricCard(serverId) {
        const server = this.servers.find(s => s.id == serverId);
        const metrics = this.metricsCache[serverId];
        if (!server || !metrics) return;
        
        const card = document.getElementById(`metrics-card-${serverId}`);
        if (card) {
            card.innerHTML = this.buildMetricCardHTML(server, metrics);
        }
    }
    
    buildMetricCardHTML(server, metrics) {
        const cpuUsage = metrics.cpu?.usage || 0;
        const memPercent = metrics.memory?.percent || 0;
        const diskPercent = metrics.disk?.percent || 0;
        const uptimeDays = metrics.uptimeDays || 0;
        const cpuCores = metrics.cpu?.cores || 0;
        const cpuModel = metrics.cpu?.model || 'N/A';
        const memTotalGB = metrics.memory?.totalGB || 0;
        const memUsedGB = metrics.memory?.usedGB || 0;
        const memAvailGB = metrics.memory?.availableGB || 0;
        const diskTotalGB = metrics.disk?.totalGB || 0;
        const diskUsedGB = metrics.disk?.usedGB || 0;
        const dockerRunning = metrics.docker?.running || 0;
        const dockerTotal = metrics.docker?.total || 0;
        const loadAvg = metrics.cpu?.loadAverage || [0, 0, 0];
        const swapUsed = metrics.memory?.swapUsed || 0;
        const swapTotal = metrics.memory?.swapTotal || 0;
        
        const cpuColor = cpuUsage > 80 ? '#ef4444' : cpuUsage > 60 ? '#f59e0b' : '#10b981';
        const memColor = memPercent > 85 ? '#ef4444' : memPercent > 70 ? '#f59e0b' : '#10b981';
        const diskColor = diskPercent > 90 ? '#ef4444' : diskPercent > 75 ? '#f59e0b' : '#10b981';
        const statusClass = metrics.success ? 'online' : 'offline';
        
        return `
            <div style="background: rgba(30,41,59,0.6); border: 1px solid rgba(102,126,234,0.15); border-radius: 16px; padding: 20px; margin-bottom: 16px;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
                    <div style="display: flex; align-items: center; gap: 10px;">
                        <span class="status-dot ${statusClass}" style="width: 10px; height: 10px; border-radius: 50%; background: ${statusClass === 'online' ? '#10b981' : '#64748b'}; display: inline-block;"></span>
                        <h3 style="margin: 0; color: #e2e8f0; font-size: 16px; font-weight: 600;">${server.name || server.host}</h3>
                    </div>
                    <button onclick="window.serverMetricsManager.refreshServerMetrics(${server.id})" style="background: rgba(102,126,234,0.2); border: 1px solid rgba(102,126,234,0.3); color: #a5b4fc; padding: 6px 12px; border-radius: 8px; font-size: 12px; cursor: pointer;">
                        🔄 Rafraîchir
                    </button>
                </div>
                
                <!-- CPU Section -->
                <div style="margin-bottom: 14px;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
                        <span style="color: #94a3b8; font-size: 13px;">🖥️ CPU</span>
                        <span style="color: ${cpuColor}; font-size: 14px; font-weight: 600;">${cpuUsage}%</span>
                    </div>
                    <div style="background: rgba(0,0,0,0.3); border-radius: 6px; height: 8px; overflow: hidden;">
                        <div style="background: ${cpuColor}; height: 100%; width: ${Math.min(cpuUsage, 100)}%; border-radius: 6px; transition: width 0.5s ease;"></div>
                    </div>
                    <div style="display: flex; justify-content: space-between; margin-top: 4px;">
                        <span style="color: #64748b; font-size: 11px;">${cpuCores} cores | ${cpuModel.substring(0, 35)}</span>
                        <span style="color: #64748b; font-size: 11px;">Load: ${loadAvg[0]} / ${loadAvg[1]} / ${loadAvg[2]}</span>
                    </div>
                </div>
                
                <!-- Memory Section -->
                <div style="margin-bottom: 14px;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
                        <span style="color: #94a3b8; font-size: 13px;">💾 RAM</span>
                        <span style="color: ${memColor}; font-size: 14px; font-weight: 600;">${memPercent}%</span>
                    </div>
                    <div style="background: rgba(0,0,0,0.3); border-radius: 6px; height: 8px; overflow: hidden;">
                        <div style="background: ${memColor}; height: 100%; width: ${Math.min(memPercent, 100)}%; border-radius: 6px; transition: width 0.5s ease;"></div>
                    </div>
                    <div style="display: flex; justify-content: space-between; margin-top: 4px;">
                        <span style="color: #64748b; font-size: 11px;">${memUsedGB} GB / ${memTotalGB} GB (${memAvailGB} GB libre)</span>
                        ${swapTotal > 0 ? `<span style="color: #64748b; font-size: 11px;">Swap: ${Math.round(swapUsed/1073741824*100)/100}/${Math.round(swapTotal/1073741824*100)/100} GB</span>` : ''}
                    </div>
                </div>
                
                <!-- Disk Section -->
                <div style="margin-bottom: 14px;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
                        <span style="color: #94a3b8; font-size: 13px;">💿 Disque</span>
                        <span style="color: ${diskColor}; font-size: 14px; font-weight: 600;">${diskPercent}%</span>
                    </div>
                    <div style="background: rgba(0,0,0,0.3); border-radius: 6px; height: 8px; overflow: hidden;">
                        <div style="background: ${diskColor}; height: 100%; width: ${Math.min(diskPercent, 100)}%; border-radius: 6px; transition: width 0.5s ease;"></div>
                    </div>
                    <div style="display: flex; justify-content: space-between; margin-top: 4px;">
                        <span style="color: #64748b; font-size: 11px;">${diskUsedGB} GB / ${diskTotalGB} GB</span>
                    </div>
                </div>
                
                <!-- Info Row -->
                <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px; margin-top: 12px;">
                    <div style="text-align: center; padding: 8px; background: rgba(0,0,0,0.2); border-radius: 8px;">
                        <div style="color: #64748b; font-size: 11px;">Uptime</div>
                        <div style="color: #e2e8f0; font-size: 14px; font-weight: 600;">${uptimeDays}d</div>
                    </div>
                    <div style="text-align: center; padding: 8px; background: rgba(0,0,0,0.2); border-radius: 8px;">
                        <div style="color: #64748b; font-size: 11px;">Docker</div>
                        <div style="color: #e2e8f0; font-size: 14px; font-weight: 600;">${dockerRunning}/${dockerTotal}</div>
                    </div>
                    <div style="text-align: center; padding: 8px; background: rgba(0,0,0,0.2); border-radius: 8px;">
                        <div style="color: #64748b; font-size: 11px;">OS</div>
                        <div style="color: #e2e8f0; font-size: 11px; font-weight: 500;" title="${metrics.os || 'N/A'}">${(metrics.os || 'N/A').substring(0, 15)}</div>
                    </div>
                </div>
                
                <!-- Timestamp -->
                <div style="text-align: right; margin-top: 8px;">
                    <span style="color: #475569; font-size: 10px;">Dernière mise à jour: ${new Date().toLocaleTimeString('fr-FR')}</span>
                </div>
            </div>
        `;
    }
    
    updateRefreshIndicator(loading) {
        const indicator = document.getElementById('metrics-refresh-indicator');
        if (indicator) {
            indicator.style.display = loading ? 'inline-block' : 'none';
        }
    }
    
    startAutoRefresh() {
        if (this.refreshInterval) clearInterval(this.refreshInterval);
        
        this.refreshInterval = setInterval(() => {
            if (!document.hidden && navigator.onLine) {
                this.refreshAllMetrics();
            }
        }, this.REFRESH_RATE);
    }
    
    setupVisibilityHandler() {
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden && navigator.onLine) {
                // Refresh when tab becomes visible
                const timeSinceLastRefresh = this.lastRefresh ? Date.now() - this.lastRefresh : Infinity;
                if (timeSinceLastRefresh > 30000) { // Only if > 30s since last refresh
                    this.refreshAllMetrics();
                }
            }
        });
    }
    
    destroy() {
        if (this.refreshInterval) {
            clearInterval(this.refreshInterval);
            this.refreshInterval = null;
        }
    }
}

// Initialize globally
window.serverMetricsManager = new ServerMetricsManager();

// Auto-init on DOM ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => window.serverMetricsManager.init());
} else {
    window.serverMetricsManager.init();
}
