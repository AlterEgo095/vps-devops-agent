/**
 * AI Chat Routes
 * Natural Language Command Execution
 */

import express from 'express';
import OpenAI from 'openai';
import crypto from 'crypto';
import { db } from '../services/database-sqlite.js';
import * as executor from '../services/agent-executor.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// Apply authentication
router.use(authenticateToken);

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
const AI_PROVIDER = process.env.AI_PROVIDER || 'openai';

// Configuration AI
const openaiClient = OPENAI_API_KEY ? new OpenAI({ apiKey: OPENAI_API_KEY }) : null;
const deepseekClient = DEEPSEEK_API_KEY ? new OpenAI({
  apiKey: DEEPSEEK_API_KEY,
  baseURL: 'https://api.deepseek.com'
}) : null;

const AI_SYSTEM_PROMPT = `Tu es un expert DevOps qui traduit des demandes en français vers des commandes shell Linux/Ubuntu.

RÈGLES IMPORTANTES:
1. Réponds UNIQUEMENT avec du JSON valide dans ce format exact:
{
  "command": "la commande shell à exécuter",
  "explanation": "explication courte en français de ce que fait la commande",
  "risk": "low|medium|high"
}

2. TOUJOURS retourner UNE SEULE commande shell (pas de multi-ligne sauf avec &&)

3. NIVEAU DE RISQUE:
   - "low": lecture seule (ls, cat, ps, df, free, uptime, etc.)
   - "medium": modifications réversibles (mkdir, touch, cp, service restart)
   - "high": suppressions, modifications système (rm, apt, systemctl stop, etc.)

4. EXEMPLES DE TRADUCTION:

Utilisateur: "Quel est l'état du CPU?"
Réponse: {"command": "top -bn1 | head -20", "explanation": "Affiche l'utilisation CPU et les processus actifs", "risk": "low"}

Utilisateur: "Redémarre nginx"
Réponse: {"command": "sudo systemctl restart nginx", "explanation": "Redémarre le service nginx", "risk": "medium"}

Utilisateur: "Montre les 50 dernières lignes des logs nginx"
Réponse: {"command": "sudo tail -n 50 /var/log/nginx/error.log", "explanation": "Affiche les 50 dernières lignes du log d'erreur nginx", "risk": "low"}

Utilisateur: "Liste les services actifs"
Réponse: {"command": "systemctl list-units --type=service --state=running", "explanation": "Liste tous les services en cours d'exécution", "risk": "low"}

Utilisateur: "Espace disque disponible"
Réponse: {"command": "df -h", "explanation": "Affiche l'espace disque de tous les systèmes de fichiers", "risk": "low"}

Utilisateur: "Combien de RAM utilisée?"
Réponse: {"command": "free -h", "explanation": "Affiche l'utilisation de la mémoire RAM et swap", "risk": "low"}

5. Si la demande est ambiguë ou dangereuse, propose la commande la plus sûre possible.

6. IMPORTANT: Ne retourne QUE le JSON, RIEN D'AUTRE (pas de markdown, pas de commentaires)`;

/**
 * Déchiffrement des credentials
 */
function decryptPassword(encryptedCredentials, secret = process.env.JWT_SECRET) {
    if (!encryptedCredentials) return '';

    if (encryptedCredentials.includes(':')) {
        try {
            const [ivHex, encryptedHex] = encryptedCredentials.split(':');
            const iv = Buffer.from(ivHex, 'hex');
            const key = crypto.scryptSync(secret, 'salt', 32);
            const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
            
            let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
            decrypted += decipher.final('utf8');
            return decrypted;
        } catch (error) {
            return Buffer.from(encryptedCredentials, 'base64').toString();
        }
    }
    return Buffer.from(encryptedCredentials, 'base64').toString();
}

/**
 * POST /api/ai/agent/chat
 * Chat en langage naturel avec traduction automatique en commandes shell
 */
router.post('/chat', async (req, res) => {
    try {
        const userId = req.user.id;
        const { message, serverId, context } = req.body;

        console.log(`[AI CHAT] Request - userId: ${userId}, serverId: ${serverId}, message: "${message}"`);

        // Validation
        if (!message) {
            return res.status(400).json({
                success: false,
                error: 'Message is required'
            });
        }

        if (!serverId) {
            return res.status(400).json({
                success: false,
                error: 'Server ID is required. Please select a server first.'
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

        // Décrypter le mot de passe
        server.decrypted_password = decryptPassword(server.encrypted_credentials);

        // Appeler l'AI pour traduire le message en commande
        const aiClient = AI_PROVIDER === 'deepseek' && deepseekClient ? deepseekClient : openaiClient;
        
        if (!aiClient) {
            return res.status(500).json({
                success: false,
                error: 'AI provider not configured. Please set OPENAI_API_KEY or DEEPSEEK_API_KEY in environment variables.'
            });
        }

        console.log(`[AI CHAT] Calling AI (${AI_PROVIDER}) to translate: "${message}"`);

        const aiResponse = await aiClient.chat.completions.create({
            model: AI_PROVIDER === 'deepseek' ? 'deepseek-chat' : 'gpt-4o-mini',
            messages: [
                { role: 'system', content: AI_SYSTEM_PROMPT },
                { 
                    role: 'user', 
                    content: `Serveur: ${context?.serverName || server.name || server.host}\nDemande: ${message}` 
                }
            ],
            temperature: 0.3,
            max_tokens: 500
        });

        const aiContent = aiResponse.choices[0].message.content.trim();
        console.log(`[AI CHAT] AI raw response: ${aiContent}`);

        // Parser la réponse JSON
        let commandData;
        try {
            const jsonMatch = aiContent.match(/\{[\s\S]*\}/);
            const jsonStr = jsonMatch ? jsonMatch[0] : aiContent;
            commandData = JSON.parse(jsonStr);
        } catch (parseError) {
            console.error('[AI CHAT] Failed to parse AI response:', parseError);
            return res.json({
                success: true,
                response: 'Désolé, je n\'ai pas pu comprendre votre demande. Pouvez-vous reformuler?',
                command: null,
                output: null
            });
        }

        const { command, explanation, risk } = commandData;

        if (!command) {
            return res.json({
                success: true,
                response: 'Je n\'ai pas pu générer de commande pour cette demande.',
                command: null,
                output: null
            });
        }

        console.log(`[AI CHAT] Generated command: "${command}" (risk: ${risk})`);

        // Classifier le risque
        const calculatedRisk = executor.classifyRisk(command);
        const finalRisk = risk || calculatedRisk;

        // Exécuter la commande sur le serveur
        console.log(`[AI CHAT] Executing command on server: ${server.name || server.host}`);
        const results = await executor.executeOnMultipleServers([server], command);
        const result = results[0];

        // Enregistrer dans l'historique
        executor.saveToHistory(userId, result, null);

        // Préparer la réponse
        let responseText = explanation;
        
        if (result.success) {
            responseText += '\n\n✅ **Commande exécutée avec succès**';
        } else {
            responseText += `\n\n❌ **Erreur lors de l'exécution**: ${result.error}`;
        }

        console.log(`[AI CHAT] Execution result - Success: ${result.success}, Exit code: ${result.exit_code}`);

        return res.json({
            success: true,
            response: responseText,
            command: command,
            output: result.output || result.error,
            risk: finalRisk,
            executionSuccess: result.success,
            metadata: {
                server: {
                    id: server.id,
                    name: server.name || server.host,
                    host: server.host
                },
                duration_ms: result.duration_ms,
                exit_code: result.exit_code,
                timestamp: result.timestamp
            }
        });

    } catch (error) {
        console.error('[AI CHAT] Error:', error);
        return res.status(500).json({
            success: false,
            error: 'Internal server error',
            message: error.message,
            response: 'Désolé, une erreur s\'est produite lors du traitement de votre demande.'
        });
    }
});

export default router;
