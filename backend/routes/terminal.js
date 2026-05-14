/**
 * Routes WebSocket pour Terminal SSH
 * Gère les connexions WebSocket pour xterm.js
 */

import express from 'express';
import { WebSocketServer } from 'ws';
import { db } from '../services/database-sqlite.js';
import * as sshTerminal from '../services/ssh-terminal.js';
import { decryptPassword, encryptPassword } from '../services/crypto-manager.js';
import jwt from 'jsonwebtoken';
import { authenticateToken } from '../middleware/auth.js';
import logger from '../config/logger.js';

const router = express.Router();
// [SECURITY] P1.2 — Plus de fallback hardcodé. JWT_SECRET validé au boot.
const JWT_SECRET = process.env.JWT_SECRET;


/**
 * GET /api/terminal/sessions
 * Récupère la liste des sessions SSH actives
 * [SECURITY] P3 — Auth requise pour lister les sessions
 */
router.get('/sessions', authenticateToken, (req, res) => {
    try {
        const sessions = sshTerminal.getActiveSessions();
        res.json({
            success: true,
            sessions: sessions,
            count: sessions.length
        });
    } catch (error) {
        logger.error('Error getting sessions:', { error: error.message });
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

    logger.info('WebSocket server initialized at /api/terminal/ws');

    wss.on('connection', (ws, req) => {
        logger.info('New WebSocket connection attempt');

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
                        
                        logger.info(`WebSocket authenticated for user: ${decoded.username}`);
                        
                        ws.send(JSON.stringify({
                            type: 'auth_success',
                            message: 'Authentication successful'
                        }));
                    } catch (error) {
                        logger.warn('WebSocket authentication failed:', { error: error.message });
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
                        // Ensure proper types (port must be integer)
                        serverConfig = {
                            host: String(data.serverConfig.host || ''),
                            port: parseInt(data.serverConfig.port) || 22,
                            username: String(data.serverConfig.username || ''),
                            password: String(data.serverConfig.password || '')
                        };
                        logger.info(`[Terminal-WS] Direct connection: host=${serverConfig.host}, port=${serverConfig.port}, user=${serverConfig.username}, pwdLen=${serverConfig.password.length}`);
                    } else {
                        ws.send(JSON.stringify({
                            type: 'error',
                            message: 'Server configuration required'
                        }));
                        return;
                    }
                    
                    // Créer la session SSH
                    logger.info(`Creating SSH session to ${serverConfig.host}:${serverConfig.port} as ${serverConfig.username}`);
                    sshTerminal.createSSHSession(sessionId, serverConfig, ws);
                    
                    // AUTO-SAVE: Register server in DB after successful SSH connection
                    // Check after 3 seconds if session is still active (SSH connected)
                    const _saveUserId = decoded.id || 'default';
                    const _saveConfig = { ...serverConfig };
                    setTimeout(() => {
                        const sessionInfo = sshTerminal.getSessionInfo(sessionId);
                        if (sessionInfo) {
                            // SSH connected - auto-register the server
                            try {
                                const existing = db.prepare(
                                    'SELECT id FROM servers WHERE host = ? AND port = ? AND username = ? AND user_id = ?'
                                ).get(_saveConfig.host, _saveConfig.port || 22, _saveConfig.username, _saveUserId);
                                
                                if (existing) {
                                    const encCreds = encryptPassword(_saveConfig.password);
                                    db.prepare(
                                        'UPDATE servers SET encrypted_credentials = ?, status = ?, last_check = datetime('now'), updated_at = datetime('now') WHERE id = ?'
                                    ).run(encCreds, 'online', existing.id);
                                    logger.info(`[Terminal] Auto-updated server ${existing.id}`);
                                    try { ws.send(JSON.stringify({ type: 'server_saved', serverId: existing.id, action: 'updated' })); } catch(e) {}
                                } else if (_saveConfig.password) {
                                    const encCreds = encryptPassword(_saveConfig.password);
                                    const result = db.prepare(
                                        'INSERT INTO servers (user_id, name, host, port, username, auth_type, encrypted_credentials, description, status, last_check, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'), datetime('now'))'
                                    ).run(
                                        _saveUserId,
                                        _saveConfig.username + '@' + _saveConfig.host,
                                        _saveConfig.host,
                                        _saveConfig.port || 22,
                                        _saveConfig.username,
                                        'password',
                                        encCreds,
                                        'Auto-enregistre9 depuis Terminal SSH',
                                        'online'
                                    );
                                    logger.info(`[Terminal] Auto-saved new server ${result.lastInsertRowid}`);
                                    try { ws.send(JSON.stringify({ type: 'server_saved', serverId: result.lastInsertRowid, action: 'created' })); } catch(e) {}
                                }
                            } catch (saveErr) {
                                logger.error('[Terminal] Auto-save error:', { error: saveErr.message });
                            }
                        }
                    }, 3000);
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
                logger.error('Error handling WebSocket message:', { error: error.message });
                ws.send(JSON.stringify({
                    type: 'error',
                    message: error.message
                }));
            }
        });

        // Gérer la fermeture de connexion
        ws.on('close', () => {
            logger.info(`WebSocket closed${sessionId ? ` for session ${sessionId}` : ''}`);
            if (sessionId) {
                sshTerminal.closeSSHSession(sessionId);
            }
        });

        // Gérer les erreurs
        ws.on('error', (error) => {
            logger.error('WebSocket error:', { error: error.message });
            if (sessionId) {
                sshTerminal.closeSSHSession(sessionId);
            }
        });
    });

    return wss;
}

export default router;
