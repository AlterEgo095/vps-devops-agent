// Gestion du sélecteur de serveurs pour Agent Autonome

// Fonction pour récupérer le token d'authentification
function getAuthToken() {
    return localStorage.getItem('authToken');
}

// Charger la liste des serveurs
async function loadServers() {
    try {
        const authToken = getAuthToken();
        
        if (!authToken) {
            console.warn('⚠️  Aucun token d\'authentification - connexion requise');
            const select = document.getElementById("serverSelect");
            if (select) {
                select.innerHTML = "<option value=''>Connectez-vous d'abord...</option>";
                select.disabled = true;
            }
            return;
        }

        const response = await fetch("/api/servers/list", {
            headers: {
                "Authorization": "Bearer " + authToken
            }
        });

        if (!response.ok) {
            if (response.status === 401) {
                console.error('❌ Token invalide - reconnexion requise');
                const select = document.getElementById("serverSelect");
                if (select) {
                    select.innerHTML = "<option value=''>Session expirée - reconnectez-vous...</option>";
                    select.disabled = true;
                }
                return;
            }
            throw new Error(`HTTP ${response.status}`);
        }

        const data = await response.json();

        if (data.success && data.servers && data.servers.length > 0) {
            const select = document.getElementById("serverSelect");
            if (!select) {
                console.error('❌ Élément serverSelect introuvable');
                return;
            }
            
            select.disabled = false;
            select.innerHTML = "<option value=''>Sélectionner un serveur...</option>";
            
            data.servers.forEach(server => {
                const option = document.createElement("option");
                option.value = server.id;
                option.textContent = `${server.name} (${server.username}@${server.host}:${server.port || 22})`;
                option.dataset.host = server.host;
                option.dataset.port = server.port || 22;
                option.dataset.username = server.username;
                option.dataset.password = server.password || '';
                option.dataset.name = server.name;
                select.appendChild(option);
            });

            console.log(`✅ ${data.servers.length} serveur(s) chargé(s)`);
        } else {
            console.warn('⚠️  Aucun serveur disponible');
            const select = document.getElementById("serverSelect");
            if (select) {
                select.innerHTML = "<option value=''>Aucun serveur disponible</option>";
                select.disabled = true;
            }
        }
    } catch (error) {
        console.error("❌ Erreur lors du chargement des serveurs:", error);
        const select = document.getElementById("serverSelect");
        if (select) {
            select.innerHTML = "<option value=''>Erreur de chargement</option>";
            select.disabled = true;
        }
    }
}

// Gestion du changement de serveur
function handleServerChange() {
    const select = document.getElementById("serverSelect");
    if (!select) return;
    
    const selectedOption = select.options[select.selectedIndex];
    
    if (!selectedOption || !selectedOption.value) {
        // Aucun serveur sélectionné
        currentServerContext = null;
        updateServerIndicator(null);
        console.log('🔴 Aucun serveur sélectionné');
        return;
    }
    
    // Mise à jour du contexte serveur
    currentServerContext = {
        serverId: selectedOption.value,
        host: selectedOption.dataset.host,
        port: parseInt(selectedOption.dataset.port) || 22,
        username: selectedOption.dataset.username,
        password: selectedOption.dataset.password || '',
        name: selectedOption.dataset.name,
        connected: true
    };
    
    // Mise à jour de l'indicateur visuel
    if (typeof updateServerIndicator === 'function') {
        updateServerIndicator(currentServerContext);
    }
    
    console.log(`✅ Serveur sélectionné: ${currentServerContext.username}@${currentServerContext.host}`);
}

// Export pour utilisation externe si nécessaire
if (typeof window !== 'undefined') {
    window.loadServers = loadServers;
    window.handleServerChange = handleServerChange;
}
