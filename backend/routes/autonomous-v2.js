/**
 * Routes API v2 pour l'Agent Autonome Conversationnel
 * 
 * Permet une interaction en langage naturel avec l'agent DevOps
 */

import express from 'express';
import { authenticateToken } from '../middleware/auth.js';
import agentEngine from '../services/autonomous-agent-engine.js';
import { db } from '../services/database-sqlite.js';

const router = express.Router();

// Instance globale de l'agent (une par session utilisateur)
const userAgents = new Map();

// Apply authentication to all routes
router.use(authenticateToken);

/**
 * Helper: Obtenir ou créer l'instance d'agent pour l'utilisateur
 */
function getAgentForUser(userId) {
    if (!userAgents.has(userId)) {
        userAgents.set(userId, new AutonomousAgentEngine());
    }
    return userAgents.get(userId);
}

/**
 * POST /api/autonomous/v2/chat
 * Interface conversationnelle avec l'agent autonome
 * 
 * Body:
 *   - message: string (commande en langage naturel)
 *   - serverId?: number (optionnel, pour sélection automatique)
 *   - serverContext?: object (optionnel, contexte complet du serveur)
 */
router.post('/chat', async (req, res) => {
    try {
        const userId = req.user.id;
        const { message, serverId, serverContext } = req.body;
        
        if (!message) {
            return res.status(400).json({
                success: false,
                error: 'Le message est requis'
            });
        }

        console.log(`💬 Agent chat request from user ${userId}: "${message}"`);

        const agent = getAgentForUser(userId);

        // Si un serverId est fourni, récupérer le contexte du serveur
        let context = serverContext;
        if (serverId && !context) {
            const server = db.prepare(`
                SELECT * FROM servers WHERE id = ? AND user_id = ?
            `).get(serverId, userId);
            
            if (server) {
                context = {
                    id: server.id,
                    host: server.host,
                    port: server.port,
                    username: server.username,
                    password: server.password,
                    auth_type: server.auth_type,
                    name: server.name
                };
            }
        }

        // Définir le contexte serveur dans l'agent
        if (context) {
            agent.updateServerContext(context);
        }

                // Démarrer l'agent si nécessaire
        if (!agent.getStatus().isRunning) {
            await agent.start(context);
        }

        // Exécuter le message via l'agent autonome
        const response = await agent.executeNaturalLanguageCommand(message, context);

        return res.json({
            success: true,
            response: response,
            serverId: context?.id || null,
            serverName: context?.name || context?.host || null
        });
        
    } catch (error) {
        console.error('❌ Agent chat error:', error);
        return res.status(500).json({
            success: false,
            error: error.message || 'Erreur lors du traitement du message'
        });
    }
});

/**
 * POST /api/autonomous/v2/reset
 * Réinitialiser la conversation de l'agent
 */
router.post('/reset', async (req, res) => {
    try {
        const userId = req.user.id;
        const agent = getAgentForUser(userId);
        
        agent.resetConversation();
        
        return res.json({
            success: true,
            message: 'Conversation réinitialisée'
        });
        
    } catch (error) {
        console.error('❌ Agent reset error:', error);
        return res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * GET /api/autonomous/v2/history
 * Récupérer l'historique de conversation
 */
router.get('/history', async (req, res) => {
    try {
        const userId = req.user.id;
        const agent = getAgentForUser(userId);
        
        return res.json({
            success: true,
            history: agent.conversationHistory || []
        });
        
    } catch (error) {
        console.error('❌ Agent history error:', error);
        return res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * GET /api/autonomous/v2/status
 * Statut de l'agent pour l'utilisateur
 */
router.get('/status', async (req, res) => {
    try {
        const userId = req.user.id;
        const agent = getAgentForUser(userId);
        
        return res.json({
            success: true,
            active: userAgents.has(userId),
            serverConnected: !!agent.serverContext,
            serverName: agent.serverContext?.name || null,
            messagesCount: agent.conversationHistory?.length || 0
        });
        
    } catch (error) {
        console.error('❌ Agent status error:', error);
        return res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

export default router;
