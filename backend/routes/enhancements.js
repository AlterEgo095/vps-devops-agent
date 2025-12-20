import express from 'express';
import { capabilities } from '../services/capabilities.js';
import { exec } from 'child_process';
import { promisify } from 'util';

const router = express.Router();
const execAsync = promisify(exec);

// ==========================================
// MIDDLEWARE D'AUTHENTIFICATION
// ==========================================

const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ 
      success: false, 
      error: 'Token manquant',
      message: 'Authorization header required' 
    });
  }

  // Pour le moment, on laisse passer (à adapter selon votre config JWT)
  next();
};

// Appliquer l'authentification sur toutes les routes
// router.use(authenticateToken); // Décommenter pour activer l'auth

// ==========================================
// HELPER: GESTION D'ERREURS
// ==========================================

const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

// ==========================================
// ROUTES SANDBOX & EXECUTION
// ==========================================

/**
 * POST /api/enhancements/sandbox/execute
 * Execute command in isolated Docker container
 */
router.post('/sandbox/execute', asyncHandler(async (req, res) => {
  const { command, options = {} } = req.body;

  if (!command) {
    return res.status(400).json({
      success: false,
      error: 'Command is required'
    });
  }

  const result = await capabilities.executeSandboxed(command, options);
  
  res.json({
    success: result.success,
    output: {
      stdout: result.stdout,
      stderr: result.stderr,
      exitCode: result.exitCode
    },
    execution: {
      image: options.image || 'node:20-alpine',
      timeout: options.timeout || 300000,
      memoryLimit: options.memoryLimit || '512MB'
    }
  });
}));

/**
 * POST /api/enhancements/sandbox/execute-with-mount
 * Execute command with filesystem mount
 */
router.post('/sandbox/execute-with-mount', asyncHandler(async (req, res) => {
  const { command, localPath, options = {} } = req.body;

  if (!command || !localPath) {
    return res.status(400).json({
      success: false,
      error: 'Command and localPath are required'
    });
  }

  const result = await capabilities.executeSandboxedWithMount(command, localPath, options);
  
  res.json({
    success: result.success,
    output: {
      stdout: result.stdout,
      stderr: result.stderr,
      exitCode: result.exitCode
    },
    mount: {
      localPath,
      containerPath: '/workspace'
    }
  });
}));

/**
 * POST /api/enhancements/sandbox/ensure-image
 * Ensure Docker image is available
 */
router.post('/sandbox/ensure-image', asyncHandler(async (req, res) => {
  const { imageName } = req.body;

  if (!imageName) {
    return res.status(400).json({
      success: false,
      error: 'imageName is required'
    });
  }

  const result = await capabilities.ensureImage(imageName);
  
  res.json({
    success: result.success,
    image: result.image,
    message: result.message
  });
}));

// ==========================================
// ROUTES GIT & VERSION CONTROL
// ==========================================

/**
 * POST /api/enhancements/git/init
 * Initialize Git repository
 */
router.post('/git/init', asyncHandler(async (req, res) => {
  const { repoPath } = req.body;

  if (!repoPath) {
    return res.status(400).json({
      success: false,
      error: 'repoPath is required'
    });
  }

  const result = await capabilities.gitInit(repoPath);
  
  res.json(result);
}));

/**
 * POST /api/enhancements/git/clone
 * Clone Git repository
 */
router.post('/git/clone', asyncHandler(async (req, res) => {
  const { repoUrl, destPath, options = {} } = req.body;

  if (!repoUrl || !destPath) {
    return res.status(400).json({
      success: false,
      error: 'repoUrl and destPath are required'
    });
  }

  const result = await capabilities.gitClone(repoUrl, destPath, options);
  
  res.json(result);
}));

/**
 * POST /api/enhancements/git/commit
 * Commit changes
 */
router.post('/git/commit', asyncHandler(async (req, res) => {
  const { repoPath, message, options = {} } = req.body;

  if (!repoPath || !message) {
    return res.status(400).json({
      success: false,
      error: 'repoPath and message are required'
    });
  }

  const result = await capabilities.gitCommit(repoPath, message, options);
  
  res.json(result);
}));

/**
 * POST /api/enhancements/git/push
 * Push changes to remote
 */
router.post('/git/push', asyncHandler(async (req, res) => {
  const { repoPath, options = {} } = req.body;

  if (!repoPath) {
    return res.status(400).json({
      success: false,
      error: 'repoPath is required'
    });
  }

  const result = await capabilities.gitPush(repoPath, options);
  
  res.json(result);
}));

/**
 * GET /api/enhancements/git/status
 * Get repository status
 */
router.get('/git/status', asyncHandler(async (req, res) => {
  const { repoPath } = req.query;

  if (!repoPath) {
    return res.status(400).json({
      success: false,
      error: 'repoPath query parameter is required'
    });
  }

  const result = await capabilities.gitStatus(repoPath);
  
  res.json(result);
}));

/**
 * POST /api/enhancements/git/commit-and-push
 * Commit and push in one operation
 */
router.post('/git/commit-and-push', asyncHandler(async (req, res) => {
  const { repoPath, message, options = {} } = req.body;

  if (!repoPath || !message) {
    return res.status(400).json({
      success: false,
      error: 'repoPath and message are required'
    });
  }

  const result = await capabilities.gitCommitAndPush(repoPath, message, options);
  
  res.json(result);
}));

// ==========================================
// ROUTES WEB & RECHERCHE
// ==========================================

/**
 * POST /api/enhancements/web/search
 * Search web using DuckDuckGo
 */
router.post('/web/search', asyncHandler(async (req, res) => {
  const { query, options = {} } = req.body;

  if (!query) {
    return res.status(400).json({
      success: false,
      error: 'query is required'
    });
  }

  const result = await capabilities.searchWeb(query, options);
  
  res.json(result);
}));

/**
 * POST /api/enhancements/web/fetch-page
 * Fetch and parse web page
 */
router.post('/web/fetch-page', asyncHandler(async (req, res) => {
  const { url, options = {} } = req.body;

  if (!url) {
    return res.status(400).json({
      success: false,
      error: 'url is required'
    });
  }

  const result = await capabilities.fetchWebPage(url, options);
  
  res.json(result);
}));

/**
 * POST /api/enhancements/web/search-news
 * Search news articles
 */
router.post('/web/search-news', asyncHandler(async (req, res) => {
  const { query, language = 'fr' } = req.body;

  if (!query) {
    return res.status(400).json({
      success: false,
      error: 'query is required'
    });
  }

  const result = await capabilities.searchNews(query, language);
  
  res.json(result);
}));

// ==========================================
// ROUTES MEDIA GENERATION (OpenAI)
// ==========================================

/**
 * POST /api/enhancements/media/generate-image
 * Generate image using DALL-E
 */
router.post('/media/generate-image', asyncHandler(async (req, res) => {
  const { prompt, options = {} } = req.body;

  if (!prompt) {
    return res.status(400).json({
      success: false,
      error: 'prompt is required'
    });
  }

  if (!process.env.OPENAI_API_KEY) {
    return res.status(503).json({
      success: false,
      error: 'OPENAI_API_KEY not configured',
      message: 'Please configure OpenAI API key in .env file'
    });
  }

  const result = await capabilities.generateImage(prompt, options);
  
  res.json(result);
}));

/**
 * POST /api/enhancements/media/generate-audio
 * Generate audio using TTS
 */
router.post('/media/generate-audio', asyncHandler(async (req, res) => {
  const { text, options = {} } = req.body;

  if (!text) {
    return res.status(400).json({
      success: false,
      error: 'text is required'
    });
  }

  if (!process.env.OPENAI_API_KEY) {
    return res.status(503).json({
      success: false,
      error: 'OPENAI_API_KEY not configured',
      message: 'Please configure OpenAI API key in .env file'
    });
  }

  const result = await capabilities.generateAudio(text, options);
  
  // Si result contient un buffer, le convertir en base64
  if (result.buffer) {
    result.audioBase64 = result.buffer.toString('base64');
    delete result.buffer; // Enlever le buffer brut
  }
  
  res.json(result);
}));

// ==========================================
// ROUTE INFO & HEALTH CHECK
// ==========================================

/**
 * GET /api/enhancements/info
 * Get information about available enhancements
 */
router.get('/info', (req, res) => {
  res.json({
    success: true,
    version: '2.0.0',
    enhancements: {
      sandbox: {
        endpoints: [
          'POST /api/enhancements/sandbox/execute',
          'POST /api/enhancements/sandbox/execute-with-mount',
          'POST /api/enhancements/sandbox/ensure-image'
        ],
        description: 'Secure Docker-based code execution'
      },
      git: {
        endpoints: [
          'POST /api/enhancements/git/init',
          'POST /api/enhancements/git/clone',
          'POST /api/enhancements/git/commit',
          'POST /api/enhancements/git/push',
          'GET  /api/enhancements/git/status',
          'POST /api/enhancements/git/commit-and-push'
        ],
        description: 'Complete Git version control'
      },
      web: {
        endpoints: [
          'POST /api/enhancements/web/search',
          'POST /api/enhancements/web/fetch-page',
          'POST /api/enhancements/web/search-news'
        ],
        description: 'Web search and scraping'
      },
      media: {
        endpoints: [
          'POST /api/enhancements/media/generate-image',
          'POST /api/enhancements/media/generate-audio'
        ],
        description: 'AI-powered media generation (requires OPENAI_API_KEY)',
        available: !!process.env.OPENAI_API_KEY
      }
    },
    totalEndpoints: 13,
    authentication: 'Optional (currently disabled)',
    documentation: 'See /api/enhancements/info for details'
  });
});

/**
 * POST /api/enhancements/sandbox/execute-simple
 * Execute simple commands without Docker (faster but less isolated)
 */
router.post('/sandbox/execute-simple', asyncHandler(async (req, res) => {
  const { command, options = {} } = req.body;

  if (!command) {
    return res.status(400).json({
      success: false,
      error: 'Command is required'
    });
  }

  // Security: Only allow specific commands
  const allowedCommands = ['node', 'python3', 'bash', 'echo', 'ls', 'pwd', 'whoami', 'date', 'cat', 'head', 'tail'];
  const commandParts = command.split(' ');
  const baseCommand = commandParts[0];

  if (!allowedCommands.includes(baseCommand)) {
    return res.status(403).json({
      success: false,
      error: `Command '${baseCommand}' not allowed. Allowed: ${allowedCommands.join(', ')}`
    });
  }

  try {
    const timeout = options.timeout || 30000;
    const result = await execAsync(command, {
      timeout,
      maxBuffer: 1024 * 1024, // 1MB
      cwd: '/tmp'
    });

    res.json({
      success: true,
      stdout: result.stdout || '',
      stderr: result.stderr || '',
      execution: {
        timeout,
        direct: true
      }
    });
  } catch (error) {
    res.json({
      success: false,
      stdout: error.stdout || '',
      stderr: error.stderr || error.message,
      error: error.message
    });
  }
}));

// ==========================================
// ERROR HANDLER
// ==========================================

router.use((err, req, res, next) => {
  console.error('Enhancement route error:', err);
  
  res.status(500).json({
    success: false,
    error: err.message || 'Internal server error',
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
  });
});

export default router;
