/**
 * Routes API pour VPS DevOps Agent
 * Mode Formulaire & Gestion Serveurs
 */

import express from 'express';
import crypto from 'crypto';
import { db } from '../services/database-sqlite.js';
import * as executor from '../services/agent-executor.js';
import { authenticateToken } from '../middleware/auth.js';
import { validateBody, validateParams } from '../middleware/validate.js';
import { 
  createServerSchema, 
  updateServerSchema, 
  idParamSchema,
  executeMultiServerCommandSchema,
  executeCommandSchema,
  createTemplateSchema
} from '../middleware/validation-schemas.js';

const router = express.Router();

// Apply authentication middleware to all routes
router.use(authenticateToken);

// ============================================
// FONCTION DE DÉCHIFFREMENT UNIVERSELLE
// ============================================

/**
 * Déchiffre un mot de passe selon son format
 * Supporte Base64 (ancien) et AES-256-CBC (nouveau depuis /sync)
 */
function decryptPassword(encryptedCredentials, secret = process.env.JWT_SECRET) {
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


// ============================================
// GESTION DES SERVEURS
// ============================================

/**
 * GET /api/agent/servers
 * Récupère la liste des serveurs de l'utilisateur
 */
router.get('/servers', async (req, res) => {
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
            data: servers,
            count: servers.length
        });
    } catch (error) {
        console.error('Error fetching servers:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch servers'
        });
    }
});

/**
 * POST /api/agent/servers
 * Ajoute un nouveau serveur
 */
router.post('/servers', validateBody(createServerSchema), async (req, res) => {
    try {
        const userId = req.user.id;
        const { name, host, port = 22, username, password, auth_type = 'password', tags = '', description = '' } = req.body;
        
        // Validation
        if (!name || !host || !username) {
            return res.status(400).json({
                success: false,
                error: 'Name, host and username are required'
            });
        }
        
        // Encryption simple (à améliorer en production avec crypto)
        const encryptedCredentials = Buffer.from(password || '').toString('base64');
        
        const stmt = db.prepare(`
            INSERT INTO servers (
                user_id, name, host, port, username, auth_type,
                encrypted_credentials, tags, description, status
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')
        `);
        
        const result = stmt.run(
            userId, name, host, port, username, auth_type,
            encryptedCredentials, tags, description
        );
        
        const newServer = db.prepare(`
            SELECT id, name, host, port, username, tags, status
            FROM servers WHERE id = ?
        `).get(result.lastInsertRowid);
        
        res.json({
            success: true,
            message: 'Server added successfully',
            data: newServer
        });
    } catch (error) {
        console.error('Error adding server:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to add server'
        });
    }
});

/**
 * PUT /api/agent/servers/:id
 * Modifie un serveur existant
 */
router.put('/servers/:id', validateParams(idParamSchema), validateBody(updateServerSchema), async (req, res) => {
    try {
        const userId = req.user.id;
        const serverId = req.params.id;
        const { name, host, port, username, password, tags, description } = req.body;
        
        // Vérifier que le serveur appartient à l'utilisateur
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
        
        if (name) { updates.push('name = ?'); values.push(name); }
        if (host) { updates.push('host = ?'); values.push(host); }
        if (port) { updates.push('port = ?'); values.push(port); }
        if (username) { updates.push('username = ?'); values.push(username); }
        if (tags !== undefined) { updates.push('tags = ?'); values.push(tags); }
        if (description !== undefined) { updates.push('description = ?'); values.push(description); }
        if (password) {
            updates.push('encrypted_credentials = ?');
            values.push(Buffer.from(password).toString('base64'));
        }
        
        values.push(serverId, userId);
        
        db.prepare(`
            UPDATE servers SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP
            WHERE id = ? AND user_id = ?
        `).run(...values);
        
        const updatedServer = db.prepare(`
            SELECT id, name, host, port, username, tags, status
            FROM servers WHERE id = ?
        `).get(serverId);
        
        res.json({
            success: true,
            message: 'Server updated successfully',
            data: updatedServer
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
 * DELETE /api/agent/servers/:id
 * Supprime un serveur
 */
router.delete('/servers/:id', validateParams(idParamSchema), async (req, res) => {
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

/**
 * POST /api/agent/servers/:id/test
 * Teste la connexion à un serveur
 */
router.post('/servers/:id/test', async (req, res) => {
    try {
        const userId = req.user.id;
        const serverId = req.params.id;
        
        const server = db.prepare(`
            SELECT * FROM servers WHERE id = ? AND user_id = ?
        `).get(serverId, userId);
        
        if (!server) {
            return res.status(404).json({
                success: false,
                error: 'Server not found'
            });
        }
        
        // Décrypter le mot de passe
        server.decrypted_password = Buffer.from(server.encrypted_credentials || '', 'base64').toString();
        
        const testResult = await executor.testServerConnection(server);
        
        // Mettre à jour le statut du serveur
        db.prepare(`
            UPDATE servers 
            SET status = ?, last_check_at = CURRENT_TIMESTAMP 
            WHERE id = ?
        `).run(testResult.online ? 'online' : 'offline', serverId);
        
        res.json({
            success: true,
            data: testResult
        });
    } catch (error) {
        console.error('Error testing server:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to test server connection'
        });
    }
});

/**
 * GET /api/agent/servers/:id/metrics
 * Récupère les métriques d'un serveur
 */
router.get('/servers/:id/metrics', async (req, res) => {
    try {
        const userId = req.user.id;
        const serverId = req.params.id;
        
        const server = db.prepare(`
            SELECT * FROM servers WHERE id = ? AND user_id = ?
        `).get(serverId, userId);
        
        if (!server) {
            return res.status(404).json({
                success: false,
                error: 'Server not found'
            });
        }
        
        // Décrypter le mot de passe
        server.decrypted_password = Buffer.from(server.encrypted_credentials || '', 'base64').toString();
        
        const metrics = await executor.collectServerMetrics(server);
        
        res.json({
            success: true,
            data: metrics
        });
    } catch (error) {
        console.error('Error collecting metrics:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to collect server metrics'
        });
    }
});

// ============================================
// TEMPLATES DE COMMANDES
// ============================================

/**
 * GET /api/agent/templates
 * Récupère les templates de commandes (publics + utilisateur)
 */
router.get('/templates', async (req, res) => {
    try {
        const userId = req.user.id;
        const category = req.query.category;
        
        let query = `
            SELECT id, name, description, command, category, is_public, usage_count
            FROM command_templates
            WHERE (is_public = 1 OR user_id = ?)
        `;
        
        const params = [userId];
        
        if (category && category !== 'all') {
            query += ' AND category = ?';
            params.push(category);
        }
        
        query += ' ORDER BY category, name';
        
        const templates = db.prepare(query).all(...params);
        
        res.json({
            success: true,
            data: templates,
            count: templates.length
        });
    } catch (error) {
        console.error('Error fetching templates:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch templates'
        });
    }
});

/**
 * POST /api/agent/templates
 * Crée un nouveau template personnalisé
 */
router.post('/templates', validateBody(createTemplateSchema), async (req, res) => {
    try {
        const userId = req.user.id;
        const { name, description, command, category = 'custom' } = req.body;
        
        if (!name || !command) {
            return res.status(400).json({
                success: false,
                error: 'Name and command are required'
            });
        }
        
        const stmt = db.prepare(`
            INSERT INTO command_templates (user_id, name, description, command, category, is_public)
            VALUES (?, ?, ?, ?, ?, 0)
        `);
        
        const result = stmt.run(userId, name, description, command, category);
        
        const newTemplate = db.prepare(`
            SELECT id, name, description, command, category
            FROM command_templates WHERE id = ?
        `).get(result.lastInsertRowid);
        
        res.json({
            success: true,
            message: 'Template created successfully',
            data: newTemplate
        });
    } catch (error) {
        console.error('Error creating template:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to create template'
        });
    }
});

// ============================================
// EXÉCUTION DE COMMANDES
// ============================================

/**
 * POST /api/agent/execute
 * Exécute une commande sur un ou plusieurs serveurs
 */
router.post('/execute', validateBody(executeMultiServerCommandSchema), async (req, res) => {
    try {
        const userId = req.user.id;
        const { serverIds, command, templateId, timeout = 30000 } = req.body;
        
        if (!serverIds || !Array.isArray(serverIds) || serverIds.length === 0) {
            return res.status(400).json({
                success: false,
                error: 'At least one server ID is required'
            });
        }
        
        if (!command) {
            return res.status(400).json({
                success: false,
                error: 'Command is required'
            });
        }
        
        // Récupérer les serveurs
        const placeholders = serverIds.map(() => '?').join(',');
        const servers = db.prepare(`
            SELECT * FROM servers 
            WHERE id IN (${placeholders}) AND user_id = ?
        `).all(...serverIds, userId);
        
        if (servers.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'No valid servers found'
            });
        }
        
        // Décrypter les mots de passe (supporte Base64 et AES-256-CBC)
        servers.forEach(server => {
            server.decrypted_password = decryptPassword(server.encrypted_credentials);
        });
        
        // Exécuter la commande sur tous les serveurs
        const results = await executor.executeOnMultipleServers(servers, command, timeout);
        
        // Enregistrer dans l'historique
        results.forEach(result => {
            executor.saveToHistory(userId, result, templateId);
        });
        
        res.json({
            success: true,
            data: {
                command,
                results,
                summary: {
                    total: results.length,
                    success: results.filter(r => r.success).length,
                    failed: results.filter(r => !r.success).length
                }
            }
        });
    } catch (error) {
        console.error('Error executing command:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to execute command',
            details: error.message
        });
    }
});

/**
 * POST /api/ai/agent/execute-command
 * Route compatible avec le frontend pour exécuter une commande sur un seul serveur
 * Format: { serverId: number, command: string }
 * Retour: { success, risk, output, error, exit_code, duration_ms, server, command, timestamp }
 */
router.post('/ai/agent/execute-command', validateBody(executeCommandSchema), async (req, res) => {
    try {
        const userId = req.user.id;
        const { serverId, command } = req.body;
        console.log("[DEBUG] Request received - userId:", userId, "serverId:", serverId, "command:", command);
        
        if (!serverId) {
            return res.status(400).json({
                success: false,
                error: 'Server ID is required'
            });
        }
        
        if (!command) {
            return res.status(400).json({
                success: false,
                error: 'Command is required'
            });
        }
        
        // Récupérer le serveur
        const server = db.prepare(`
            SELECT * FROM servers 
            WHERE id = ? AND user_id = ?
        `).get(serverId, userId);
        
        if (!server) {
            return res.status(404).json({
                success: false,
                error: 'Server not found'
            });
        }
        
        // Décrypter le mot de passe (supporte Base64 et AES-256-CBC)
        server.decrypted_password = decryptPassword(server.encrypted_credentials);
        
        console.log("[DEBUG] Server query result:", server ? "FOUND" : "NOT FOUND");
        // Classifier le risque
        const risk = executor.classifyRisk(command);
        
        console.log("[DEBUG] Server found:", { id: server.id, host: server.host, username: server.username });
        // Exécuter la commande
        console.log("[DEBUG] Encrypted credentials:", server.encrypted_credentials);
        const results = await executor.executeOnMultipleServers([server], command);
        // Decrypted password: *** (hidden for security)
        const result = results[0];
        
        // Enregistrer dans l'historique
        executor.saveToHistory(userId, result, null);
        
        // Format de réponse compatible avec le frontend
        res.json({
            success: result.success,
            risk: risk,
            output: result.output,
            error: result.error,
            exit_code: result.exit_code,
            duration_ms: result.duration_ms,
            server: {
                id: server.id,
                name: server.name,
                host: server.host
            },
            command: command,
            timestamp: result.timestamp
        });
    } catch (error) {
        console.error('Error executing command:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to execute command',
            details: error.message
        });
    }
});

/**
 * POST /api/ai/agent/execute_command (avec underscore)
 * Alias pour compatibilité frontend
 */
router.post('/ai/agent/execute_command', validateBody(executeCommandSchema), async (req, res) => {
    try {
        const userId = req.user.id;
        const { serverId, command } = req.body;
        
        if (!serverId) {
            return res.status(400).json({
                success: false,
                error: 'Server ID is required'
            });
        }
        
        if (!command) {
            return res.status(400).json({
                success: false,
                error: 'Command is required'
            });
        }
        
        // Récupérer le serveur
        const server = db.prepare(`
            SELECT * FROM servers 
            WHERE id = ? AND user_id = ?
        `).get(serverId, userId);
        
        if (!server) {
            return res.status(404).json({
                success: false,
                error: 'Server not found'
            });
        }
        
        // Décrypter le mot de passe (supporte Base64 et AES-256-CBC)
        server.decrypted_password = decryptPassword(server.encrypted_credentials);
        
        // Classifier le risque
        const risk = executor.classifyRisk(command);
        
        // Exécuter la commande
        const results = await executor.executeOnMultipleServers([server], command);
        const result = results[0];
        
        // Enregistrer dans l'historique
        executor.saveToHistory(userId, result, null);
        
        // Format de réponse compatible avec le frontend
        res.json({
            success: result.success,
            risk: risk,
            output: result.output,
            error: result.error,
            exit_code: result.exit_code,
            duration_ms: result.duration_ms,
            server: {
                id: server.id,
                name: server.name,
                host: server.host
            },
            command: command,
            timestamp: result.timestamp
        });
    } catch (error) {
        console.error('Error executing command:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to execute command',
            details: error.message
        });
    }
});



/**
 * GET /api/agent/history
 * Récupère l'historique des commandes
 */
router.get('/history', async (req, res) => {
    try {
        const userId = req.user.id;
        const limit = parseInt(req.query.limit) || 50;
        
        const history = executor.getCommandHistory(userId, limit);
        
        res.json({
            success: true,
            data: history,
            count: history.length
        });
    } catch (error) {
        console.error('Error fetching history:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch command history'
        });
    }
});

/**
 * GET /api/agent/stats
 * Récupère les statistiques d'exécution
 */
router.get('/stats', async (req, res) => {
    try {
        const userId = req.user.id;
        const stats = executor.getExecutionStats(userId);
        
        res.json({
            success: true,
            data: stats
        });
    } catch (error) {
        console.error('Error fetching stats:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch statistics'
        });
    }
});

export default router;

/**
 * POST /api/agent/servers/sync
 * Synchroniser un serveur depuis Terminal SSH vers Agent DevOps
 */
router.post('/servers/sync', async (req, res) => {
  try {
    const { host, port, username, password, name, description } = req.body;
    const userId = req.user?.id || 'default';

    // Vérifier si le serveur existe déjà
    const existing = db.prepare(`
      SELECT id FROM servers 
      WHERE host = ? AND port = ? AND username = ? AND user_id = ?
    `).get(host, port || 22, username, userId);

    if (existing) {
      // Mettre à jour le serveur existant
      const crypto = await import('crypto');
      const algorithm = 'aes-256-cbc';
      const key = crypto.scryptSync(process.env.JWT_SECRET, 'salt', 32);
      const iv = crypto.randomBytes(16);
      const cipher = crypto.createCipheriv(algorithm, key, iv);
      
      let encryptedPassword = cipher.update(password, 'utf8', 'hex');
      encryptedPassword += cipher.final('hex');
      const encryptedCredentials = `${iv.toString('hex')}:${encryptedPassword}`;

      db.prepare(`
        UPDATE servers 
        SET name = ?,
            description = ?,
            encrypted_credentials = ?,
            last_check = CURRENT_TIMESTAMP,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(
        name || `${username}@${host}`,
        description || 'Synchronisé depuis Terminal SSH',
        encryptedCredentials,
        existing.id
      );

      res.json({
        success: true,
        message: 'Serveur mis à jour',
        serverId: existing.id,
        action: 'updated'
      });
    } else {
      // Créer un nouveau serveur
      const crypto = await import('crypto');
      const algorithm = 'aes-256-cbc';
      const key = crypto.scryptSync(process.env.JWT_SECRET, 'salt', 32);
      const iv = crypto.randomBytes(16);
      const cipher = crypto.createCipheriv(algorithm, key, iv);
      
      let encryptedPassword = cipher.update(password, 'utf8', 'hex');
      encryptedPassword += cipher.final('hex');
      const encryptedCredentials = `${iv.toString('hex')}:${encryptedPassword}`;

      const result = db.prepare(`
        INSERT INTO servers (
          user_id, name, host, port, username, 
          auth_type, encrypted_credentials, description, 
          status, last_check
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      `).run(
        userId,
        name || `${username}@${host}`,
        host,
        port || 22,
        username,
        'password',
        encryptedCredentials,
        description || 'Synchronisé depuis Terminal SSH',
        'active'
      );

      res.json({
        success: true,
        message: 'Nouveau serveur ajouté',
        serverId: result.lastInsertRowid,
        action: 'created'
      });
    }
  } catch (error) {
    console.error('Error syncing server:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to sync server',
      message: error.message
    });
  }
});

