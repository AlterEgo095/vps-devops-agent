/**
 * Routes API pour la gestion des serveurs
 * Utilisé par les interfaces frontend (agent-devops.html, terminal-ssh.html, etc.)
 */

import express from 'express';
import { db } from '../services/database-sqlite.js';
import { authenticateToken } from '../middleware/auth.js';
import { validateBody, validateParams } from '../middleware/validate.js';
import { createServerSchema, updateServerSchema, idParamSchema } from '../middleware/validation-schemas.js';

const router = express.Router();

// Apply authentication middleware to all routes
router.use(authenticateToken);

/**
 * GET /api/servers/list
 * Liste tous les serveurs de l'utilisateur
 * Format compatible avec le frontend existant
 */
router.get('/list', async (req, res) => {
    try {
        const userId = req.user.id;
        
        const servers = db.prepare(`
            SELECT 
                id, name, host, port, username, auth_type,
                tags, description, status, last_check,
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
        console.error('Error fetching servers:', error);
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
        console.error('Error fetching server:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch server'
        });
    }
});

/**
 * POST /api/servers
 * Crée un nouveau serveur
 */
router.post('/', validateBody(createServerSchema), async (req, res) => {
    try {
        const userId = req.user.id;
        const { name, host, port, username, password, auth_type, tags, description } = req.body;
        
        const serverId = Date.now();
        
        const stmt = db.prepare(`
            INSERT INTO servers (
                id, user_id, name, host, port, username, 
                password, auth_type, tags, description, 
                status, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', datetime('now'), datetime('now'))
        `);
        
        stmt.run(
            serverId,
            userId,
            name,
            host,
            port || 22,
            username,
            password || null,
            auth_type || 'password',
            tags || null,
            description || null
        );
        
        res.json({
            success: true,
            message: 'Server created successfully',
            serverId: serverId
        });
    } catch (error) {
        console.error('Error creating server:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to create server'
        });
    }
});

/**
 * PUT /api/servers/:id
 * Met à jour un serveur existant
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
        
        const stmt = db.prepare(`
            UPDATE servers 
            SET name = ?, host = ?, port = ?, username = ?, 
                password = ?, auth_type = ?, tags = ?, description = ?,
                updated_at = datetime('now')
            WHERE id = ? AND user_id = ?
        `);
        
        stmt.run(
            name,
            host,
            port || 22,
            username,
            password || null,
            auth_type || 'password',
            tags || null,
            description || null,
            serverId,
            userId
        );
        
        res.json({
            success: true,
            message: 'Server updated successfully'
        });
    } catch (error) {
        console.error('Error updating server:', error);
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
        console.error('Error deleting server:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to delete server'
        });
    }
});

export default router;
