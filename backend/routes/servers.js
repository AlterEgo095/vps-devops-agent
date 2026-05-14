/**
 * Routes API pour la gestion des serveurs
 * Utilisé par les interfaces frontend (agent-devops.html, terminal-ssh.html, etc.)
 * 
 * [BUGFIX] P2 — Utilise encrypted_credentials + crypto-manager
 * au lieu de la colonne password qui n'existe pas dans le schéma DB.
 */

import express from 'express';
import { db } from '../services/database-sqlite.js';
import { authenticateToken } from '../middleware/auth.js';
import { validateBody, validateParams } from '../middleware/validate.js';
import { createServerSchema, updateServerSchema, idParamSchema } from '../middleware/validation-schemas.js';
import { encryptPassword, decryptPassword } from '../services/crypto-manager.js';
import logger from '../config/logger.js';

const router = express.Router();

// Apply authentication middleware to all routes
router.use(authenticateToken);

/**
 * GET /api/servers
 * Liste tous les serveurs — route racine (utilisée par dashboard.html)
 */
router.get('/', async (req, res) => {
    try {
        const userId = req.user.id;
        
        const servers = db.prepare(`
            SELECT 
                id, name, host, port, username, auth_type,
                tags, description, status, last_check,
                cpu_usage, memory_usage, uptime, disk_usage, os_info, ip_address,
                created_at, updated_at
            FROM servers
            WHERE user_id = ?
            ORDER BY name
        `).all(userId);
        
        res.json({
            success: true,
            servers: servers,
            count: servers.length
        });
    } catch (error) {
        logger.error('Error fetching servers:', { error: error.message });
        res.status(500).json({
            success: false,
            error: 'Failed to fetch servers',
            servers: []
        });
    }
});

/**
 * GET /api/servers/list
 * Liste tous les serveurs de l'utilisateur (alias)
 */
router.get('/list', async (req, res) => {
    try {
        const userId = req.user.id;
        
        const servers = db.prepare(`
            SELECT 
                id, name, host, port, username, auth_type,
                tags, description, status, last_check,
                cpu_usage, memory_usage, uptime, disk_usage, os_info, ip_address,
                created_at, updated_at
            FROM servers
            WHERE user_id = ?
            ORDER BY name
        `).all(userId);
        
        res.json({
            success: true,
            servers: servers,
            count: servers.length
        });
    } catch (error) {
        logger.error('Error fetching servers:', { error: error.message });
        res.status(500).json({
            success: false,
            error: 'Failed to fetch servers',
            servers: []
        });
    }
});

/**
 * GET /api/servers/:id
 * Récupère les détails d'un serveur spécifique
 */
router.get('/:id', validateParams(idParamSchema), async (req, res) => {
    try {
        const userId = req.user.id;
        const serverId = req.params.id;
        
        const server = db.prepare(`
            SELECT 
                id, name, host, port, username, auth_type,
                tags, description, status, last_check,
                cpu_usage, memory_usage, uptime, disk_usage, os_info, ip_address,
                created_at, updated_at
            FROM servers
            WHERE id = ? AND user_id = ?
        `).get(serverId, userId);
        
        if (!server) {
            return res.status(404).json({
                success: false,
                error: 'Server not found'
            });
        }
        
        res.json({
            success: true,
            server: server
        });
    } catch (error) {
        logger.error('Error fetching server:', { error: error.message });
        res.status(500).json({
            success: false,
            error: 'Failed to fetch server'
        });
    }
});

/**
 * POST /api/servers
 * Crée un nouveau serveur
 * [BUGFIX] Utilise encrypted_credentials + crypto-manager au lieu de password
 */
router.post('/', validateBody(createServerSchema), async (req, res) => {
    try {
        const userId = req.user.id;
        const { name, host, port, username, password, auth_type, tags, description } = req.body;
        
        // [SECURITY] P1 — Chiffrement AES-256-CBC via crypto-manager
        const encryptedCredentials = encryptPassword(password || '');
        
        const stmt = db.prepare(`
            INSERT INTO servers (
                user_id, name, host, port, username, 
                auth_type, encrypted_credentials, tags, description, 
                status, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', datetime('now'), datetime('now'))
        `);
        
        const result = stmt.run(
            userId,
            name,
            host,
            port || 22,
            username,
            auth_type || 'password',
            encryptedCredentials,
            tags || null,
            description || null
        );
        
        const newServer = db.prepare(`
            SELECT id, name, host, port, username, tags, status, created_at
            FROM servers WHERE id = ?
        `).get(result.lastInsertRowid);
        
        res.json({
            success: true,
            message: 'Server created successfully',
            server: newServer
        });
    } catch (error) {
        logger.error('Error creating server:', { error: error.message });
        res.status(500).json({
            success: false,
            error: 'Failed to create server'
        });
    }
});

/**
 * PUT /api/servers/:id
 * Met à jour un serveur existant
 * [BUGFIX] Utilise encrypted_credentials + crypto-manager au lieu de password
 */
router.put('/:id', validateParams(idParamSchema), validateBody(updateServerSchema), async (req, res) => {
    try {
        const userId = req.user.id;
        const serverId = req.params.id;
        const { name, host, port, username, password, auth_type, tags, description } = req.body;
        
        // Verify ownership
        const server = db.prepare('SELECT id FROM servers WHERE id = ? AND user_id = ?').get(serverId, userId);
        if (!server) {
            return res.status(404).json({
                success: false,
                error: 'Server not found'
            });
        }
        
        // Préparer les champs à mettre à jour
        const updates = [];
        const values = [];
        
        if (name !== undefined) { updates.push('name = ?'); values.push(name); }
        if (host !== undefined) { updates.push('host = ?'); values.push(host); }
        if (port !== undefined) { updates.push('port = ?'); values.push(port); }
        if (username !== undefined) { updates.push('username = ?'); values.push(username); }
        if (auth_type !== undefined) { updates.push('auth_type = ?'); values.push(auth_type); }
        if (tags !== undefined) { updates.push('tags = ?'); values.push(tags); }
        if (description !== undefined) { updates.push('description = ?'); values.push(description); }
        
        // [SECURITY] P1 — Chiffrer le mot de passe avec AES-256-CBC
        if (password) {
            updates.push('encrypted_credentials = ?');
            values.push(encryptPassword(password));
        }
        
        updates.push("updated_at = datetime('now')");
        values.push(serverId, userId);
        
        db.prepare(`
            UPDATE servers 
            SET ${updates.join(', ')}
            WHERE id = ? AND user_id = ?
        `).run(...values);
        
        const updatedServer = db.prepare(`
            SELECT id, name, host, port, username, tags, status, updated_at
            FROM servers WHERE id = ?
        `).get(serverId);
        
        res.json({
            success: true,
            message: 'Server updated successfully',
            server: updatedServer
        });
    } catch (error) {
        logger.error('Error updating server:', { error: error.message });
        res.status(500).json({
            success: false,
            error: 'Failed to update server'
        });
    }
});

/**
 * DELETE /api/servers/:id
 * Supprime un serveur
 */
router.delete('/:id', validateParams(idParamSchema), async (req, res) => {
    try {
        const userId = req.user.id;
        const serverId = req.params.id;
        
        const result = db.prepare('DELETE FROM servers WHERE id = ? AND user_id = ?').run(serverId, userId);
        
        if (result.changes === 0) {
            return res.status(404).json({
                success: false,
                error: 'Server not found'
            });
        }
        
        res.json({
            success: true,
            message: 'Server deleted successfully'
        });
    } catch (error) {
        logger.error('Error deleting server:', { error: error.message });
        res.status(500).json({
            success: false,
            error: 'Failed to delete server'
        });
    }
});

export default router;
