/**
 * VPS DevOps Agent - Premium PWA Manager
 * Handles: Service Worker registration, Install prompt, Push notifications, Background sync, Offline detection
 */

class PWAManager {
    constructor() {
        this.swRegistration = null;
        this.deferredPrompt = null;
        this.isInstalled = false;
        this.isOnline = navigator.onLine;
        this.updateAvailable = false;
        
        this.init();
    }
    
    async init() {
        await this.registerServiceWorker();
        this.setupInstallPrompt();
        this.setupOfflineDetection();
        this.setupPeriodicSync();
        this.checkInstallStatus();
        
        console.log('✅ PWA Manager initialized');
    }
    
    // ===== SERVICE WORKER REGISTRATION =====
    async registerServiceWorker() {
        if (!('serviceWorker' in navigator)) {
            console.warn('⚠️ Service Workers not supported');
            return;
        }
        
        try {
            this.swRegistration = await navigator.serviceWorker.register('/service-worker.js', {
                scope: '/',
                updateViaCache: 'none'
            });
            
            console.log('✅ Service Worker registered:', this.swRegistration.scope);
            
            // Check for updates
            this.swRegistration.addEventListener('updatefound', () => {
                const newWorker = this.swRegistration.installing;
                
                newWorker.addEventListener('statechange', () => {
                    if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                        this.updateAvailable = true;
                        this.showUpdateNotification();
                    }
                });
            });
            
            // Listen for messages from SW
            navigator.serviceWorker.addEventListener('message', (event) => {
                this.handleServiceWorkerMessage(event.data);
            });
            
            // Check for updates every 30 minutes
            setInterval(() => {
                this.swRegistration?.update();
            }, 1800000);
            
        } catch (error) {
            console.error('❌ SW registration failed:', error);
        }
    }
    
    // ===== INSTALL PROMPT =====
    setupInstallPrompt() {
        // Capture the beforeinstallprompt event
        window.addEventListener('beforeinstallprompt', (e) => {
            e.preventDefault();
            this.deferredPrompt = e;
            this.showInstallButton();
            console.log('📱 PWA install prompt captured');
        });
        
        // Listen for successful install
        window.addEventListener('appinstalled', () => {
            this.isInstalled = true;
            this.deferredPrompt = null;
            this.hideInstallButton();
            this.trackEvent('pwa_installed');
            console.log('📱 PWA installed successfully');
        });
    }
    
    async promptInstall() {
        if (!this.deferredPrompt) {
            console.log('Install prompt not available');
            return false;
        }
        
        this.deferredPrompt.prompt();
        const { outcome } = await this.deferredPrompt.userChoice;
        
        this.deferredPrompt = null;
        this.trackEvent('pwa_install_prompt', { outcome });
        
        return outcome === 'accepted';
    }
    
    showInstallButton() {
        const btn = document.getElementById('pwa-install-btn');
        if (btn) {
            btn.style.display = 'flex';
            btn.addEventListener('click', () => this.promptInstall());
        }
        
        // Also show in sidebar if exists
        const sidebarBtn = document.getElementById('pwa-install-sidebar');
        if (sidebarBtn) {
            sidebarBtn.style.display = 'flex';
        }
    }
    
    hideInstallButton() {
        const btn = document.getElementById('pwa-install-btn');
        if (btn) btn.style.display = 'none';
        
        const sidebarBtn = document.getElementById('pwa-install-sidebar');
        if (sidebarBtn) sidebarBtn.style.display = 'none';
    }
    
    checkInstallStatus() {
        // Check if already running as PWA
        if (window.matchMedia('(display-mode: standalone)').matches || 
            window.navigator.standalone === true) {
            this.isInstalled = true;
            this.hideInstallButton();
        }
    }
    
    // ===== OFFLINE DETECTION =====
    setupOfflineDetection() {
        window.addEventListener('online', () => {
            this.isOnline = true;
            this.showConnectionStatus('online');
            this.triggerBackgroundSync();
        });
        
        window.addEventListener('offline', () => {
            this.isOnline = false;
            this.showConnectionStatus('offline');
        });
    }
    
    showConnectionStatus(status) {
        // Create or update status banner
        let banner = document.getElementById('pwa-connection-banner');
        
        if (status === 'offline') {
            if (!banner) {
                banner = document.createElement('div');
                banner.id = 'pwa-connection-banner';
                banner.style.cssText = `
                    position: fixed; top: 0; left: 0; right: 0; z-index: 99999;
                    background: linear-gradient(90deg, #f59e0b, #d97706);
                    color: white; text-align: center; padding: 10px;
                    font-size: 14px; font-weight: 600;
                    font-family: -apple-system, sans-serif;
                    box-shadow: 0 2px 10px rgba(245,158,11,0.3);
                    transform: translateY(-100%);
                    transition: transform 0.3s ease;
                `;
                banner.innerHTML = '📡 Mode hors ligne — Les données peuvent être obsolètes';
                document.body.appendChild(banner);
            }
            requestAnimationFrame(() => {
                banner.style.transform = 'translateY(0)';
            });
        } else {
            if (banner) {
                banner.style.background = 'linear-gradient(90deg, #10b981, #059669)';
                banner.innerHTML = '✅ Connexion rétablie — Synchronisation en cours...';
                setTimeout(() => {
                    banner.style.transform = 'translateY(-100%)';
                    setTimeout(() => banner.remove(), 300);
                }, 3000);
            }
        }
    }
    
    // ===== PUSH NOTIFICATIONS =====
    async requestNotificationPermission() {
        if (!('Notification' in window)) {
            console.warn('Notifications not supported');
            return false;
        }
        
        if (Notification.permission === 'granted') return true;
        if (Notification.permission === 'denied') return false;
        
        const permission = await Notification.requestPermission();
        return permission === 'granted';
    }
    
    async subscribeToPush() {
        if (!this.swRegistration || !('PushManager' in window)) return null;
        
        try {
            const subscription = await this.swRegistration.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: this.urlBase64ToUint8Array(
                    // VAPID key would go here - placeholder for now
                    'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkOs-GV3W3JGFBkM-OCMOz3V0mXTMCJYHIMfPFA7GY'
                )
            });
            
            console.log('✅ Push subscription:', subscription.endpoint);
            return subscription;
        } catch (error) {
            console.warn('Push subscription failed:', error);
            return null;
        }
    }
    
    urlBase64ToUint8Array(base64String) {
        const padding = '='.repeat((4 - base64String.length % 4) % 4);
        const base64 = (base64String + padding)
            .replace(/-/g, '+')
            .replace(/_/g, '/');
        const rawData = window.atob(base64);
        const outputArray = new Uint8Array(rawData.length);
        for (let i = 0; i < rawData.length; ++i) {
            outputArray[i] = rawData.charCodeAt(i);
        }
        return outputArray;
    }
    
    async showLocalNotification(title, body, options = {}) {
        const hasPermission = await this.requestNotificationPermission();
        if (!hasPermission) return;
        
        const notification = new Notification(title, {
            body,
            icon: '/assets/icon-192.png',
            badge: '/assets/icon-72.png',
            tag: options.tag || `local-${Date.now()}`,
            ...options
        });
        
        notification.onclick = () => {
            window.focus();
            if (options.url) window.location.href = options.url;
            notification.close();
        };
        
        return notification;
    }
    
    // ===== BACKGROUND SYNC =====
    async triggerBackgroundSync(tag = 'sync-data') {
        if (!this.swRegistration || !('SyncManager' in window)) {
            console.warn('Background Sync not supported');
            return;
        }
        
        try {
            await this.swRegistration.sync.register(tag);
            console.log(`✅ Background sync registered: ${tag}`);
        } catch (error) {
            console.warn('Background sync registration failed:', error);
        }
    }
    
    setupPeriodicSync() {
        // Auto-refresh metrics every 2 minutes when tab is visible
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden && this.isOnline) {
                this.triggerBackgroundSync('sync-server-metrics');
            }
        });
    }
    
    // ===== UPDATE HANDLING =====
    showUpdateNotification() {
        const existing = document.getElementById('pwa-update-banner');
        if (existing) return;
        
        const banner = document.createElement('div');
        banner.id = 'pwa-update-banner';
        banner.style.cssText = `
            position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%);
            z-index: 99998; background: linear-gradient(135deg, #667eea, #764ba2);
            color: white; padding: 16px 24px; border-radius: 16px;
            display: flex; align-items: center; gap: 16px;
            box-shadow: 0 10px 40px rgba(102,126,234,0.4);
            font-family: -apple-system, sans-serif; max-width: 90vw;
        `;
        banner.innerHTML = `
            <span style="font-size: 14px; font-weight: 500;">🔄 Mise à jour disponible</span>
            <button onclick="window.pwaManager.applyUpdate()" style="
                background: white; color: #667eea; border: none;
                padding: 8px 20px; border-radius: 8px; font-weight: 600;
                cursor: pointer; font-size: 13px;
            ">Mettre à jour</button>
            <button onclick="this.parentElement.remove()" style="
                background: rgba(255,255,255,0.2); color: white; border: none;
                padding: 8px 12px; border-radius: 8px; cursor: pointer; font-size: 13px;
            ">Plus tard</button>
        `;
        document.body.appendChild(banner);
    }
    
    async applyUpdate() {
        if (!this.swRegistration) return;
        
        const newWorker = this.swRegistration.waiting;
        if (newWorker) {
            newWorker.postMessage({ type: 'SKIP_WAITING' });
        }
        
        window.location.reload();
    }
    
    // ===== SW MESSAGE HANDLER =====
    handleServiceWorkerMessage(data) {
        if (!data) return;
        
        switch (data.type) {
            case 'SYNC_METRICS':
                // Refresh metrics if on dashboard
                if (typeof quickStatsManager !== 'undefined') {
                    quickStatsManager.refresh();
                }
                if (typeof refreshServerMetrics === 'function') {
                    refreshServerMetrics();
                }
                break;
                
            case 'SYNC_COMMANDS':
                console.log('[PWA] Sync commands requested');
                break;
        }
    }
    
    // ===== ANALYTICS =====
    trackEvent(eventName, data = {}) {
        // Track PWA events for analytics
        try {
            const events = JSON.parse(localStorage.getItem('pwa_events') || '[]');
            events.push({
                event: eventName,
                data,
                timestamp: Date.now()
            });
            // Keep last 100 events
            if (events.length > 100) events.splice(0, events.length - 100);
            localStorage.setItem('pwa_events', JSON.stringify(events));
        } catch (e) {}
    }
    
    // ===== CACHE MANAGEMENT =====
    async getCachedSize() {
        if (!('storage' in navigator && 'estimate' in navigator.storage)) return null;
        try {
            const estimate = await navigator.storage.estimate();
            return {
                usage: estimate.usage,
                quota: estimate.quota,
                usageMB: Math.round(estimate.usage / 1048576 * 100) / 100,
                quotaMB: Math.round(estimate.quota / 1048576 * 100) / 100,
                percentUsed: estimate.quota ? Math.round(estimate.usage / estimate.quota * 100) : 0
            };
        } catch (e) {
            return null;
        }
    }
    
    async clearAllCaches() {
        if (this.swRegistration) {
            return new Promise((resolve) => {
                const channel = new MessageChannel();
                channel.port1.onmessage = (event) => {
                    resolve(event.data);
                };
                this.swRegistration.active?.postMessage(
                    { type: 'CLEAR_CACHE' },
                    [channel.port2]
                );
            });
        }
    }
}

// Initialize PWA Manager
window.pwaManager = new PWAManager();

// Export for module usage
if (typeof module !== 'undefined' && module.exports) {
    module.exports = PWAManager;
}
