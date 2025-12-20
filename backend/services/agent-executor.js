/**
 * Service Agent Executor
 * Exécute des commandes SSH avec classification des risques et validation
 */

import { Client } from 'ssh2';
import * as openaiProvider from './openai-provider.js';
import { db } from './database-sqlite.js';

// Système de classification des risques
const RISK_LEVELS = {
    SAFE: 'SAFE',           // Exécution automatique (lecture seule)
    MODERATE: 'MODERATE',   // Confirmation simple requise
    CRITICAL: 'CRITICAL'    // Confirmation détaillée + backup
};

// Patterns de commandes par niveau de risque
const COMMAND_PATTERNS = {
    SAFE: [
        /^ls\s/i, /^pwd$/i, /^whoami$/i, /^date$/i, /^uptime$/i,
        /^df\s/i, /^du\s/i, /^cat\s/i, /^head\s/i, /^tail\s/i,
        /^grep\s/i, /^find\s/i, /^which\s/i, /^man\s/i,
        /^ps\s/i, /^top$/i, /^htop$/i, /^free\s/i,
        /^netstat\s/i, /^ss\s/i, /^ip\s+addr/i, /^hostname$/i,
        /^uname\s/i, /^lsb_release\s/i, /^systemctl\s+status/i,
        /^docker\s+ps/i, /^docker\s+images/i, /^docker\s+logs/i,
        /^git\s+status/i, /^git\s+log/i, /^git\s+branch/i, /^git\s+diff/i,
        /^npm\s+list/i, /^npm\s+outdated/i
    ],
    CRITICAL: [
        /rm\s+-rf/i, /rm\s+-fr/i, /rm\s+.*\*/i,
        /mkfs/i, /fdisk/i, /parted/i,
        /shutdown/i, /reboot/i, /poweroff/i, /halt/i,
        /dd\s+if=/i, /wipefs/i,
        /iptables\s+-F/i, /iptables\s+-X/i,
        /userdel/i, /groupdel/i,
        /mysql.*drop\s+database/i, /psql.*drop\s+database/i,
        /docker\s+rm\s+-f.*all/i, /docker\s+system\s+prune\s+-a/i,
        /systemctl\s+disable/i, /systemctl\s+mask/i,
        /chown\s+-R\s+.*\//i, /chmod\s+-R\s+777/i
    ]
};

/**
 * Classifier le niveau de risque d'une commande
 */
export function classifyRisk(command) {
    // Vérifier CRITICAL en premier
    for (const pattern of COMMAND_PATTERNS.CRITICAL) {
        if (pattern.test(command)) {
            return {
                level: RISK_LEVELS.CRITICAL,
                reason: 'Commande potentiellement destructive ou irréversible'
            };
        }
    }

    // Vérifier SAFE
    for (const pattern of COMMAND_PATTERNS.SAFE) {
        if (pattern.test(command)) {
            return {
                level: RISK_LEVELS.SAFE,
                reason: 'Commande en lecture seule, sans modification du système'
            };
        }
    }

    // Par défaut: MODERATE
    return {
        level: RISK_LEVELS.MODERATE,
        reason: 'Commande de modification système (installation, configuration, etc.)'
    };
}

/**
 * Analyser une demande utilisateur et générer un plan d'action
 */
export async function analyzeRequest(userRequest, context = {}) {
    try {
        const systemPrompt = `Tu es un expert DevOps qui analyse des demandes et génère des plans d'action sécurisés.

ANALYSE DE LA DEMANDE:
- Comprends l'intention de l'utilisateur
- Identifie les commandes nécessaires
- Évalue les risques et dépendances
- Propose des alternatives plus sûres si possible

CLASSIFICATION DES RISQUES:
- SAFE: Lecture seule (ls, cat, grep, ps, etc.)
- MODERATE: Modifications système (apt install, systemctl restart, etc.)
- CRITICAL: Actions destructives (rm -rf, reboot, userdel, etc.)

RÉPONSE EN JSON:
{
    "analysis": "Analyse de la demande",
    "intent": "Intention détectée",
    "plan": {
        "steps": [
            {
                "description": "Description de l'étape",
                "command": "commande à exécuter",
                "risk_level": "SAFE|MODERATE|CRITICAL",
                "requires_confirmation": true/false,
                "reasoning": "Pourquoi cette commande"
            }
        ],
        "warnings": ["Avertissements éventuels"],
        "estimated_time": "Temps estimé"
    },
    "alternatives": ["Alternatives plus sûres si applicable"]
}`;

        const messages = [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: `Demande: ${userRequest}\n\nContexte: ${JSON.stringify(context, null, 2)}` }
        ];

        const response = await openaiProvider.sendToOpenAI(messages, 'devops_agent');
        
        try {
            const plan = JSON.parse(response.message);
            
            // Reclassifier les commandes avec notre système
            if (plan.plan && plan.plan.steps) {
                plan.plan.steps = plan.plan.steps.map(step => {
                    const risk = classifyRisk(step.command);
                    return {
                        ...step,
                        risk_level: risk.level,
                        risk_reason: risk.reason,
                        requires_confirmation: risk.level !== RISK_LEVELS.SAFE
                    };
                });
            }

            return {
                success: true,
                plan: plan,
                usage: response.usage
            };
        } catch (parseError) {
            console.error('Failed to parse plan JSON:', parseError);
            return {
                success: false,
                error: 'Failed to parse action plan',
                raw_response: response.message
            };
        }
    } catch (error) {
        console.error('Error analyzing request:', error);
        return {
            success: false,
            error: error.message
        };
    }
}

/**
 * Exécuter une commande SSH sur un serveur
 */
export async function executeCommand(serverConfig, command, options = {}) {
    return new Promise((resolve, reject) => {
        const conn = new Client();
        let output = '';
        let errorOutput = '';
        const startTime = Date.now();

        conn.on('ready', () => {
            conn.exec(command, { pty: options.pty || false }, (err, stream) => {
                if (err) {
                    conn.end();
                    return reject(new Error(`Failed to execute command: ${err.message}`));
                }

                stream.on('data', (data) => {
                    output += data.toString('utf-8');
                });

                stream.stderr.on('data', (data) => {
                    errorOutput += data.toString('utf-8');
                });

                stream.on('close', (code, signal) => {
                    conn.end();
                    
                    const duration = Date.now() - startTime;
                    
                    resolve({
                        success: code === 0,
                        exit_code: code,
                        signal: signal,
                        output: output,
                        error: errorOutput,
                        duration_ms: duration,
                        command: command
                    });
                });
            });
        });

        conn.on('error', (err) => {
            reject(new Error(`SSH connection error: ${err.message}`));
        });

        // Connexion SSH
        try {
            const connectionConfig = {
                host: serverConfig.host,
                port: serverConfig.port || 22,
                username: serverConfig.username,
                readyTimeout: 30000
            };

            if (serverConfig.password) {
                connectionConfig.password = serverConfig.password;
            } else if (serverConfig.privateKey) {
                connectionConfig.privateKey = serverConfig.privateKey;
                if (serverConfig.passphrase) {
                    connectionConfig.passphrase = serverConfig.passphrase;
                }
            } else {
                return reject(new Error('No authentication method provided'));
            }

            conn.connect(connectionConfig);
        } catch (error) {
            reject(new Error(`Failed to initiate SSH connection: ${error.message}`));
        }
    });
}

/**
 * Exécuter un plan d'action complet
 */
export async function executePlan(plan, serverConfig, options = {}) {
    const results = [];
    const { autoExecuteSafe = true, confirmCallback = null } = options;

    for (let i = 0; i < plan.steps.length; i++) {
        const step = plan.steps[i];
        
        // Demander confirmation si nécessaire
        if (step.requires_confirmation && !autoExecuteSafe) {
            if (!confirmCallback) {
                results.push({
                    step: i + 1,
                    description: step.description,
                    command: step.command,
                    status: 'pending_confirmation',
                    risk_level: step.risk_level
                });
                continue;
            }

            const confirmed = await confirmCallback(step);
            if (!confirmed) {
                results.push({
                    step: i + 1,
                    description: step.description,
                    command: step.command,
                    status: 'cancelled',
                    risk_level: step.risk_level
                });
                break; // Arrêter l'exécution si une étape est annulée
            }
        }

        // Exécuter la commande
        try {
            console.log(`Executing step ${i + 1}: ${step.command}`);
            const result = await executeCommand(serverConfig, step.command);
            
            results.push({
                step: i + 1,
                description: step.description,
                command: step.command,
                status: result.success ? 'completed' : 'failed',
                risk_level: step.risk_level,
                output: result.output,
                error: result.error,
                exit_code: result.exit_code,
                duration_ms: result.duration_ms
            });

            // Arrêter si une commande échoue
            if (!result.success) {
                console.error(`Step ${i + 1} failed with exit code ${result.exit_code}`);
                break;
            }
        } catch (error) {
            console.error(`Error executing step ${i + 1}:`, error);
            results.push({
                step: i + 1,
                description: step.description,
                command: step.command,
                status: 'error',
                risk_level: step.risk_level,
                error: error.message
            });
            break; // Arrêter en cas d'erreur
        }
    }

    return {
        success: results.every(r => r.status === 'completed'),
        steps: results,
        summary: {
            total: plan.steps.length,
            completed: results.filter(r => r.status === 'completed').length,
            failed: results.filter(r => r.status === 'failed').length,
            cancelled: results.filter(r => r.status === 'cancelled').length,
            pending: results.filter(r => r.status === 'pending_confirmation').length
        }
    };
}

/**
 * Analyser l'infrastructure d'un serveur
 */
export async function analyzeInfrastructure(serverConfig) {
    const checks = [
        { name: 'OS Info', command: 'uname -a && lsb_release -a 2>/dev/null || cat /etc/os-release' },
        { name: 'Disk Usage', command: 'df -h' },
        { name: 'Memory Usage', command: 'free -h' },
        { name: 'CPU Info', command: 'lscpu | head -20' },
        { name: 'Network Interfaces', command: 'ip addr show' },
        { name: 'Running Services', command: 'systemctl list-units --type=service --state=running --no-pager | head -30' },
        { name: 'Docker Status', command: 'docker ps -a 2>/dev/null || echo "Docker not installed"' },
        { name: 'Nginx Status', command: 'systemctl status nginx --no-pager 2>/dev/null || echo "Nginx not installed"' },
        { name: 'Database Status', command: 'systemctl status mysql --no-pager 2>/dev/null || systemctl status postgresql --no-pager 2>/dev/null || echo "No database detected"' }
    ];

    const results = [];

    for (const check of checks) {
        try {
            const result = await executeCommand(serverConfig, check.command);
            results.push({
                name: check.name,
                success: true,
                output: result.output,
                error: result.error
            });
        } catch (error) {
            results.push({
                name: check.name,
                success: false,
                error: error.message
            });
        }
    }

    // Analyser les résultats avec GPT-4
    try {
        const analysisPrompt = `Analyse cette infrastructure serveur.

DONNÉES DU SERVEUR:
${results.map(r => `## ${r.name}\n${r.output || r.error}\n`).join('\n')}

FORMAT JSON REQUIS:
{
    "summary": "Résumé général de l'infrastructure",
    "health_score": 85,
    "findings": [
        {
            "category": "disk",
            "severity": "info",
            "title": "Espace disque suffisant",
            "description": "Le serveur dispose de 374G d'espace libre",
            "recommendation": "Continuer le monitoring"
        }
    ],
    "recommendations": ["Maintenir la surveillance du disque", "Optimiser la mémoire"]
}`;

        const messages = [
            { role: 'system', content: 'Tu es un expert DevOps. Tu dois répondre uniquement avec un objet JSON valide contenant: summary (string), health_score (number 0-100), findings (array), recommendations (array).' },
            { role: 'user', content: analysisPrompt + '\n\nRÉPONDS UNIQUEMENT AVEC UN OBJET JSON VALIDE, SANS TEXTE AVANT OU APRÈS.' }
        ];

        // Use openaiProvider but parse as JSON
        const response = await openaiProvider.sendToOpenAI(messages, 'devops_agent');
        
        // Extract JSON from response (sometimes wrapped in markdown)
        let jsonText = response.message.trim();
        if (jsonText.startsWith('```json')) {
            jsonText = jsonText.replace(/^```json\n/, '').replace(/\n```$/, '');
        } else if (jsonText.startsWith('```')) {
            jsonText = jsonText.replace(/^```\n/, '').replace(/\n```$/, '');
        }
        
        // Clean control characters from JSON
        jsonText = jsonText.replace(/[\x00-\x1F\x7F-\x9F]/g, "");
        
        const analysis = JSON.parse(jsonText);

        return {
            success: true,
            raw_data: results,
            analysis: analysis
        };
    } catch (error) {
        console.error('Error analyzing infrastructure:', error);
        return {
            success: false,
            raw_data: results,
            error: error.message
        };
    }
}

/**
 * Exécuter une commande sur plusieurs serveurs en parallèle
 */
export async function executeOnMultipleServers(servers, command, timeout = 30000) {
    const results = [];
    
    // Exécuter en parallèle sur tous les serveurs
    const promises = servers.map(async (server) => {
        const serverConfig = {
            host: server.host,
            port: server.port || 22,
            username: server.username,
            password: server.decrypted_password  // IMPORTANT: Utiliser le mot de passe déchiffré
        };
        
        try {
            const result = await executeCommand(serverConfig, command);
            return {
                server_id: server.id,
                server_name: server.name,
                host: server.host,
                success: result.success,
                output: result.output,
                error: result.error,
                exit_code: result.exit_code,
                duration_ms: result.duration_ms,
                command: command,
                timestamp: new Date().toISOString()
            };
        } catch (error) {
            console.error(`Error executing on server ${server.host}:`, error);
            return {
                server_id: server.id,
                server_name: server.name,
                host: server.host,
                success: false,
                output: '',
                error: error.message,
                exit_code: -1,
                duration_ms: 0,
                command: command,
                timestamp: new Date().toISOString()
            };
        }
    });
    
    const executionResults = await Promise.all(promises);
    return executionResults;
}

/**
 * Enregistrer dans l'historique des commandes
 */
export function saveToHistory(userId, result, templateId = null) {
    try {
        const stmt = db.prepare(`
            INSERT INTO command_history 
            (user_id, server_id, command, output, error, exit_code, duration_ms, template_id, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
        `);
        
        stmt.run(
            userId,
            result.server_id,
            result.command,
            result.output,
            result.error,
            result.exit_code,
            result.duration_ms,
            templateId
        );
    } catch (error) {
        console.error('Error saving to history:', error);
    }
}

/**
 * Récupérer l'historique des commandes
 */
export function getCommandHistory(userId, limit = 50) {
    try {
        const stmt = db.prepare(`
            SELECT 
                h.*,
                s.name as server_name,
                s.host as server_host
            FROM command_history h
            LEFT JOIN servers s ON h.server_id = s.id
            WHERE h.user_id = ?
            ORDER BY h.created_at DESC
            LIMIT ?
        `);
        
        return stmt.all(userId, limit);
    } catch (error) {
        console.error('Error fetching history:', error);
        return [];
    }
}

/**
 * Récupérer les statistiques d'exécution
 */
export function getExecutionStats(userId) {
    try {
        const stats = db.prepare(`
            SELECT 
                COUNT(*) as total_executions,
                SUM(CASE WHEN exit_code = 0 THEN 1 ELSE 0 END) as successful_executions,
                SUM(CASE WHEN exit_code != 0 THEN 1 ELSE 0 END) as failed_executions,
                AVG(duration_ms) as avg_duration_ms,
                MAX(duration_ms) as max_duration_ms,
                COUNT(DISTINCT server_id) as servers_used
            FROM command_history
            WHERE user_id = ?
        `).get(userId);
        
        const recentActivity = db.prepare(`
            SELECT 
                DATE(created_at) as date,
                COUNT(*) as executions
            FROM command_history
            WHERE user_id = ?
            AND created_at >= datetime('now', '-30 days')
            GROUP BY DATE(created_at)
            ORDER BY date DESC
        `).all(userId);
        
        return {
            ...stats,
            recent_activity: recentActivity
        };
    } catch (error) {
        console.error('Error fetching stats:', error);
        return {
            total_executions: 0,
            successful_executions: 0,
            failed_executions: 0,
            avg_duration_ms: 0,
            max_duration_ms: 0,
            servers_used: 0,
            recent_activity: []
        };
    }
}

export default {
    classifyRisk,
    analyzeRequest,
    executeCommand,
    executePlan,
    analyzeInfrastructure,
    executeOnMultipleServers,
    saveToHistory,
    getCommandHistory,
    getExecutionStats,
    RISK_LEVELS
};
