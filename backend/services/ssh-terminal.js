/**
 * Service SSH Terminal
 * Gère les connexions SSH via WebSocket avec xterm.js
 */

import { Client } from 'ssh2';
import crypto from 'crypto';

// Map pour stocker les sessions SSH actives
const activeSessions = new Map();

/**
 * Créer une nouvelle session SSH
 */
export function createSSHSession(sessionId, serverConfig, ws) {
    const conn = new Client();
    
    // Événements de connexion
    conn.on('ready', () => {
        console.log(`SSH session ${sessionId} ready`);
        
        // Ouvrir un shell
        conn.shell({
            term: 'xterm-256color',
            cols: 80,
            rows: 24
        }, (err, stream) => {
            if (err) {
                console.error('Shell error:', err);
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
                    ws.send(JSON.stringify({
                        type: 'data',
                        data: data.toString('utf-8')
                    }));
                } catch (error) {
                    console.error('Error sending data to WebSocket:', error);
                }
            });

            // Gérer la fermeture du stream
            stream.on('close', () => {
                console.log(`SSH stream closed for session ${sessionId}`);
                ws.send(JSON.stringify({
                    type: 'disconnected',
                    message: 'SSH connection closed'
                }));
                conn.end();
                activeSessions.delete(sessionId);
            });

            stream.stderr.on('data', (data) => {
                try {
                    ws.send(JSON.stringify({
                        type: 'data',
                        data: data.toString('utf-8')
                    }));
                } catch (error) {
                    console.error('Error sending stderr to WebSocket:', error);
                }
            });
        });
    });

    // Gérer les erreurs de connexion
    conn.on('error', (err) => {
        console.error(`SSH connection error for session ${sessionId}:`, err);
        ws.send(JSON.stringify({
            type: 'error',
            message: `SSH connection error: ${err.message}`
        }));
        activeSessions.delete(sessionId);
    });

    // Gérer la fermeture de connexion
    conn.on('close', () => {
        console.log(`SSH connection closed for session ${sessionId}`);
        activeSessions.delete(sessionId);
    });

    // Se connecter au serveur SSH
    try {
        const connectionConfig = {
            host: serverConfig.host,
            port: serverConfig.port || 22,
            username: serverConfig.username,
            readyTimeout: 30000,
            keepaliveInterval: 10000
        };

        // Ajouter l'authentification (mot de passe ou clé privée)
        if (serverConfig.password) {
            connectionConfig.password = serverConfig.password;
        } else if (serverConfig.privateKey) {
            connectionConfig.privateKey = serverConfig.privateKey;
            if (serverConfig.passphrase) {
                connectionConfig.passphrase = serverConfig.passphrase;
            }
        } else {
            throw new Error('No authentication method provided');
        }

        conn.connect(connectionConfig);
    } catch (error) {
        console.error('Failed to initiate SSH connection:', error);
        ws.send(JSON.stringify({
            type: 'error',
            message: `Connection failed: ${error.message}`
        }));
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
        console.error(`Session ${sessionId} not found or stream not available`);
        return false;
    }

    try {
        session.stream.write(data);
        return true;
    } catch (error) {
        console.error(`Error writing to SSH stream for session ${sessionId}:`, error);
        return false;
    }
}

/**
 * Redimensionner le terminal
 */
export function resizeTerminal(sessionId, cols, rows) {
    const session = activeSessions.get(sessionId);
    if (!session || !session.stream) {
        console.error(`Session ${sessionId} not found`);
        return false;
    }

    try {
        session.stream.setWindow(rows, cols);
        return true;
    } catch (error) {
        console.error(`Error resizing terminal for session ${sessionId}:`, error);
        return false;
    }
}

/**
 * Fermer une session SSH
 */
export function closeSSHSession(sessionId) {
    const session = activeSessions.get(sessionId);
    if (!session) {
        console.log(`Session ${sessionId} already closed`);
        return;
    }

    try {
        if (session.stream) {
            session.stream.end();
        }
        if (session.connection) {
            session.connection.end();
        }
        activeSessions.delete(sessionId);
        console.log(`Session ${sessionId} closed successfully`);
    } catch (error) {
        console.error(`Error closing session ${sessionId}:`, error);
    }
}

/**
 * Obtenir les informations d'une session
 */
export function getSessionInfo(sessionId) {
    const session = activeSessions.get(sessionId);
    if (!session) {
        return null;
    }

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
