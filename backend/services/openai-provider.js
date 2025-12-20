/**
 * OpenAI Provider Service
 * Gestion des interactions avec l'API OpenAI GPT-4
 * Compatible avec serveur AI personnel (ai.aenews.net)
 */

// Environment variables loaded by server.js
import axios from 'axios';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
const OPENAI_BASE_URL = process.env.OPENAI_BASE_URL || 'https://ai.aenews.net';
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';
const OPENAI_MAX_TOKENS = parseInt(process.env.OPENAI_MAX_TOKENS) || 4000;
const OPENAI_TEMPERATURE = parseFloat(process.env.OPENAI_TEMPERATURE) || 0.7;

// Construction de l'URL de l'API (compatible IA-CORE AENEWS)
const OPENAI_API_URL = `${OPENAI_BASE_URL}/api/chat`;

console.log('[OpenAI Provider] Configuration:');
console.log(`  - Base URL: ${OPENAI_BASE_URL}`);
console.log(`  - API URL: ${OPENAI_API_URL}`);
console.log(`  - Model: ${OPENAI_MODEL}`);
console.log(`  - API Key: ${OPENAI_API_KEY ? OPENAI_API_KEY.substring(0, 8) + '...' : 'NOT SET'}`);

/**
 * Système de prompts pour l'agent DevOps
 */
const SYSTEM_PROMPTS = {
    devops_agent: `Tu es un Agent DevOps IA expert. Tu aides les utilisateurs à :
- Analyser et auditer du code (Node.js, Python, PHP)
- Configurer des serveurs et services (Nginx, Apache, PM2, Docker)
- Débugger des applications
- Optimiser les performances
- Sécuriser les systèmes
- Gérer des bases de données

Règles importantes :
1. TOUJOURS demander confirmation avant des actions critiques (suppression, modifications système)
2. Pour les actions sûres (lecture, analyse, npm install), agir de manière autonome
3. Créer des backups automatiques avant toute modification de fichier
4. Expliquer clairement ce que tu fais et pourquoi
5. Proposer des actions avec des boutons cliquables : [Action] ou [Alternative]
6. Formater le code avec \`\`\`language pour une meilleure lisibilité
7. Utiliser des emojis pour rendre les messages plus clairs (✅❌⚠️💡🔧)

Tu as accès aux capacités suivantes via des commandes :
- ANALYZE_CODE(path) - Analyser du code
- READ_FILE(path) - Lire un fichier
- WRITE_FILE(path, content) - Écrire dans un fichier
- EXECUTE_COMMAND(command) - Exécuter une commande SSH
- AUDIT_SECURITY() - Audit de sécurité
- AUDIT_DOCKER() - Audit Docker
- GET_METRICS() - Obtenir les métriques système

Format de réponse :
1. Résumé de la demande
2. Actions proposées avec niveau de risque
3. Boutons d'action pour l'utilisateur
4. Explication détaillée si nécessaire`,

    code_analyzer: `Tu es un expert en analyse de code. Analyse le code fourni et identifie :
- Bugs potentiels
- Problèmes de sécurité
- Anti-patterns
- Optimisations possibles
- Conformité aux bonnes pratiques

Fournis un rapport structuré avec :
1. Résumé (nombre de problèmes par criticité)
2. Détails de chaque problème avec ligne de code
3. Suggestions de correction avec code exemple`,

    security_auditor: `Tu es un expert en sécurité. Audite l'application et identifie :
- Vulnérabilités connues (CVE)
- Mauvaises pratiques de sécurité
- Credentials exposés
- Configurations dangereuses
- Permissions incorrectes

Fournis un rapport avec :
1. Score de sécurité (0-100)
2. Liste des vulnérabilités par criticité
3. Actions correctives recommandées`,

    docker_expert: `Tu es un expert Docker. Analyse les configurations Docker et identifie :
- Dockerfiles non optimisés
- Images vulnérables
- Mauvaises pratiques
- Problèmes de performance
- Optimisations possibles

Fournis des recommandations concrètes avec exemples de code.`
};

/**
 * Classification des actions par niveau de risque
 */
export const ACTION_RISK_LEVELS = {
    // Niveau 0 : Lecture seule (autonome)
    SAFE: {
        level: 0,
        color: 'green',
        requiresConfirmation: false,
        actions: [
            'READ_FILE',
            'ANALYZE_CODE',
            'GET_METRICS',
            'LIST_FILES',
            'SHOW_LOGS',
            'GIT_STATUS',
            'NPM_LIST',
            'DOCKER_PS',
            'PS_AUX'
        ]
    },
    
    // Niveau 1 : Actions modérées (confirmation simple)
    MODERATE: {
        level: 1,
        color: 'yellow',
        requiresConfirmation: true,
        confirmationType: 'simple',
        actions: [
            'WRITE_FILE',
            'NPM_INSTALL',
            'NPM_UPDATE',
            'PIP_INSTALL',
            'GIT_PULL',
            'PM2_RESTART',
            'NGINX_RELOAD',
            'CREATE_BACKUP',
            'MODIFY_CONFIG'
        ]
    },
    
    // Niveau 2 : Actions critiques (confirmation détaillée)
    CRITICAL: {
        level: 2,
        color: 'red',
        requiresConfirmation: true,
        confirmationType: 'detailed',
        actions: [
            'DELETE_FILE',
            'RM_RF',
            'DROP_DATABASE',
            'GIT_PUSH_FORCE',
            'DOCKER_RM',
            'DOCKER_STOP',
            'CHMOD_SYSTEM',
            'UFW_DISABLE',
            'SYSTEMCTL_STOP'
        ]
    }
};

/**
 * Envoie une requête à l'API (OpenAI ou serveur personnel)
 * @param {Array} messages - Historique de la conversation
 * @param {string} systemPrompt - Prompt système à utiliser
 * @returns {Promise<Object>} Réponse de l'IA
 */
export async function sendToOpenAI(messages, systemPrompt = 'devops_agent') {
    if (!OPENAI_API_KEY) {
        throw new Error('OpenAI API key not configured');
    }

    try {
        console.log(`[OpenAI Provider] Sending request to ${OPENAI_API_URL}`);
        console.log(`[OpenAI Provider] Model: ${OPENAI_MODEL}`);
        console.log(`[OpenAI Provider] Messages count: ${messages.length + 1}`);

        const response = await axios.post(
            OPENAI_API_URL,
            {
                model: OPENAI_MODEL,
                messages: [
                    { role: 'system', content: SYSTEM_PROMPTS[systemPrompt] },
                    ...messages
                ],
                max_tokens: OPENAI_MAX_TOKENS,
                temperature: OPENAI_TEMPERATURE,
                presence_penalty: 0.6,
                frequency_penalty: 0.3
            },
            {
                headers: {
                    'X-API-Key': OPENAI_API_KEY,  // IA-CORE AENEWS (Méthode principale)
                    'Authorization': `Bearer ${OPENAI_API_KEY}`,  // Fallback
                    'Content-Type': 'application/json'
                },
                timeout: 90000 // 90s timeout (pour cold start IA-CORE)
            }
        );

        console.log('[OpenAI Provider] Response received successfully');
        console.log(`[OpenAI Provider] Model used: ${response.data.model || OPENAI_MODEL}`);

        return {
            success: true,
            message: response.data.choices[0].message.content,
            usage: response.data.usage,
            model: response.data.model || OPENAI_MODEL
        };
    } catch (error) {
        console.error('[OpenAI Provider] API Error:', error.response?.data || error.message);
        
        if (error.response?.status === 401) {
            throw new Error('Invalid API key');
        } else if (error.response?.status === 429) {
            throw new Error('Rate limit exceeded. Please try again later.');
        } else if (error.code === 'ECONNABORTED') {
            throw new Error('Request timeout. The model took too long to respond.');
        } else if (error.response?.status === 404) {
            throw new Error(`API endpoint not found: ${OPENAI_API_URL}`);
        } else {
            throw new Error(`API error: ${error.message}`);
        }
    }
}

/**
 * Analyse du code avec GPT-4
 * @param {string} code - Code à analyser
 * @param {string} language - Langage de programmation
 * @param {string} filename - Nom du fichier
 * @returns {Promise<Object>} Analyse du code
 */
export async function analyzeCodeWithAI(code, language, filename) {
    const messages = [
        {
            role: 'user',
            content: `Analyse ce code ${language} du fichier "${filename}" :\n\n\`\`\`${language}\n${code}\n\`\`\`\n\nIdentifie les bugs, problèmes de sécurité, et optimisations possibles.`
        }
    ];

    return await sendToOpenAI(messages, 'code_analyzer');
}

/**
 * Audit de sécurité avec GPT-4
 * @param {Object} context - Contexte de l'application (fichiers, config, etc.)
 * @returns {Promise<Object>} Rapport d'audit
 */
export async function securityAuditWithAI(context) {
    const messages = [
        {
            role: 'user',
            content: `Effectue un audit de sécurité de cette application :\n\nPackage.json:\n\`\`\`json\n${JSON.stringify(context.packageJson, null, 2)}\n\`\`\`\n\nFichiers de configuration:\n${context.configFiles.map(f => `- ${f.path}`).join('\n')}\n\nIdentifie toutes les vulnérabilités et propose des corrections.`
        }
    ];

    return await sendToOpenAI(messages, 'security_auditor');
}

/**
 * Expertise Docker avec GPT-4
 * @param {string} dockerfile - Contenu du Dockerfile
 * @param {Array} containers - Liste des containers
 * @returns {Promise<Object>} Analyse Docker
 */
export async function dockerExpertiseWithAI(dockerfile, containers) {
    const messages = [
        {
            role: 'user',
            content: `Analyse cette configuration Docker :\n\nDockerfile:\n\`\`\`dockerfile\n${dockerfile}\n\`\`\`\n\nContainers actifs:\n${containers.map(c => `- ${c.name} (${c.image})`).join('\n')}\n\nPropose des optimisations et identifie les problèmes.`
        }
    ];

    return await sendToOpenAI(messages, 'docker_expert');
}

/**
 * Conversation générale avec l'agent DevOps
 * @param {Array} conversationHistory - Historique de la conversation
 * @param {string} userMessage - Nouveau message de l'utilisateur
 * @param {Object} context - Contexte actuel (serveur, fichiers ouverts, etc.)
 * @returns {Promise<Object>} Réponse de l'agent
 */
export async function chatWithAgent(conversationHistory, userMessage, context = {}) {
    // Préparer le contexte pour l'IA
    let contextString = '';
    if (context.server) {
        contextString += `\n[Serveur actif: ${context.server.name} (${context.server.host})]`;
    }
    if (context.currentDirectory) {
        contextString += `\n[Répertoire: ${context.currentDirectory}]`;
    }
    if (context.openFiles && context.openFiles.length > 0) {
        contextString += `\n[Fichiers ouverts: ${context.openFiles.join(', ')}]`;
    }

    const messages = [
        ...conversationHistory,
        {
            role: 'user',
            content: contextString ? `${contextString}\n\n${userMessage}` : userMessage
        }
    ];

    const response = await sendToOpenAI(messages, 'devops_agent');
    
    // Parser la réponse pour extraire les actions proposées
    const actions = extractActionsFromResponse(response.message);
    
    return {
        ...response,
        actions,
        requiresConfirmation: actions.some(a => a.requiresConfirmation)
    };
}

/**
 * Extrait les actions de la réponse de l'IA
 * @param {string} message - Message de l'IA
 * @returns {Array} Liste des actions détectées
 */
function extractActionsFromResponse(message) {
    const actions = [];
    const actionPatterns = [
        { pattern: /ANALYZE_CODE\((.*?)\)/g, type: 'ANALYZE_CODE', risk: 'SAFE' },
        { pattern: /READ_FILE\((.*?)\)/g, type: 'READ_FILE', risk: 'SAFE' },
        { pattern: /WRITE_FILE\((.*?)\)/g, type: 'WRITE_FILE', risk: 'MODERATE' },
        { pattern: /EXECUTE_COMMAND\((.*?)\)/g, type: 'EXECUTE_COMMAND', risk: 'MODERATE' },
        { pattern: /DELETE_FILE\((.*?)\)/g, type: 'DELETE_FILE', risk: 'CRITICAL' }
    ];

    actionPatterns.forEach(({ pattern, type, risk }) => {
        let match;
        while ((match = pattern.exec(message)) !== null) {
            actions.push({
                type,
                params: match[1],
                risk,
                requiresConfirmation: ACTION_RISK_LEVELS[risk].requiresConfirmation
            });
        }
    });

    return actions;
}

/**
 * Génère une suggestion de correction de code
 * @param {string} code - Code avec bug
 * @param {string} bugDescription - Description du bug
 * @returns {Promise<string>} Code corrigé
 */
export async function suggestCodeFix(code, bugDescription) {
    const messages = [
        {
            role: 'user',
            content: `Corrige ce bug dans le code suivant :\n\nBug: ${bugDescription}\n\nCode:\n\`\`\`\n${code}\n\`\`\`\n\nDonne uniquement le code corrigé, sans explication.`
        }
    ];

    const response = await sendToOpenAI(messages, 'code_analyzer');
    
    // Extraire le code corrigé des balises ```
    const codeMatch = response.message.match(/```(?:\w+)?\n([\s\S]*?)\n```/);
    return codeMatch ? codeMatch[1] : response.message;
}

/**
 * Vérifie si l'API OpenAI est configurée
 * @returns {boolean}
 */
export function isOpenAIConfigured() {
    return Boolean(OPENAI_API_KEY && OPENAI_API_KEY !== 'your-openai-api-key-here');
}

/**
 * Teste la connexion à l'API OpenAI
 * @returns {Promise<Object>}
 */
export async function testOpenAIConnection() {
    try {
        const response = await sendToOpenAI([
            { role: 'user', content: 'Test de connexion. Réponds simplement "OK".' }
        ]);
        
        return {
            success: true,
            message: 'AI API connected successfully',
            model: response.model,
            baseUrl: OPENAI_BASE_URL
        };
    } catch (error) {
        return {
            success: false,
            error: error.message,
            baseUrl: OPENAI_BASE_URL
        };
    }
}
