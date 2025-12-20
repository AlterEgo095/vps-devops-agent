/**
 * Routes API pour l'Agent Autonome
 */

import express from 'express';
import { authenticateToken } from '../middleware/auth.js';
import { 
    analyzeNaturalCommand, 
    executeAutonomousPlan,
    getExecutionHistory,
    classifyCommandRisk
} from '../services/autonomous-agent.js';
import { db } from '../services/database-sqlite.js';

const router = express.Router();

// Apply authentication to all routes
router.use(authenticateToken);

/**
 * POST /api/autonomous/analyze
 * Analyse une commande en langage naturel et génère un plan d'action
 */
router.post('/analyze', async (req, res) => {
    try {
        const userId = req.user.id;
        const { naturalCommand, serverId, serverContext } = req.body;
        
        if (!naturalCommand || !serverId) {
            return res.status(400).json({
                success: false,
                error: 'naturalCommand et serverId sont requis'
            });
        }
        
        // Vérifier que l'utilisateur a accès au serveur
        const server = db.prepare(`
            SELECT * FROM servers WHERE id = ? AND user_id = ?
        `).get(serverId, userId);
        
        if (!server) {
            return res.status(404).json({
                success: false,
                error: 'Serveur introuvable ou accès refusé'
            });
        }
        
        console.log(`🔍 Analyzing natural command: "${naturalCommand}"`);
        
        // Contexte serveur par défaut si non fourni
        const context = serverContext || {
            os: 'Linux',
            services: ['Docker', 'Nginx', 'PM2'],
            diskUsage: 'inconnu'
        };
        
        // Analyser la commande avec GPT-4
        const plan = await analyzeNaturalCommand(naturalCommand, context);
        
        console.log(`✅ Plan generated with ${plan.steps?.length || 0} steps`);
        
        res.json({
            success: true,
            plan: plan
        });
        
    } catch (error) {
        console.error('Error analyzing command:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Erreur lors de l\'analyse de la commande'
        });
    }
});

/**
 * POST /api/autonomous/execute
 * Exécute un plan d'action de manière autonome
 */
router.post('/execute', async (req, res) => {
    try {
        const userId = req.user.id;
        const { plan, serverId, safetyLevel } = req.body;
        
        if (!plan || !serverId) {
            return res.status(400).json({
                success: false,
                error: 'plan et serverId sont requis'
            });
        }
        
        // Vérifier que l'utilisateur a accès au serveur
        const server = db.prepare(`
            SELECT * FROM servers WHERE id = ? AND user_id = ?
        `).get(serverId, userId);
        
        if (!server) {
            return res.status(404).json({
                success: false,
                error: 'Serveur introuvable ou accès refusé'
            });
        }
        
        const safety = safetyLevel || 'MODERATE';
        console.log(`⚡ Executing autonomous plan on server ${server.name} (safety: ${safety})`);
        
        // Exécuter le plan de manière autonome
        const results = await executeAutonomousPlan(plan, serverId, safety);
        
        console.log(`✅ Execution completed: ${results.summary.completed}/${results.summary.total} steps`);
        
        res.json({
            success: true,
            results: results
        });
        
    } catch (error) {
        console.error('Error executing plan:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Erreur lors de l\'exécution du plan'
        });
    }
});

/**
 * POST /api/autonomous/auto-execute
 * Analyse ET exécute en une seule requête (mode autonome complet)
 */
router.post('/auto-execute', async (req, res) => {
    try {
        const userId = req.user.id;
        const { naturalCommand, serverId, safetyLevel, serverContext } = req.body;
        
        if (!naturalCommand || !serverId) {
            return res.status(400).json({
                success: false,
                error: 'naturalCommand et serverId sont requis'
            });
        }
        
        // Vérifier que l'utilisateur a accès au serveur
        const server = db.prepare(`
            SELECT * FROM servers WHERE id = ? AND user_id = ?
        `).get(serverId, userId);
        
        if (!server) {
            return res.status(404).json({
                success: false,
                error: 'Serveur introuvable ou accès refusé'
            });
        }
        
        const safety = safetyLevel || 'MODERATE';
        console.log(`🤖 Auto-execute: "${naturalCommand}" on ${server.name} (safety: ${safety})`);
        
        // Contexte serveur
        const context = serverContext || {
            os: 'Linux',
            services: ['Docker', 'Nginx', 'PM2'],
            diskUsage: 'inconnu'
        };
        
        // Étape 1 : Analyser
        console.log('📋 Step 1/2: Analyzing command...');
        const plan = await analyzeNaturalCommand(naturalCommand, context);
        
        // Étape 2 : Exécuter
        console.log('⚡ Step 2/2: Executing plan...');
        const results = await executeAutonomousPlan(plan, serverId, safety);
        
        console.log(`✅ Auto-execution completed: ${results.summary.completed}/${results.summary.total} steps`);
        
        res.json({
            success: true,
            plan: plan,
            results: results
        });
        
    } catch (error) {
        console.error('Error in auto-execute:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Erreur lors de l\'exécution autonome'
        });
    }
});

/**
 * GET /api/autonomous/history/:serverId
 * Récupère l'historique des exécutions autonomes
 */
router.get('/history/:serverId', async (req, res) => {
    try {
        const userId = req.user.id;
        const serverId = parseInt(req.params.serverId);
        const limit = parseInt(req.query.limit) || 20;
        
        // Vérifier que l'utilisateur a accès au serveur
        const server = db.prepare(`
            SELECT * FROM servers WHERE id = ? AND user_id = ?
        `).get(serverId, userId);
        
        if (!server) {
            return res.status(404).json({
                success: false,
                error: 'Serveur introuvable ou accès refusé'
            });
        }
        
        const history = getExecutionHistory(serverId, limit);
        
        res.json({
            success: true,
            history: history,
            count: history.length
        });
        
    } catch (error) {
        console.error('Error fetching history:', error);
        res.status(500).json({
            success: false,
            error: 'Erreur lors de la récupération de l\'historique'
        });
    }
});

/**
 * POST /api/autonomous/classify
 * Classifie le niveau de risque d'une commande
 */
router.post('/classify', async (req, res) => {
    try {
        const { command } = req.body;
        
        if (!command) {
            return res.status(400).json({
                success: false,
                error: 'command est requis'
            });
        }
        
        const risk = classifyCommandRisk(command);
        
        res.json({
            success: true,
            command: command,
            risk: risk
        });
        
    } catch (error) {
        console.error('Error classifying command:', error);
        res.status(500).json({
            success: false,
            error: 'Erreur lors de la classification'
        });
    }
});

export default router;

/**
 * GET /api/autonomous/status
 * Récupère le statut actuel de l'agent autonome
 */
router.get('/status', async (req, res) => {
    try {
        const userId = req.user.id;
        
        // Récupérer les statistiques de l'agent
        const stats = db.prepare(`
            SELECT 
                COUNT(*) as total_executions,
                SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
                SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
                SUM(CASE WHEN status = 'running' THEN 1 ELSE 0 END) as running
            FROM autonomous_tasks
            WHERE user_id = ?
        `).get(userId) || { total_executions: 0, completed: 0, failed: 0, running: 0 };
        
        // Vérifier si l'agent est actif (tâches en cours)
        const isRunning = stats.running > 0;
        
        res.json({
            success: true,
            status: {
                isRunning: isRunning,
                totalExecutions: stats.total_executions,
                completed: stats.completed,
                failed: stats.failed,
                running: stats.running,
                uptime: process.uptime(),
                timestamp: new Date().toISOString()
            }
        });
        
    } catch (error) {
        console.error('Error fetching agent status:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Erreur lors de la récupération du statut'
        });
    }
});

/**
 * GET /api/autonomous/tasks
 * Récupère la liste des tâches autonomes
 */
router.get('/tasks', async (req, res) => {
    try {
        const userId = req.user.id;
        const limit = parseInt(req.query.limit) || 50;
        const status = req.query.status; // filter by status if provided
        
        let query = `
            SELECT 
                id,
                natural_command,
                status,
                server_id,
                safety_level,
                created_at,
                started_at,
                completed_at,
                error_message,
                steps_completed,
                steps_total
            FROM autonomous_tasks
            WHERE user_id = ?
        `;
        
        const params = [userId];
        
        if (status) {
            query += ` AND status = ?`;
            params.push(status);
        }
        
        query += ` ORDER BY created_at DESC LIMIT ?`;
        params.push(limit);
        
        const tasks = db.prepare(query).all(...params);
        
        res.json({
            success: true,
            tasks: tasks,
            count: tasks.length
        });
        
    } catch (error) {
        console.error('Error fetching tasks:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Erreur lors de la récupération des tâches'
        });
    }
});

/**
 * POST /api/autonomous/start
 * Démarre l'agent autonome
 */
router.post('/start', async (req, res) => {
    try {
        const userId = req.user.id;
        
        // Pour l'instant, on simule le démarrage
        // Dans une vraie implémentation, on démarrerait un worker/process
        
        res.json({
            success: true,
            message: 'Agent autonome démarré',
            timestamp: new Date().toISOString()
        });
        
    } catch (error) {
        console.error('Error starting agent:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Erreur lors du démarrage de l\'agent'
        });
    }
});

/**
 * POST /api/autonomous/stop
 * Arrête l'agent autonome
 */
router.post('/stop', async (req, res) => {
    try {
        const userId = req.user.id;
        
        // Pour l'instant, on simule l'arrêt
        
        res.json({
            success: true,
            message: 'Agent autonome arrêté',
            timestamp: new Date().toISOString()
        });
        
    } catch (error) {
        console.error('Error stopping agent:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Erreur lors de l\'arrêt de l\'agent'
        });
    }
});

/**
 * POST /api/autonomous/task
 * Crée une nouvelle tâche autonome
 */
router.post('/task', async (req, res) => {
    try {
        const userId = req.user.id;
        const { naturalCommand, serverId, safetyLevel } = req.body;
        
        if (!naturalCommand) {
            return res.status(400).json({
                success: false,
                error: 'naturalCommand est requis'
            });
        }
        
        // Insérer la tâche dans la base
        const result = db.prepare(`
            INSERT INTO autonomous_tasks (
                user_id, natural_command, server_id, safety_level, status, created_at
            ) VALUES (?, ?, ?, ?, 'pending', datetime('now'))
        `).run(userId, naturalCommand, serverId || null, safetyLevel || 'MODERATE');
        
        const taskId = result.lastInsertRowid;
        
        res.json({
            success: true,
            taskId: taskId,
            message: 'Tâche créée avec succès'
        });
        
    } catch (error) {
        console.error('Error creating task:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Erreur lors de la création de la tâche'
        });
    }
});
