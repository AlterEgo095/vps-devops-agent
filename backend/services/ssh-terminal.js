/**
 * Service SSH Terminal — Version Premium v2.0
 * Gère les connexions SSH via WebSocket avec xterm.js
 * 
 * AMÉLIORATIONS:
 * - Support tryKeyboard pour les serveurs avec authentification KbdInteractive
 * - Debug logging détaillé pour le diagnostic
 * - Gestion robuste des erreurs d'authentification
 * - Support des méthodes d'authentification multiples
 * - Nettoyage automatique des sessions expirées
 */

import { Client } from 'ssh2';
import crypto from 'crypto';
import logger from '../config/logger.js';

// Map pour stocker les sessions SSH actives
const activeSessions = new Map();

// Nettoyage automatique des sessions orphelines toutes les 5 minutes
setInterval(() => {
    const now = Date.now();
    for (const [sessionId, session] of activeSessions) {
        // Fermer les sessions de plus de 8 heures
        if (now - session.startTime > 8 * 60 * 60 * 1000) {
            logger.info(`Cleaning expired SSH session: ${sessionId}`);
            try {
                if (session.stream) session.stream.end();
                if (session.connection) session.connection.end();
            } catch (e) { /* ignore */ }
            activeSessions.delete(sessionId);
        }
        // Fermer les sessions dont le WebSocket est fermé
        if (session.websocket && session.websocket.readyState !== 1) {
            logger.info(`Cleaning orphaned SSH session (WS closed): ${sessionId}`);
            try {
                if (session.stream) session.stream.end();
                if (session.connection) session.connection.end();
            } catch (e) { /* ignore */ }
            activeSessions.delete(sessionId);
        }
    }
}, 5 * 60 * 1000);

/**
 * Créer une nouvelle session SSH
 */
export function createSSHSession(sessionId, serverConfig, ws) {
    const conn = new Client();
    
    logger.info(`[SSH-Terminal] Creating session ${sessionId} to ${serverConfig.host}:${serverConfig.port || 22} as ${serverConfig.username}`);
    
    // Événements de connexion
    conn.on('ready', () => {
        logger.info(`[SSH-Terminal] Session ${sessionId} connected successfully`);
        
        // Ouvrir un shell
        conn.shell({
            term: 'xterm-256color',
            cols: 80,
            rows: 24
        }, (err, stream) => {
            if (err) {
                logger.error(`[SSH-Terminal] Shell error for ${sessionId}:`, err);
                ws.send(JSON.stringify({
                    type: 'error',
                    message: `Failed to open shell: ${err.message}`
                }));
                conn.end();
                return;
            }

            // Stocker la session
            activeSessions.set(sessionId, {
                connection: conn,
                stream: stream,
                websocket: ws,
                serverConfig: serverConfig,
                startTime: Date.now()
            });

            // Envoyer confirmation au client
            ws.send(JSON.stringify({
                type: 'connected',
                sessionId: sessionId,
                message: `Connected to ${serverConfig.host}`
            }));

            // Transférer les données du stream SSH vers WebSocket
            stream.on('data', (data) => {
                try {
                    if (ws.readyState === 1) {
                        ws.send(JSON.stringify({
                            type: 'data',
                            data: data.toString('utf-8')
                        }));
                    }
                } catch (error) {
                    logger.error(`[SSH-Terminal] Error sending data to WS for ${sessionId}:`, error.message);
                }
            });

            // Gérer la fermeture du stream
            stream.on('close', () => {
                logger.info(`[SSH-Terminal] Stream closed for ${sessionId}`);
                try {
                    if (ws.readyState === 1) {
                        ws.send(JSON.stringify({
                            type: 'disconnected',
                            message: 'SSH connection closed'
                        }));
                    }
                } catch (e) { /* ignore */ }
                conn.end();
                activeSessions.delete(sessionId);
            });

            stream.stderr.on('data', (data) => {
                try {
                    if (ws.readyState === 1) {
                        ws.send(JSON.stringify({
                            type: 'data',
                            data: data.toString('utf-8')
                        }));
                    }
                } catch (error) {
                    logger.error(`[SSH-Terminal] Error sending stderr to WS for ${sessionId}:`, error.message);
                }
            });
        });
    });

    // Gérer les erreurs de connexion — DIAGNOSTIC AMÉLIORÉ
    conn.on('error', (err) => {
        const errLevel = err.level || 'unknown';
        let userMessage = `SSH connection error: ${err.message}`;
        
        // Messages d'erreur plus explicites pour l'utilisateur
        if (errLevel === 'client-authentication' || err.message.includes('authentication methods failed')) {
            userMessage = 'Échec d\'authentification SSH: Vérifiez le nom d\'utilisateur et le mot de passe. Assurez-vous que l\'authentification par mot de passe est activée sur le serveur.';
            logger.warn(`[SSH-Terminal] Auth failed for ${sessionId}: host=${serverConfig.host}, user=${serverConfig.username}, passwordProvided=${!!serverConfig.password}, passwordLen=${serverConfig.password?.length || 0}, keyProvided=${!!serverConfig.privateKey}`);
            // Debug: Verify password was transmitted correctly
            if (serverConfig.password) {
              logger.info(`[SSH-Terminal] Password debug: length=${serverConfig.password.length}, first2=${serverConfig.password.substring(0,2)}, last2=${serverConfig.password.substring(serverConfig.password.length-2)}`);
            } else {
              logger.error(`[SSH-Terminal] No password provided for SSH connection! serverConfig keys: ${Object.keys(serverConfig).join(',')}`);
            }
        } else if (errLevel === 'client-timeout' || err.message.includes('timed out')) {
            userMessage = 'Délai d\'attente dépassé: Le serveur ne répond pas. Vérifiez l\'adresse et le port.';
        } else if (err.code === 'ECONNREFUSED') {
            userMessage = 'Connexion refusée: Le serveur n\'accepte pas les connexions SSH sur ce port.';
        } else if (err.code === 'ENOTFOUND') {
            userMessage = 'Serveur introuvable: L\'adresse hôte ne peut pas être résolue.';
        }
        
        logger.error(`[SSH-Terminal] Connection error for ${sessionId}: level=${errLevel}, msg=${err.message}`);
        
        try {
            if (ws.readyState === 1) {
                ws.send(JSON.stringify({
                    type: 'error',
                    message: userMessage
                }));
            }
        } catch (e) { /* ignore */ }
        activeSessions.delete(sessionId);
    });

    // Gérer la fermeture de connexion
    conn.on('close', () => {
        logger.info(`[SSH-Terminal] Connection closed for ${sessionId}`);
        activeSessions.delete(sessionId);
    });

    // Se connecter au serveur SSH
    try {
        const connectionConfig = {
            host: serverConfig.host,
            port: serverConfig.port || 22,
            username: serverConfig.username,
            readyTimeout: 30000,
            keepaliveInterval: 10000,
            keepaliveCountMax: 3,
            // IMPORTANT: tryKeyboard permet à ssh2 de répondre aux défis
            // keyboard-interactive, ce qui est nécessaire pour certains
            // serveurs SSH qui utilisent PAM ou d'autres méthodes d'auth
            tryKeyboard: true
        };

        // Ajouter l'authentification (mot de passe ou clé privée)
        if (serverConfig.password) {
            connectionConfig.password = serverConfig.password;
            logger.info(`[SSH-Terminal] Using password auth for ${sessionId}`);
        } else if (serverConfig.privateKey) {
            connectionConfig.privateKey = serverConfig.privateKey;
            if (serverConfig.passphrase) {
                connectionConfig.passphrase = serverConfig.passphrase;
            }
            logger.info(`[SSH-Terminal] Using private key auth for ${sessionId}`);
        } else {
            throw new Error('Aucune méthode d\'authentification fournie. Fournissez un mot de passe ou une clé privée.');
        }

        // Handler pour keyboard-interactive authentication
        // Certains serveurs SSH (Ubuntu avec PAM) nécessitent cette méthode
        conn.on('keyboard-interactive', (name, instructions, lang, prompts, finish) => {
            logger.info(`[SSH-Terminal] Keyboard-interactive auth requested for ${sessionId}: name="${name}", prompts=${prompts.length}`);
            // Répondre aux prompts avec le mot de passe
            const responses = prompts.map(() => serverConfig.password || '');
            finish(responses);
        });

        logger.info(`[SSH-Terminal] Connecting to ${serverConfig.host}:${serverConfig.port || 22}...`);
        conn.connect(connectionConfig);
    } catch (error) {
        logger.error(`[SSH-Terminal] Failed to initiate SSH connection for ${sessionId}:`, error);
        try {
            if (ws.readyState === 1) {
                ws.send(JSON.stringify({
                    type: 'error',
                    message: `Connection failed: ${error.message}`
                }));
            }
        } catch (e) { /* ignore */ }
        activeSessions.delete(sessionId);
    }

    return sessionId;
}

/**
 * Envoyer des données au terminal SSH
 */
export function sendDataToSSH(sessionId, data) {
    const session = activeSessions.get(sessionId);
    if (!session || !session.stream) {
        return false;
    }

    try {
        session.stream.write(data);
        return true;
    } catch (error) {
        logger.error(`[SSH-Terminal] Error writing to stream for ${sessionId}:`, error.message);
        return false;
    }
}

/**
 * Redimensionner le terminal
 */
export function resizeTerminal(sessionId, cols, rows) {
    const session = activeSessions.get(sessionId);
    if (!session || !session.stream) {
        return false;
    }

    try {
        session.stream.setWindow(rows, cols);
        return true;
    } catch (error) {
        logger.error(`[SSH-Terminal] Error resizing for ${sessionId}:`, error.message);
        return false;
    }
}

/**
 * Fermer une session SSH
 */
export function closeSSHSession(sessionId) {
    const session = activeSessions.get(sessionId);
    if (!session) {
        return;
    }

    try {
        if (session.stream) session.stream.end();
        if (session.connection) session.connection.end();
        activeSessions.delete(sessionId);
        logger.info(`[SSH-Terminal] Session ${sessionId} closed successfully`);
    } catch (error) {
        logger.error(`[SSH-Terminal] Error closing session ${sessionId}:`, error.message);
    }
}

/**
 * Obtenir les informations d'une session
 */
export function getSessionInfo(sessionId) {
    const session = activeSessions.get(sessionId);
    if (!session) return null;

    return {
        sessionId,
        host: session.serverConfig.host,
        username: session.serverConfig.username,
        startTime: session.startTime,
        uptime: Date.now() - session.startTime
    };
}

/**
 * Obtenir toutes les sessions actives
 */
export function getActiveSessions() {
    const sessions = [];
    activeSessions.forEach((session, sessionId) => {
        sessions.push({
            sessionId,
            host: session.serverConfig.host,
            username: session.serverConfig.username,
            startTime: session.startTime,
            uptime: Date.now() - session.startTime
        });
    });
    return sessions;
}

/**
 * Générer un ID de session unique
 */
export function generateSessionId() {
    return `ssh_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`;
}
