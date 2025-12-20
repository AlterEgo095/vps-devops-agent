import OpenAI from 'openai';
import { db } from './database-sqlite.js';
import * as openaiProvider from './openai-provider.js';

const AI_PROVIDER = process.env.AI_PROVIDER || 'openai';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;

// Configuration OpenAI
const openai = OPENAI_API_KEY ? new OpenAI({
  apiKey: OPENAI_API_KEY
}) : null;

// Configuration DeepSeek
const deepseek = DEEPSEEK_API_KEY ? new OpenAI({
  apiKey: DEEPSEEK_API_KEY,
  baseURL: 'https://api.deepseek.com'
}) : null;

/**
 * Système de prompts pour l'agent
 */
const SYSTEM_PROMPT = `Tu es un agent DevOps expert qui aide à gérer un serveur VPS Ubuntu.

Tu as accès à ces capacités sécurisées :

📁 GESTION DE FICHIERS BASIQUE :
- createFile(filePath, content) : Créer un fichier
- readFile(filePath) : Lire un seul fichier
- listDirectory(dirPath) : Lister un répertoire
- createDirectory(dirPath) : Créer un répertoire
- delete(targetPath) : Supprimer un fichier/dossier

📚 GESTION AVANCÉE DE FICHIERS (SPRINT 1 - PRIVILÉGIER) :
- readMultipleFiles(filePaths[], options) : Lire plusieurs fichiers d'un coup avec pattern matching
  * Args: filePaths (array de chemins), options {patterns: ["*.js", "src/*.ts"], continueOnError: true}
  * Exemple: readMultipleFiles(["package.json", "README.md"], {patterns: ["src/*.js"]})
  * Avantage: 1 seul appel au lieu de N appels readFile
  * À utiliser quand: l'utilisateur demande de lire plusieurs fichiers ou avec patterns

🔍 RECHERCHE ET ANALYSE (SPRINT 1 - PRIVILÉGIER) :
- searchInFiles(pattern, options) : Recherche grep-like dans fichiers
  * Args: pattern (string), options {directory: ".", fileTypes: [".js"], caseSensitive: false, contextLines: 3}
  * Exemple: searchInFiles("TODO", {directory: "mon-projet", fileTypes: [".js", ".ts"]})
  * Avantage: Recherche rapide avec contexte, filtrage par type
  * À utiliser quand: chercher TODO, FIXME, erreurs, patterns dans le code

- analyzeCodebase(directory, options) : Analyse complète d'un projet
  * Args: directory (string), options {deep: true, includeDependencies: true, includeTree: false}
  * Retourne: type de projet, langages, frameworks, dépendances, structure, statistiques
  * Exemple: analyzeCodebase("mon-projet", {deep: true})
  * Avantage: Analyse complète en 1 appel vs plusieurs readFile + parsing manuel
  * À utiliser quand: analyser structure, identifier frameworks, comprendre projet

✏️ ÉDITION AVANCÉE (SPRINT 1 - UTILISER AVEC PRÉCAUTION) :
- editFile(filePath, edits[], options) : Édition multi-zone avec backup automatique
  * Args: filePath (string), edits [{search: "old", replace: "new"}], options {createBackup: true, validateSyntax: true}
  * Exemple: editFile("index.js", [{search: "const port = 3000", replace: "const port = 4000"}])
  * Avantage: Backup auto, validation syntaxe, rollback si erreur, génère diff
  * À utiliser quand: modifier du code de façon sécurisée

🐳 DOCKER & DÉPLOIEMENT :
- dockerCompose(projectPath, command) : Exécuter docker compose
- npmInstall(projectPath) : Installer les dépendances npm
- dockerBuild(projectPath, imageName) : Construire une image Docker
- dockerRun(imageName, containerName, ports, env) : Lancer un conteneur
- dockerLogs(containerName, tail) : Voir les logs d'un conteneur

⚙️ CONFIGURATION :
- configureNginx(siteName, config) : Créer une config Nginx
- createScript(scriptPath, content) : Créer un script shell
- gitInit(projectPath) : Initialiser un repo Git

RÈGLES D'OPTIMISATION IMPORTANTES :

🚀 PRIORISER LES CAPACITÉS SPRINT 1 (plus rapides, plus efficaces) :
1. Si besoin de lire plusieurs fichiers → utilise readMultipleFiles (1 appel) au lieu de plusieurs readFile
2. Si besoin de chercher dans fichiers → utilise searchInFiles au lieu de listDirectory + readFile + grep manuel
3. Si besoin d'analyser un projet → utilise analyzeCodebase au lieu de multiples listDirectory + readFile
4. Si besoin d'éditer avec sécurité → utilise editFile avec backup automatique

EXEMPLES DE PLANS OPTIMISÉS :

❌ MAUVAIS (ancien, lent) :
"Lis tous les fichiers JS du projet"
→ listDirectory → readFile("file1.js") → readFile("file2.js") → readFile("file3.js")
   (3+ appels séparés)

✅ BON (Sprint 1, rapide) :
"Lis tous les fichiers JS du projet"  
→ readMultipleFiles([], {patterns: ["*.js", "src/**/*.js"]})
   (1 seul appel)

❌ MAUVAIS :
"Cherche tous les TODO"
→ listDirectory → readFile chaque fichier → parser manuellement

✅ BON :
"Cherche tous les TODO"
→ searchInFiles("TODO", {directory: ".", fileTypes: [".js", ".ts"]})
   (1 seul appel avec résultats structurés)

❌ MAUVAIS :
"Analyse ce projet Node.js"
→ readFile("package.json") → listDirectory("src") → readFile chaque fichier

✅ BON :
"Analyse ce projet Node.js"
→ analyzeCodebase(".", {deep: true, includeDependencies: true})
   (1 seul appel avec analyse complète)

STRUCTURE DE RÉPONSE :
- Tous les chemins sont relatifs au workspace : /opt/agent-projects
- Tu dois générer un PLAN D'ACTION détaillé avant d'agir
- Chaque action doit utiliser une capacité de la liste ci-dessus
- Retourne toujours un JSON structuré avec :
  {
    "analysis": "Analyse de la demande",
    "plan": "Description du plan d'action",
    "actions": [
      {
        "step": 1,
        "description": "Description de l'action",
        "capability": "nom_de_la_capacite",
        "args": ["arg1", "arg2"]
      }
    ],
    "warnings": ["Avertissements éventuels"],
    "estimated_time": "Temps estimé"
  }

Réponds UNIQUEMENT avec du JSON valide, sans texte supplémentaire.`;

/**
 * Créer une nouvelle conversation
 */
export function createConversation(userId, serverId = null, title = null) {
    try {
        const result = db.prepare(`
            INSERT INTO ai_conversations (user_id, server_id, title)
            VALUES (?, ?, ?)
        `).run(userId, serverId, title || `New conversation ${Date.now()}`);

        return {
            success: true,
            id: result.lastInsertRowid,
            userId,
            serverId,
            title: title || `New conversation ${Date.now()}`,
            createdAt: new Date().toISOString()
        };
    } catch (error) {
        console.error('Error creating conversation:', error);
        throw error;
    }
}

/**
 * Traiter un message utilisateur et générer une réponse IA
 */
export async function processMessage(conversationId, userMessage, context = {}) {
    try {
        // Enregistrer le message utilisateur
        const userMessageId = db.prepare(`
            INSERT INTO ai_messages (conversation_id, role, content)
            VALUES (?, 'user', ?)
        `).run(conversationId, userMessage).lastInsertRowid;

        // Récupérer l'historique de la conversation (limité aux 20 derniers messages)
        const MAX_HISTORY_MESSAGES = 20;
        const messagesRaw = db.prepare(`
            SELECT role, content FROM ai_messages
            WHERE conversation_id = ?
            ORDER BY created_at DESC
            LIMIT ?
        `).all(conversationId, MAX_HISTORY_MESSAGES);
        
        // Inverser pour avoir l'ordre chronologique
        const messages = messagesRaw.reverse();

        // Formater pour OpenAI
        const chatMessages = messages.map(m => ({
            role: m.role,
            content: m.content
        }));

        // Appeler OpenAI
        const response = await openaiProvider.sendToOpenAI(chatMessages, 'devops_agent');

        // Enregistrer la réponse de l'assistant
        const assistantMessageId = db.prepare(`
            INSERT INTO ai_messages (conversation_id, role, content, tokens_used)
            VALUES (?, 'assistant', ?, ?)
        `).run(conversationId, response.message, response.usage?.total_tokens || 0).lastInsertRowid;

        // Mettre à jour la conversation
        db.prepare(`
            UPDATE ai_conversations
            SET last_message_at = datetime('now'),
                message_count = message_count + 2
            WHERE id = ?
        `).run(conversationId);

        return {
            success: true,
            userMessage: {
                id: userMessageId,
                role: 'user',
                content: userMessage
            },
            assistantMessage: {
                id: assistantMessageId,
                role: 'assistant',
                content: response.message
            },
            usage: response.usage
        };
    } catch (error) {
        console.error('Error processing message:', error);
        throw error;
    }
}

/**
 * Exécuter une action (stub pour l'instant)
 */
export async function executeAction(actionId, actionData, context) {
    try {
        // Marquer l'action comme en cours d'exécution
        db.prepare(`
            UPDATE ai_actions
            SET status = 'executing', executed_at = datetime('now')
            WHERE id = ?
        `).run(actionId);

        // TODO: Implémenter l'exécution réelle selon le type d'action
        // Pour l'instant, on simule une exécution réussie
        const result = {
            success: true,
            message: 'Action execution not yet implemented',
            actionType: actionData.type
        };

        // Mettre à jour l'action avec le résultat
        db.prepare(`
            UPDATE ai_actions
            SET status = 'completed',
                output = ?,
                completed_at = datetime('now')
            WHERE id = ?
        `).run(JSON.stringify(result), actionId);

        return result;
    } catch (error) {
        // En cas d'erreur, mettre à jour l'action
        db.prepare(`
            UPDATE ai_actions
            SET status = 'failed',
                error = ?,
                completed_at = datetime('now')
            WHERE id = ?
        `).run(error.message, actionId);

        throw error;
    }
}

/**
 * Générer un plan d'action avec l'IA
 */
export async function generateActionPlan(userRequest) {
  const client = AI_PROVIDER === 'deepseek' ? deepseek : openai;
  
  if (!client) {
    throw new Error(`AI provider not configured: ${AI_PROVIDER}`);
  }

  try {
    const completion = await client.chat.completions.create({
      model: AI_PROVIDER === 'deepseek' ? 'deepseek-chat' : 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: SYSTEM_PROMPT
        },
        {
          role: 'user',
          content: userRequest
        }
      ],
      temperature: 0.7,
      response_format: { type: "json_object" }
    });

    const response = completion.choices[0].message.content;
    const plan = JSON.parse(response);

    return {
      success: true,
      plan,
      usage: {
        prompt_tokens: completion.usage?.prompt_tokens || 0,
        completion_tokens: completion.usage?.completion_tokens || 0,
        total_tokens: completion.usage?.total_tokens || 0
      }
    };
  } catch (error) {
    console.error('AI Error:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Générer du code avec l'IA
 */
export async function generateCode(description, language = 'javascript') {
  const client = AI_PROVIDER === 'deepseek' ? deepseek : openai;
  
  if (!client) {
    throw new Error(`AI provider not configured: ${AI_PROVIDER}`);
  }

  const prompt = `Génère du code ${language} pour : ${description}
  
Retourne UNIQUEMENT le code, sans explications ni markdown.`;

  try {
    const completion = await client.chat.completions.create({
      model: AI_PROVIDER === 'deepseek' ? 'deepseek-chat' : 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: 'Tu es un expert en programmation. Génère du code propre et fonctionnel.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.3
    });

    const code = completion.choices[0].message.content;

    return {
      success: true,
      code
    };
  } catch (error) {
    console.error('Code generation error:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Analyser les résultats d'exécution et suggérer corrections
 */
export async function analyzeExecutionResults(plan, results, errors) {
  const client = AI_PROVIDER === 'deepseek' ? deepseek : openai;
  
  if (!client) {
    throw new Error(`AI provider not configured: ${AI_PROVIDER}`);
  }

  const prompt = `Plan d'action :
${JSON.stringify(plan, null, 2)}

Résultats d'exécution :
${JSON.stringify(results, null, 2)}

Erreurs rencontrées :
${JSON.stringify(errors, null, 2)}

Analyse les résultats et :
1. Identifie les problèmes
2. Suggère des corrections
3. Propose un plan de récupération si nécessaire

Réponds en JSON avec :
{
  "status": "success" | "partial" | "failed",
  "summary": "Résumé de l'exécution",
  "issues": ["Liste des problèmes"],
  "suggestions": ["Liste des suggestions"],
  "recovery_plan": { "actions": [...] } // Si nécessaire
}`;

  try {
    const completion = await client.chat.completions.create({
      model: AI_PROVIDER === 'deepseek' ? 'deepseek-chat' : 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: 'Tu es un expert DevOps qui analyse les résultats d\'exécution.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.5,
      response_format: { type: "json_object" }
    });

    const analysis = JSON.parse(completion.choices[0].message.content);

    return {
      success: true,
      analysis
    };
  } catch (error) {
    console.error('Analysis error:', error);
    return {
      success: false,
      error: error.message
    };
  }
}
