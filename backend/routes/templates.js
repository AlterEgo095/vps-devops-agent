/**
 * Routes API pour les Templates de Commandes
 */

import express from 'express';
import { db } from '../services/database-sqlite.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// Apply authentication to all routes
router.use(authenticateToken);

/**
 * GET /api/templates
 * Liste tous les templates de l'utilisateur + templates publics
 */
router.get('/', async (req, res) => {
    try {
        const userId = req.user.id;
        const { category, favorite } = req.query;
        
        let query = `
            SELECT * FROM command_templates
            WHERE (user_id = ? OR is_public = 1)
        `;
        
        const params = [userId];
        
        if (category) {
            query += ` AND category = ?`;
            params.push(category);
        }
        
        if (favorite === 'true') {
            query += ` AND is_favorite = 1`;
        }
        
        query += ` ORDER BY is_favorite DESC, usage_count DESC, name ASC`;
        
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
 * GET /api/templates/categories
 * Liste toutes les catégories disponibles
 */
router.get('/categories', async (req, res) => {
    try {
        const categories = db.prepare(`
            SELECT DISTINCT category FROM command_templates
            UNION
            SELECT name as category FROM template_categories
            ORDER BY category
        `).all();
        
        res.json({
            success: true,
            data: categories
        });
    } catch (error) {
        console.error('Error fetching categories:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch categories'
        });
    }
});

/**
 * GET /api/templates/:id
 * Récupère un template spécifique
 */
router.get('/:id', async (req, res) => {
    try {
        const userId = req.user.id;
        const templateId = req.params.id;
        
        const template = db.prepare(`
            SELECT * FROM command_templates
            WHERE id = ? AND (user_id = ? OR is_public = 1)
        `).get(templateId, userId);
        
        if (!template) {
            return res.status(404).json({
                success: false,
                error: 'Template not found'
            });
        }
        
        res.json({
            success: true,
            data: template
        });
    } catch (error) {
        console.error('Error fetching template:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch template'
        });
    }
});

/**
 * POST /api/templates
 * Crée un nouveau template
 */
router.post('/', async (req, res) => {
    try {
        const userId = req.user.id;
        const { name, description, command, category, parameters, is_public } = req.body;
        
        if (!name || !command) {
            return res.status(400).json({
                success: false,
                error: 'Name and command are required'
            });
        }
        
        const result = db.prepare(`
            INSERT INTO command_templates (
                user_id, name, description, command, category, 
                parameters, is_public
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(
            userId,
            name,
            description || null,
            command,
            category || 'custom',
            parameters ? JSON.stringify(parameters) : null,
            is_public ? 1 : 0
        );
        
        res.json({
            success: true,
            message: 'Template created successfully',
            templateId: result.lastInsertRowid
        });
    } catch (error) {
        console.error('Error creating template:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to create template'
        });
    }
});

/**
 * PUT /api/templates/:id
 * Met à jour un template existant
 */
router.put('/:id', async (req, res) => {
    try {
        const userId = req.user.id;
        const templateId = req.params.id;
        const { name, description, command, category, parameters, is_public } = req.body;
        
        // Vérifier que le template appartient à l'utilisateur
        const template = db.prepare(`
            SELECT * FROM command_templates WHERE id = ? AND user_id = ?
        `).get(templateId, userId);
        
        if (!template) {
            return res.status(404).json({
                success: false,
                error: 'Template not found or access denied'
            });
        }
        
        db.prepare(`
            UPDATE command_templates
            SET name = ?, description = ?, command = ?, category = ?,
                parameters = ?, is_public = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ? AND user_id = ?
        `).run(
            name,
            description || null,
            command,
            category || 'custom',
            parameters ? JSON.stringify(parameters) : null,
            is_public ? 1 : 0,
            templateId,
            userId
        );
        
        res.json({
            success: true,
            message: 'Template updated successfully'
        });
    } catch (error) {
        console.error('Error updating template:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to update template'
        });
    }
});

/**
 * DELETE /api/templates/:id
 * Supprime un template
 */
router.delete('/:id', async (req, res) => {
    try {
        const userId = req.user.id;
        const templateId = req.params.id;
        
        const result = db.prepare(`
            DELETE FROM command_templates WHERE id = ? AND user_id = ?
        `).run(templateId, userId);
        
        if (result.changes === 0) {
            return res.status(404).json({
                success: false,
                error: 'Template not found or access denied'
            });
        }
        
        res.json({
            success: true,
            message: 'Template deleted successfully'
        });
    } catch (error) {
        console.error('Error deleting template:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to delete template'
        });
    }
});

/**
 * POST /api/templates/:id/favorite
 * Toggle favorite status
 */
router.post('/:id/favorite', async (req, res) => {
    try {
        const userId = req.user.id;
        const templateId = req.params.id;
        
        const template = db.prepare(`
            SELECT is_favorite FROM command_templates 
            WHERE id = ? AND user_id = ?
        `).get(templateId, userId);
        
        if (!template) {
            return res.status(404).json({
                success: false,
                error: 'Template not found'
            });
        }
        
        const newFavoriteStatus = template.is_favorite ? 0 : 1;
        
        db.prepare(`
            UPDATE command_templates
            SET is_favorite = ?
            WHERE id = ? AND user_id = ?
        `).run(newFavoriteStatus, templateId, userId);
        
        res.json({
            success: true,
            is_favorite: newFavoriteStatus === 1
        });
    } catch (error) {
        console.error('Error toggling favorite:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to toggle favorite'
        });
    }
});

/**
 * POST /api/templates/:id/use
 * Incrémente le compteur d'utilisation
 */
router.post('/:id/use', async (req, res) => {
    try {
        const userId = req.user.id;
        const templateId = req.params.id;
        
        db.prepare(`
            UPDATE command_templates
            SET usage_count = usage_count + 1
            WHERE id = ? AND (user_id = ? OR is_public = 1)
        `).run(templateId, userId);
        
        res.json({
            success: true,
            message: 'Usage count incremented'
        });
    } catch (error) {
        console.error('Error incrementing usage:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to increment usage'
        });
    }
});

export default router;
