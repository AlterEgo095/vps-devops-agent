/**
 * Module d'initialisation de l'authentification pour Agent Autonome
 * Garantit que AuthGuard est chargé avant d'initialiser authToken
 */

(function() {
    'use strict';
    
    console.log('🚀 [AuthInit] Module chargé');
    
    // Attendre que le DOM soit COMPLÈTEMENT prêt
    function initWhenReady() {
        if (document.readyState === 'complete' || document.readyState === 'interactive') {
            // DOM déjà prêt
            setTimeout(initAuth, 200); // Attendre 200ms pour être sûr
        } else {
            // Attendre DOMContentLoaded
            document.addEventListener('DOMContentLoaded', function() {
                setTimeout(initAuth, 200);
            });
        }
    }
    
    function initAuth() {
        console.log('🔄 [AuthInit] Initialisation de l\'authentification...');
        
        let token = null;
        
        // Méthode 1 : Via AuthGuard (préféré)
        if (typeof AuthGuard !== 'undefined' && AuthGuard.getToken) {
            token = AuthGuard.getToken();
            console.log('🔑 [AuthInit] Token récupéré via AuthGuard:', 
                       token ? '✅ Présent (' + token.substring(0, 20) + '...)' : '❌ Absent');
        } 
        // Méthode 2 : Fallback vers localStorage
        else {
            token = localStorage.getItem('authToken');
            console.log('🔑 [AuthInit] Token récupéré via localStorage (fallback):', 
                       token ? '✅ Présent' : '❌ Absent');
        }
        
        // Exposer le token globalement pour autonomous-chat.html
        window.autonomousChat = window.autonomousChat || {};
        window.autonomousChat.authToken = token;
        console.log('✅ [AuthInit] window.autonomousChat.authToken défini');
        
        // Attendre que loadServers ET le DOM soient prêts
        waitForDOMAndLoadServers(token);
    }
    
    function waitForDOMAndLoadServers(token) {
        let attempts = 0;
        const maxAttempts = 50; // 50 * 100ms = 5 secondes max
        
        const interval = setInterval(() => {
            attempts++;
            
            // Vérifier que loadServers existe ET que serverSelect existe dans le DOM
            const loadServersExists = typeof window.loadServers === 'function';
            const serverSelectExists = document.getElementById('serverSelect') !== null;
            
            if (loadServersExists && serverSelectExists) {
                clearInterval(interval);
                console.log('✅ [AuthInit] loadServers() ET serverSelect détectés, appel en cours...');
                
                try {
                    window.loadServers();
                    console.log('✅ [AuthInit] loadServers() appelé avec succès');
                } catch (error) {
                    console.error('❌ [AuthInit] Erreur lors de l\'appel à loadServers():', error);
                }
            } else if (attempts >= maxAttempts) {
                clearInterval(interval);
                if (!loadServersExists) {
                    console.warn('⚠️  [AuthInit] loadServers() non trouvé après 5 secondes');
                }
                if (!serverSelectExists) {
                    console.warn('⚠️  [AuthInit] serverSelect non trouvé dans le DOM après 5 secondes');
                }
            } else {
                // Log de debug tous les 10 tentatives
                if (attempts % 10 === 0) {
                    console.log(`🔄 [AuthInit] Attente... (loadServers: ${loadServersExists}, serverSelect: ${serverSelectExists})`);
                }
            }
        }, 100);
    }
    
    // Démarrer l'initialisation
    initWhenReady();
    
})();
