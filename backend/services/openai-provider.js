/**
 * ============================================================
 * OpenAI Provider Service — Unified AI Interface
 * ============================================================
 *
 * Supports two modes:
 * 1. OpenAI SDK mode (for function calling / ReAct)
 * 2. Custom endpoint mode (for IA-CORE AENEWS)
 *
 * The SDK mode is preferred because it supports native
 * function calling which is required by the ReAct orchestrator.
 *
 * @module OpenAIProvider
 * @version 2.1.0
 */

import logger from '../config/logger.js';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
const OPENAI_BASE_URL = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';
const OPENAI_MAX_TOKENS = parseInt(process.env.OPENAI_MAX_TOKENS) || 4000;
const OPENAI_TEMPERATURE = parseFloat(process.env.OPENAI_TEMPERATURE) || 0.7;

// Determine if we should use SDK or custom endpoint
const USE_CUSTOM_ENDPOINT = OPENAI_BASE_URL.includes('aenews') || OPENAI_BASE_URL.includes('/api/chat');

logger.info('[OpenAI Provider] Configuration:', {
  baseUrl: OPENAI_BASE_URL,
  model: OPENAI_MODEL,
  mode: USE_CUSTOM_ENDPOINT ? 'custom-endpoint (axios)' : 'openai-sdk',
  apiKeySet: !!OPENAI_API_KEY
});

// ============================================================
// SDK Client (lazy initialization)
// ============================================================

let _sdkClient = null;

/**
 * Get or create OpenAI SDK client
 * @returns {Promise<Object>} OpenAI client instance
 */
export async function getSDKClient() {
  if (!_sdkClient) {
    const { default: OpenAI } = await import('openai');

    // Normalize base URL for SDK mode
    let baseURL = OPENAI_BASE_URL;
    if (baseURL.includes('/api/chat')) {
      baseURL = baseURL.replace('/api/chat', '/v1');
    } else if (!baseURL.endsWith('/v1')) {
      baseURL = baseURL.replace(/\/$/, '') + '/v1';
    }

    _sdkClient = new OpenAI({
      apiKey: OPENAI_API_KEY,
      baseURL
    });

    logger.info(`[OpenAI Provider] SDK client initialized — baseURL: ${baseURL}`);
  }
  return _sdkClient;
}

// ============================================================
// SYSTEM PROMPTS
// ============================================================

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
5. Formater le code avec \`\`\`language pour une meilleure lisibilité`,

  code_analyzer: `Tu es un expert en analyse de code. Analyse le code fourni et identifie :
- Bugs potentiels
- Problèmes de sécurité
- Anti-patterns
- Optimisations possibles
- Conformité aux bonnes pratiques`,

  security_auditor: `Tu es un expert en sécurité. Audite l'application et identifie :
- Vulnérabilités connues (CVE)
- Mauvaises pratiques de sécurité
- Credentials exposés
- Configurations dangereuses
- Permissions incorrectes`,

  docker_expert: `Tu es un expert Docker. Analyse les configurations Docker et identifie :
- Dockerfiles non optimisés
- Images vulnérables
- Mauvaises pratiques
- Problèmes de performance
- Optimisations possibles`
};

// ============================================================
// RISK LEVELS
// ============================================================

export const ACTION_RISK_LEVELS = {
  SAFE: {
    level: 0,
    color: 'green',
    requiresConfirmation: false,
    actions: ['READ_FILE', 'ANALYZE_CODE', 'GET_METRICS', 'LIST_FILES', 'SHOW_LOGS', 'GIT_STATUS', 'NPM_LIST', 'DOCKER_PS', 'PS_AUX']
  },
  MODERATE: {
    level: 1,
    color: 'yellow',
    requiresConfirmation: true,
    confirmationType: 'simple',
    actions: ['WRITE_FILE', 'NPM_INSTALL', 'NPM_UPDATE', 'PIP_INSTALL', 'GIT_PULL', 'PM2_RESTART', 'NGINX_RELOAD', 'CREATE_BACKUP', 'MODIFY_CONFIG']
  },
  CRITICAL: {
    level: 2,
    color: 'red',
    requiresConfirmation: true,
    confirmationType: 'detailed',
    actions: ['DELETE_FILE', 'RM_RF', 'DROP_DATABASE', 'GIT_PUSH_FORCE', 'DOCKER_RM', 'DOCKER_STOP', 'CHMOD_SYSTEM', 'UFW_DISABLE', 'SYSTEMCTL_STOP']
  }
};

// ============================================================
// PRIMARY API: sendToOpenAI
// ============================================================

/**
 * Send a chat completion request to the AI model.
 * Uses OpenAI SDK for standard endpoints, axios for custom endpoints.
 *
 * @param {Array} messages - Chat messages array
 * @param {string} systemPrompt - System prompt key or custom prompt
 * @param {Object} options - Additional options (tools, temperature, etc.)
 * @returns {Promise<Object>} AI response
 */
export async function sendToOpenAI(messages, systemPrompt = 'devops_agent', options = {}) {
  if (!OPENAI_API_KEY) {
    throw new Error('OpenAI API key not configured');
  }

  const systemContent = SYSTEM_PROMPTS[systemPrompt] || systemPrompt;
  const fullMessages = [
    { role: 'system', content: systemContent },
    ...messages
  ];

  // Use SDK mode (preferred — supports function calling)
  if (!USE_CUSTOM_ENDPOINT || options.tools) {
    return await _sendViaSDK(fullMessages, options);
  }

  // Use custom endpoint mode (for IA-CORE AENEWS)
  return await _sendViaCustomEndpoint(fullMessages);
}

// ============================================================
// SDK MODE
// ============================================================

/**
 * Send request via OpenAI SDK (supports function calling)
 */
async function _sendViaSDK(messages, options = {}) {
  try {
    const client = await getSDKClient();

    const requestParams = {
      model: options.model || OPENAI_MODEL,
      messages,
      max_tokens: options.max_tokens || OPENAI_MAX_TOKENS,
      temperature: options.temperature ?? OPENAI_TEMPERATURE,
    };

    // Add tools if provided (for function calling)
    if (options.tools && options.tools.length > 0) {
      requestParams.tools = options.tools;
      requestParams.tool_choice = options.tool_choice || 'auto';
    }

    // Add response format if specified
    if (options.response_format) {
      requestParams.response_format = options.response_format;
    }

    const completion = await client.chat.completions.create(requestParams);

    const choice = completion.choices[0];

    return {
      success: true,
      message: choice.message.content || '',
      usage: completion.usage,
      model: completion.model || OPENAI_MODEL,
      tool_calls: choice.message.tool_calls || null,
      finish_reason: choice.finish_reason
    };
  } catch (error) {
    logger.error('[OpenAI Provider] SDK error:', { error: error.message });

    if (error.status === 401) {
      throw new Error('Invalid API key');
    } else if (error.status === 429) {
      throw new Error('Rate limit exceeded. Please try again later.');
    } else if (error.code === 'ECONNABORTED') {
      throw new Error('Request timeout. The model took too long to respond.');
    } else {
      throw new Error(`API error: ${error.message}`);
    }
  }
}

// ============================================================
// CUSTOM ENDPOINT MODE
// ============================================================

/**
 * Send request via custom HTTP endpoint (for IA-CORE AENEWS)
 */
async function _sendViaCustomEndpoint(messages) {
  const axios = (await import('axios')).default;

  const apiUrl = OPENAI_BASE_URL.includes('/api/chat')
    ? OPENAI_BASE_URL
    : `${OPENAI_BASE_URL}/api/chat`;

  try {
    logger.info(`[OpenAI Provider] Sending to custom endpoint: ${apiUrl}`);

    const response = await axios.post(
      apiUrl,
      {
        model: OPENAI_MODEL,
        messages,
        max_tokens: OPENAI_MAX_TOKENS,
        temperature: OPENAI_TEMPERATURE,
        presence_penalty: 0.6,
        frequency_penalty: 0.3
      },
      {
        headers: {
          'X-API-Key': OPENAI_API_KEY,
          'Authorization': `Bearer ${OPENAI_API_KEY}`,
          'Content-Type': 'application/json'
        },
        timeout: 90000
      }
    );

    return {
      success: true,
      message: response.data.choices[0].message.content,
      usage: response.data.usage,
      model: response.data.model || OPENAI_MODEL
    };
  } catch (error) {
    logger.error('[OpenAI Provider] Custom endpoint error:', {
      error: error.response?.data || error.message
    });

    if (error.response?.status === 401) {
      throw new Error('Invalid API key');
    } else if (error.response?.status === 429) {
      throw new Error('Rate limit exceeded. Please try again later.');
    } else if (error.code === 'ECONNABORTED') {
      throw new Error('Request timeout.');
    } else if (error.response?.status === 404) {
      throw new Error(`API endpoint not found: ${apiUrl}`);
    } else {
      throw new Error(`API error: ${error.message}`);
    }
  }
}

// ============================================================
// CONVENIENCE FUNCTIONS
// ============================================================

/**
 * Analyze code with AI
 * @param {string} code - Code to analyze
 * @param {string} language - Programming language
 * @param {string} filename - Filename
 * @returns {Promise<Object>}
 */
export async function analyzeCodeWithAI(code, language, filename) {
  const messages = [{
    role: 'user',
    content: `Analyse ce code ${language} du fichier "${filename}" :\n\n\`\`\`${language}\n${code}\n\`\`\`\n\nIdentifie les bugs, problèmes de sécurité, et optimisations possibles.`
  }];
  return await sendToOpenAI(messages, 'code_analyzer');
}

/**
 * Security audit with AI
 * @param {Object} context - Application context
 * @returns {Promise<Object>}
 */
export async function securityAuditWithAI(context) {
  const messages = [{
    role: 'user',
    content: `Effectue un audit de sécurité de cette application :\n\nPackage.json:\n\`\`\`json\n${JSON.stringify(context.packageJson, null, 2)}\n\`\`\`\n\nFichiers de configuration:\n${context.configFiles.map(f => `- ${f.path}`).join('\n')}`
  }];
  return await sendToOpenAI(messages, 'security_auditor');
}

/**
 * Docker expertise with AI
 * @param {string} dockerfile - Dockerfile content
 * @param {Array} containers - Container list
 * @returns {Promise<Object>}
 */
export async function dockerExpertiseWithAI(dockerfile, containers) {
  const messages = [{
    role: 'user',
    content: `Analyse cette configuration Docker :\n\nDockerfile:\n\`\`\`dockerfile\n${dockerfile}\n\`\`\`\n\nContainers actifs:\n${containers.map(c => `- ${c.name} (${c.image})`).join('\n')}`
  }];
  return await sendToOpenAI(messages, 'docker_expert');
}

/**
 * Chat with agent
 * @param {Array} conversationHistory - Chat history
 * @param {string} userMessage - New message
 * @param {Object} context - Context
 * @returns {Promise<Object>}
 */
export async function chatWithAgent(conversationHistory, userMessage, context = {}) {
  let contextString = '';
  if (context.server) {
    contextString += `\n[Serveur actif: ${context.server.name} (${context.server.host})]`;
  }
  if (context.currentDirectory) {
    contextString += `\n[Répertoire: ${context.currentDirectory}]`;
  }

  const messages = [
    ...conversationHistory,
    { role: 'user', content: contextString ? `${contextString}\n\n${userMessage}` : userMessage }
  ];

  return await sendToOpenAI(messages, 'devops_agent');
}

/**
 * Suggest code fix
 * @param {string} code - Buggy code
 * @param {string} bugDescription - Bug description
 * @returns {Promise<string>}
 */
export async function suggestCodeFix(code, bugDescription) {
  const messages = [{
    role: 'user',
    content: `Corrige ce bug dans le code suivant :\n\nBug: ${bugDescription}\n\nCode:\n\`\`\`\n${code}\n\`\`\`\n\nDonne uniquement le code corrigé, sans explication.`
  }];

  const response = await sendToOpenAI(messages, 'code_analyzer');
  const codeMatch = response.message.match(/```(?:\w+)?\n([\s\S]*?)\n```/);
  return codeMatch ? codeMatch[1] : response.message;
}

/**
 * Check if OpenAI is configured
 * @returns {boolean}
 */
export function isOpenAIConfigured() {
  return Boolean(OPENAI_API_KEY && OPENAI_API_KEY !== 'your-openai-api-key-here');
}

/**
 * Test OpenAI connection
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
