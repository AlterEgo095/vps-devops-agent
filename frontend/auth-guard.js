/**
 * 🔐 AUTH GUARD - Module d'Authentification Centralisé
 * Version: 2.0
 * Description: Système de protection et gestion d'authentification pour toutes les pages
 */

(function(window) {
    'use strict';
    
    const AuthGuard = {
        // Configuration
        config: {
            loginPage: '/',
            dashboardPage: '/dashboard.html',
            tokenKey: 'authToken',
            userKey: 'user',
            debugMode: true
        },
        
        // État interne
        state: {
            token: null,
            user: null,
            isAuthenticated: false
        },
        
        /**
         * Initialiser le système d'authentification
         * @param {Object} options - Options de configuration
         */
        init(options = {}) {
            this.config = { ...this.config, ...options };
            this.loadFromStorage();
            this.log('AuthGuard initialized', this.state);
        },
        
        /**
         * Charger les données depuis localStorage
         */
        loadFromStorage() {
            try {
                this.state.token = localStorage.getItem(this.config.tokenKey);
                const userStr = localStorage.getItem(this.config.userKey);
                this.state.user = userStr ? JSON.parse(userStr) : null;
                this.state.isAuthenticated = !!this.state.token;
            } catch (error) {
                this.logError('Error loading from storage', error);
                this.clearAuth();
            }
        },
        
        /**
         * Sauvegarder l'authentification
         * @param {String} token - JWT token
         * @param {Object} user - User data
         */
        saveAuth(token, user = null) {
            try {
                localStorage.setItem(this.config.tokenKey, token);
                if (user) {
                    localStorage.setItem(this.config.userKey, JSON.stringify(user));
                }
                this.state.token = token;
                this.state.user = user;
                this.state.isAuthenticated = true;
                this.log('Auth saved successfully');
            } catch (error) {
                this.logError('Error saving auth', error);
            }
        },
        
        /**
         * Effacer l'authentification
         */
        clearAuth() {
            localStorage.removeItem(this.config.tokenKey);
            localStorage.removeItem(this.config.userKey);
            this.state.token = null;
            this.state.user = null;
            this.state.isAuthenticated = false;
            this.log('Auth cleared');
        },
        
        /**
         * Vérifier si l'utilisateur est authentifié
         * @returns {Boolean}
         */
        isAuthenticated() {
            return this.state.isAuthenticated && !!this.state.token;
        },
        
        /**
         * Obtenir le token
         * @returns {String|null}
         */
        getToken() {
            if (!this.state.token) {
                this.loadFromStorage();
            }
            return this.state.token;
        },
        
        /**
         * Obtenir les informations utilisateur
         * @returns {Object|null}
         */
        getUser() {
            if (!this.state.user) {
                this.loadFromStorage();
            }
            return this.state.user;
        },
        
        /**
         * Vérifier si le token est expiré
         * @returns {Boolean}
         */
        isTokenExpired() {
            const token = this.getToken();
            if (!token) return true;
            
            try {
                const payload = JSON.parse(atob(token.split('.')[1]));
                const exp = payload.exp * 1000; // Convert to milliseconds
                return Date.now() >= exp;
            } catch (error) {
                this.logError('Error checking token expiration', error);
                return true;
            }
        },
        
        /**
         * Protéger une page (rediriger si non authentifié)
         * @param {Object} options - Options de protection
         */
        protectPage(options = {}) {
            const {
                requireAuth = true,
                redirectIfAuth = false,
                onSuccess = null,
                onFail = null
            } = options;
            
            this.loadFromStorage();
            
            // Si la page nécessite l'authentification
            if (requireAuth) {
                if (!this.isAuthenticated()) {
                    this.log('⛔ Access denied: Not authenticated');
                    if (onFail) onFail();
                    this.redirectToLogin();
                    return false;
                }
                
                // Vérifier l'expiration du token
                if (this.isTokenExpired()) {
                    this.log('⛔ Access denied: Token expired');
                    this.clearAuth();
                    if (onFail) onFail();
                    this.redirectToLogin();
                    return false;
                }
                
                this.log('✅ Access granted: User authenticated');
                if (onSuccess) onSuccess();
                return true;
            }
            
            // Si la page doit rediriger si déjà authentifié (page login)
            if (redirectIfAuth && this.isAuthenticated() && !this.isTokenExpired()) {
                this.log('🔄 Redirecting: Already authenticated');
                this.redirectToDashboard();
                return false;
            }
            
            return true;
        },
        
        /**
         * Rediriger vers la page de connexion
         */
        redirectToLogin() {
            window.location.href = this.config.loginPage;
        },
        
        /**
         * Rediriger vers le dashboard
         */
        redirectToDashboard() {
            window.location.href = this.config.dashboardPage;
        },
        
        /**
         * Déconnexion
         */
        logout() {
            this.log('User logged out');
            this.clearAuth();
            this.redirectToLogin();
        },
        
        /**
         * Créer un intercepteur pour fetch API
         * @returns {Function}
         */
        createApiInterceptor() {
            const self = this;
            
            return async function(endpoint, options = {}) {
                const token = self.getToken();
                
                if (!token) {
                    throw new Error('No authentication token available');
                }
                
                const url = endpoint.startsWith('http') ? endpoint : `/api${endpoint}`;
                
                const response = await fetch(url, {
                    ...options,
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`,
                        ...options.headers
                    }
                });
                
                // Si 401 ou 403, le token est invalide
                if (response.status === 401 || response.status === 403) {
                    self.log('⛔ API call failed: Invalid token');
                    self.clearAuth();
                    self.redirectToLogin();
                    throw new Error('Authentication failed');
                }
                
                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }
                
                return response.json();
            };
        },
        
        /**
         * Configurer l'écoute des messages postMessage (pour iframes)
         * @param {Function} callback - Callback quand le token est reçu
         */
        listenForToken(callback) {
            window.addEventListener('message', (event) => {
                // Vérifier l'origine
                if (event.origin !== window.location.origin) {
                    this.logError('Message from untrusted origin', event.origin);
                    return;
                }
                
                const { type, token } = event.data;
                
                if (type === 'AUTH_TOKEN' && token) {
                    this.log('📩 Token received via postMessage');
                    this.saveAuth(token);
                    
                    if (callback) {
                        callback(token);
                    }
                }
            });
            
            // Vérifier aussi le localStorage au chargement
            window.addEventListener('DOMContentLoaded', () => {
                const token = this.getToken();
                if (token && callback) {
                    this.log('📦 Token found in localStorage');
                    callback(token);
                }
            });
        },
        
        /**
         * Logger avec préfixe
         */
        log(...args) {
            if (this.config.debugMode) {
                console.log('[AuthGuard]', ...args);
            }
        },
        
        /**
         * Logger les erreurs
         */
        logError(...args) {
            console.error('[AuthGuard ERROR]', ...args);
        }
    };
    
    // Exposer globalement
    window.AuthGuard = AuthGuard;
    
    // Auto-initialiser
    AuthGuard.init();
    
})(window);
