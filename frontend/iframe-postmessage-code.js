/**
 * CODE À AJOUTER DANS CHAQUE PAGE IFRAME
 * (ai-agent-chat.html, terminal-ssh.html, agent-devops.html)
 * 
 * Ce code permet la communication bidirectionnelle avec le dashboard parent
 */

// ==========================================
// 1. ÉCOUTER LES MESSAGES DU PARENT
// ==========================================

window.addEventListener('message', (event) => {
    // Vérifier que le message provient du même domaine
    if (event.origin !== window.location.origin) {
        console.warn('⚠️ Message from unauthorized origin:', event.origin);
        return;
    }
    
    console.log('📩 Message received from parent:', event.data);
    
    const { type, token } = event.data;
    
    switch (type) {
        case 'AUTH_TOKEN':
            handleAuthToken(token);
            break;
            
        case 'LOGOUT':
            handleLogoutSignal();
            break;
            
        default:
            console.log('📩 Unknown message type:', type);
    }
});

// ==========================================
// 2. GÉRER LE TOKEN D'AUTHENTIFICATION
// ==========================================

function handleAuthToken(token) {
    if (!token) {
        console.error('❌ No token provided');
        return;
    }
    
    try {
        // Sauvegarder le token dans localStorage
        localStorage.setItem('token', token);
        console.log('✅ Token received and saved from parent dashboard');
        
        // Vérifier si on est dans un état non authentifié
        const currentToken = getAuthToken();
        if (!currentToken) {
            console.log('🔄 No existing token, initializing app with new token...');
            initializeApp();
        } else {
            console.log('✅ Token updated, app already initialized');
        }
        
    } catch (error) {
        console.error('❌ Error handling token:', error);
    }
}

// ==========================================
// 3. GÉRER LE SIGNAL DE DÉCONNEXION
// ==========================================

function handleLogoutSignal() {
    console.log('🚪 Logout signal received from parent dashboard');
    
    try {
        // Supprimer le token
        localStorage.removeItem('token');
        
        // Nettoyer l'état de l'application
        cleanupApp();
        
        console.log('✅ Logout completed in iframe');
        
    } catch (error) {
        console.error('❌ Error during logout:', error);
    }
}

// ==========================================
// 4. SIGNALER AU PARENT QUE L'IFRAME EST PRÊTE
// ==========================================

function notifyParentReady() {
    if (window.parent && window.parent !== window) {
        try {
            // Déterminer le nom de la page actuelle
            const pageName = window.location.pathname.includes('chat') ? 'chat' :
                           window.location.pathname.includes('terminal') ? 'terminal' :
                           window.location.pathname.includes('agent') ? 'agent' : 'unknown';
            
            window.parent.postMessage({
                type: 'IFRAME_READY',
                data: {
                    page: pageName,
                    timestamp: new Date().toISOString()
                }
            }, window.location.origin);
            
            console.log(`✅ Notified parent that ${pageName} iframe is ready`);
            
        } catch (error) {
            console.error('❌ Error notifying parent:', error);
        }
    }
}

// ==========================================
// 5. DEMANDER LE TOKEN AU PARENT SI NÉCESSAIRE
// ==========================================

function requestTokenFromParent() {
    const currentToken = getAuthToken();
    
    if (!currentToken && window.parent && window.parent !== window) {
        console.log('🔑 No token found, requesting from parent...');
        
        try {
            window.parent.postMessage({
                type: 'REQUEST_TOKEN',
                data: {
                    timestamp: new Date().toISOString()
                }
            }, window.location.origin);
            
        } catch (error) {
            console.error('❌ Error requesting token:', error);
        }
    }
}

// ==========================================
// 6. NOTIFIER LE PARENT D'UNE ERREUR
// ==========================================

function notifyParentError(errorMessage, errorDetails = {}) {
    if (window.parent && window.parent !== window) {
        try {
            window.parent.postMessage({
                type: 'ERROR',
                data: {
                    message: errorMessage,
                    details: errorDetails,
                    timestamp: new Date().toISOString()
                }
            }, window.location.origin);
            
            console.log('📤 Error notification sent to parent');
            
        } catch (error) {
            console.error('❌ Error notifying parent of error:', error);
        }
    }
}

// ==========================================
// 7. FONCTIONS UTILITAIRES
// ==========================================

function getAuthToken() {
    return localStorage.getItem('token');
}

function isTokenValid(token) {
    if (!token) return false;
    
    try {
        // Décoder le JWT pour vérifier l'expiration
        const payload = JSON.parse(atob(token.split('.')[1]));
        const expirationTime = payload.exp * 1000; // Convertir en millisecondes
        const currentTime = Date.now();
        
        return currentTime < expirationTime;
        
    } catch (error) {
        console.error('❌ Error validating token:', error);
        return false;
    }
}

// ==========================================
// 8. INITIALISATION AU CHARGEMENT
// ==========================================

document.addEventListener('DOMContentLoaded', () => {
    console.log('🚀 Iframe page loading...');
    
    // Vérifier si on a déjà un token
    const existingToken = getAuthToken();
    
    if (existingToken && isTokenValid(existingToken)) {
        console.log('✅ Valid token found, initializing app...');
        initializeApp();
    } else {
        console.log('⚠️ No valid token found');
        
        // Si on est dans un iframe, demander le token au parent
        if (window.parent && window.parent !== window) {
            console.log('📡 Running in iframe, will wait for token from parent...');
            
            // Attendre un peu que le parent soit prêt
            setTimeout(() => {
                notifyParentReady();
                requestTokenFromParent();
            }, 500);
            
        } else {
            // Si on est en standalone, rediriger vers login
            console.log('🔄 Running standalone, redirecting to login...');
            window.location.href = '/';
        }
    }
});

// ==========================================
// 9. FONCTIONS À IMPLÉMENTER PAR CHAQUE PAGE
// ==========================================

/**
 * Fonction à implémenter dans chaque page pour initialiser l'application
 * avec le token d'authentification disponible
 */
function initializeApp() {
    console.log('🔄 initializeApp() should be implemented by the page');
    
    // Exemple d'implémentation:
    // - Charger les conversations
    // - Initialiser le WebSocket
    // - Charger les serveurs
    // - etc.
}

/**
 * Fonction à implémenter pour nettoyer l'état de l'application
 * lors d'une déconnexion
 */
function cleanupApp() {
    console.log('🧹 cleanupApp() should be implemented by the page');
    
    // Exemple d'implémentation:
    // - Fermer les WebSockets
    // - Vider les listes
    // - Réinitialiser l'interface
    // - etc.
}

// ==========================================
// 10. GESTION DES ERREURS GLOBALES
// ==========================================

window.addEventListener('error', (event) => {
    console.error('❌ Global error in iframe:', event.error);
    notifyParentError('Global error', {
        message: event.error?.message,
        stack: event.error?.stack
    });
});

window.addEventListener('unhandledrejection', (event) => {
    console.error('❌ Unhandled promise rejection in iframe:', event.reason);
    notifyParentError('Unhandled promise rejection', {
        reason: event.reason
    });
});

// ==========================================
// EXPORT DES FONCTIONS UTILITAIRES
// ==========================================

// Si vous utilisez des modules ES6, exportez les fonctions:
// export { getAuthToken, isTokenValid, notifyParentError, notifyParentReady };

console.log('✅ PostMessage communication module loaded');
