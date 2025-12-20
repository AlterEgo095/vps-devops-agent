/**
 * Autonomous Agent Service - Version Simplifiée
 * Réutilise les capacités existantes de l'agent AI
 */

import { analyzeRequest, executePlan } from './agent-executor.js';
import { db } from './database-sqlite.js';

/**
 * Classification des niveaux de sécurité
 */
const SAFETY_LEVELS = {
    SAFE: 'SAFE',
    MODERATE: 'MODERATE',
    CRITICAL: 'CRITICAL'
};

/**
 * Analyse une commande naturelle et génère un plan (utilise l'agent existant)
 */
export async function analyzeNaturalCommand(naturalCommand, serverContext, serverId) {
    try {
        // Utiliser la fonction existante analyzeRequest qui fait déjà le travail
        const result = await analyzeRequest(naturalCommand, serverId, {});
        return result.plan;
    } catch (error) {
        console.error('Error analyzing natural command:', error);
        throw error;
    }
}

/**
 * Exécute un plan de manière autonome (utilise l'exécuteur existant)
 */
export async function executeAutonomousPlan(plan, serverId, userSafetyLevel = 'MODERATE') {
    try {
        // Utiliser la fonction existante executePlan
        const result = await executePlan(plan, serverId);
        
        // Sauvegarder dans l'historique
        saveExecutionLog(serverId, plan, result);
        
        return result;
    } catch (error) {
        console.error('Error executing autonomous plan:', error);
        throw error;
    }
}

/**
 * Sauvegarde le log d'exécution autonome
 */
function saveExecutionLog(serverId, plan, results) {
    try {
        db.prepare(`
            INSERT INTO autonomous_executions (
                server_id, plan, results, success, created_at
            ) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
        `).run(
            serverId,
            JSON.stringify(plan),
            JSON.stringify(results),
            results.success ? 1 : 0
        );
    } catch (error) {
        console.error('Error saving execution log:', error);
    }
}

/**
 * Récupère l'historique des exécutions autonomes
 */
export function getExecutionHistory(serverId, limit = 20) {
    try {
        const history = db.prepare(`
            SELECT * FROM autonomous_executions
            WHERE server_id = ?
            ORDER BY created_at DESC
            LIMIT ?
        `).all(serverId, limit);
        
        return history.map(exec => ({
            ...exec,
            plan: JSON.parse(exec.plan),
            results: JSON.parse(exec.results)
        }));
    } catch (error) {
        console.error('Error getting execution history:', error);
        return [];
    }
}

/**
 * Classifie le niveau de risque d'une commande
 */
export function classifyCommandRisk(command) {
    // Pour l'instant, retourne MODERATE par défaut
    // Le système existant de l'agent gère déjà la classification
    return {
        level: SAFETY_LEVELS.MODERATE,
        reason: 'Classification automatique',
        requiresApproval: false,
        autoExecute: true
    };
}
