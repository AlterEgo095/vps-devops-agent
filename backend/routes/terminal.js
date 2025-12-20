/**
 * Routes WebSocket pour Terminal SSH
 * Gère les connexions WebSocket pour xterm.js
 */

import express from 'express';
import crypto from 'crypto';
import { WebSocketServer } from 'ws';
import { db } from '../services/database-sqlite.js';
import * as sshTerminal from '../services/ssh-terminal.js';
import jwt from 'jsonwebtoken';

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'default-secret-change-me';

// ============================================
// FONCTION DE DÉCHIFFREMENT UNIVERSELLE
// ============================================

/**
 * Déchiffre un mot de passe selon son format
 * Supporte Base64 (ancien) et AES-256-CBC (nouveau depuis /sync)
 */
function decryptPassword(encryptedCredentials, secret = process.env.JWT_SECRET || 'default-secret') {
    if (!encryptedCredentials) {
        return '';
    }

    // Détecter le format : AES-256-CBC utilise "IV:encrypted_data"
    if (encryptedCredentials.includes(':')) {
        try {
            // Format AES-256-CBC (nouveau format depuis /sync)
            const [ivHex, encryptedHex] = encryptedCredentials.split(':');
            const iv = Buffer.from(ivHex, 'hex');
            const key = crypto.scryptSync(secret, 'salt', 32);
            const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
            
            let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
            decrypted += decipher.final('utf8');
            
            return decrypted;
        } catch (error) {
            console.error('Erreur déchiffrement AES-256-CBC:', error.message);
            // Fallback vers Base64 si erreur
            return Buffer.from(encryptedCredentials, 'base64').toString();
        }
    } else {
        // Format Base64 (ancien format)
        return Buffer.from(encryptedCredentials, 'base64').toString();
    }
}


/**
 * GET /api/terminal/sessions
 * Récupère la liste des sessions SSH actives
 */
router.get('/sessions', (req, res) => {
    try {
        const sessions = sshTerminal.getActiveSessions();
        res.json({
            success: true,
            sessions: sessions,
            count: sessions.length
        });
    } catch (error) {
        console.error('Error getting sessions:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get sessions'
        });
    }
});

/**
 * Initialiser le serveur WebSocket
 * Appelé depuis server.js après le démarrage du serveur HTTP
 */
export function initializeWebSocket(server) {
    const wss = new WebSocketServer({ 
        server,
        path: '/api/terminal/ws'
    });

    console.log('WebSocket server initialized at /api/terminal/ws');

    wss.on('connection', (ws, req) => {
        console.log('New WebSocket connection attempt');

        let sessionId = null;
        let authenticated = false;

        // Gérer les messages du client
        ws.on('message', async (message) => {
            try {
                const data = JSON.parse(message.toString());
                
                // Authentification requise en premier
                if (data.type === 'auth') {
                    try {
                        // Vérifier le token JWT
                        const decoded = jwt.verify(data.token, JWT_SECRET);
                        authenticated = true;
                        
                        console.log(`WebSocket authenticated for user: ${decoded.username}`);
                        
                        ws.send(JSON.stringify({
                            type: 'auth_success',
                            message: 'Authentication successful'
                        }));
                    } catch (error) {
                        console.error('WebSocket authentication failed:', error);
                        ws.send(JSON.stringify({
                            type: 'auth_error',
                            message: 'Authentication failed'
                        }));
                        ws.close();
                        return;
                    }
                }
                
                // Toutes les autres actions nécessitent une authentification
                if (!authenticated) {
                    ws.send(JSON.stringify({
                        type: 'error',
                        message: 'Not authenticated'
                    }));
                    return;
                }

                // Connexion SSH
                if (data.type === 'connect') {
                    // Générer un ID de session
                    sessionId = sshTerminal.generateSessionId();
                    
                    // Récupérer les informations du serveur depuis la DB
                    let serverConfig;
                    
                    if (data.serverId) {
                        // Connexion à un serveur enregistré
                        const server = db.prepare(`
                            SELECT * FROM servers WHERE id = ?
                        `).get(data.serverId);
                        
                        if (!server) {
                            ws.send(JSON.stringify({
                                type: 'error',
                                message: 'Server not found'
                            }));
                            return;
                        }
                        
                        // Décrypter les credentials
                        serverConfig = {
                            host: server.host,
                            port: server.port || 22,
                            username: server.username,
                            password: decryptPassword(server.encrypted_credentials)
                        };
                    } else if (data.serverConfig) {
                        // Connexion directe avec config fournie
                        serverConfig = data.serverConfig;
                    } else {
                        ws.send(JSON.stringify({
                            type: 'error',
                            message: 'Server configuration required'
                        }));
                        return;
                    }
                    
                    // Créer la session SSH
                    console.log(`Creating SSH session to ${serverConfig.host}:${serverConfig.port}`);
                    sshTerminal.createSSHSession(sessionId, serverConfig, ws);
                }
                
                // Envoyer des données au terminal
                else if (data.type === 'data') {
                    if (!sessionId) {
                        ws.send(JSON.stringify({
                            type: 'error',
                            message: 'No active session'
                        }));
                        return;
                    }
                    
                    sshTerminal.sendDataToSSH(sessionId, data.data);
                }
                
                // Redimensionner le terminal
                else if (data.type === 'resize') {
                    if (!sessionId) {
                        ws.send(JSON.stringify({
                            type: 'error',
                            message: 'No active session'
                        }));
                        return;
                    }
                    
                    sshTerminal.resizeTerminal(sessionId, data.cols, data.rows);
                }
                
                // Déconnexion
                else if (data.type === 'disconnect') {
                    if (sessionId) {
                        sshTerminal.closeSSHSession(sessionId);
                        sessionId = null;
                    }
                }
                
            } catch (error) {
                console.error('Error handling WebSocket message:', error);
                ws.send(JSON.stringify({
                    type: 'error',
                    message: error.message
                }));
            }
        });

        // Gérer la fermeture de connexion
        ws.on('close', () => {
            console.log(`WebSocket closed${sessionId ? ` for session ${sessionId}` : ''}`);
            if (sessionId) {
                sshTerminal.closeSSHSession(sessionId);
            }
        });

        // Gérer les erreurs
        ws.on('error', (error) => {
            console.error('WebSocket error:', error);
            if (sessionId) {
                sshTerminal.closeSSHSession(sessionId);
            }
        });
    });

    return wss;
}

export default router;
