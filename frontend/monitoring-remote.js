// 🌐 Monitoring Remote - Gestion du monitoring de serveurs distants via SSH
// Date: 25 novembre 2024

// Variables globales
let currentServerContext = null;
let metricsRefreshInterval = null;

// Écouter les changements de contexte serveur
window.addEventListener('serverContextChanged', (e) => {
    console.log('📡 [Monitoring] Server context changed:', e.detail);
    updateServerContext(e.detail);
});

// Fonction pour mettre à jour le contexte serveur
function updateServerContext(serverContext) {
    currentServerContext = serverContext;
    
    // Afficher l'indicateur de serveur
    const indicator = document.getElementById('server-indicator');
    const serverName = document.getElementById('server-name');
    
    if (serverContext && serverContext.connected) {
        if (indicator) indicator.style.display = 'block';
        if (serverName) serverName.textContent = serverContext.name || `${serverContext.username}@${serverContext.host}`;
        
        // Démarrer la collecte automatique des métriques
        startRemoteMetricsCollection();
    } else {
        if (indicator) indicator.style.display = 'none';
        if (serverName) serverName.textContent = 'Aucun';
        stopRemoteMetricsCollection();
    }
}

// Fonction pour démarrer la collecte des métriques distantes
function startRemoteMetricsCollection() {
    // Arrêter l'ancien intervalle s'il existe
    stopRemoteMetricsCollection();
    
    // Charger immédiatement
    loadRemoteMetrics();
    
    // Puis toutes les 5 secondes
    metricsRefreshInterval = setInterval(() => {
        loadRemoteMetrics();
    }, 5000);
    
    console.log('✅ Remote metrics collection started');
}

// Fonction pour arrêter la collecte des métriques distantes
function stopRemoteMetricsCollection() {
    if (metricsRefreshInterval) {
        clearInterval(metricsRefreshInterval);
        metricsRefreshInterval = null;
        console.log('🛑 Remote metrics collection stopped');
    }
}

// Fonction pour charger les métriques distantes
async function loadRemoteMetrics() {
    if (!currentServerContext) {
        console.warn('No server context available');
        return;
    }
    
    try {
        const response = await fetch('/api/monitoring/remote', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                host: currentServerContext.host,
                port: currentServerContext.port || 22,
                username: currentServerContext.username,
                password: currentServerContext.password,
                serverId: currentServerContext.id
            })
        });
        
        const result = await response.json();
        
        if (result.success) {
            console.log('📊 Remote metrics loaded:', result.data.metrics);
            
            // Utiliser les fonctions existantes pour afficher
            if (typeof displayMetrics === 'function') {
                displayMetrics(result.data.metrics, null);
            }
            if (typeof updateCharts === 'function') {
                updateCharts(result.data.metrics);
            }
        } else {
            console.error('Failed to load remote metrics:', result.error);
        }
    } catch (error) {
        console.error('Error loading remote metrics:', error);
    }
}

// Fonction pour effacer le contexte serveur
function clearServerContext() {
    currentServerContext = null;
    stopRemoteMetricsCollection();
    
    const indicator = document.getElementById('server-indicator');
    if (indicator) indicator.style.display = 'none';
    
    // Revenir au monitoring local
    if (typeof loadMetrics === 'function') {
        loadMetrics();
    }
    
    console.log('🔄 Switched back to local monitoring');
}

console.log('✅ monitoring-remote.js loaded successfully');
