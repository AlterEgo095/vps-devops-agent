import express from 'express';
import { capabilities } from '../services/capabilities.js';

const router = express.Router();

/**
 * @swagger
 * /api/capabilities/read-multiple:
 *   post:
 *     summary: Lire plusieurs fichiers d'un coup avec pattern matching
 *     tags: [Capabilities]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               filePaths:
 *                 type: array
 *                 items:
 *                   type: string
 *                 example: ["package.json", "README.md"]
 *               options:
 *                 type: object
 *                 properties:
 *                   patterns:
 *                     type: array
 *                     items:
 *                       type: string
 *                     example: ["glob.js", "src patterns"]
 *                   continueOnError:
 *                     type: boolean
 *                     default: true
 *     responses:
 *       200:
 *         description: Fichiers lus avec succès
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 files:
 *                   type: array
 *                   items:
 *                     type: object
 *                 totalFiles:
 *                   type: integer
 *                 successCount:
 *                   type: integer
 *                 errorCount:
 *                   type: integer
 */
router.post('/read-multiple', async (req, res) => {
  try {
    const { filePaths = [], options = {} } = req.body;

    // Validation
    if (!Array.isArray(filePaths)) {
      return res.status(400).json({
        success: false,
        error: 'filePaths must be an array'
      });
    }

    const result = await capabilities.readMultipleFiles(filePaths, options);
    
    res.json(result);
  } catch (error) {
    console.error('Error in readMultipleFiles:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @swagger
 * /api/capabilities/search:
 *   post:
 *     summary: Rechercher un pattern dans les fichiers (grep-like)
 *     tags: [Capabilities]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - pattern
 *             properties:
 *               pattern:
 *                 type: string
 *                 example: "TODO"
 *               options:
 *                 type: object
 *                 properties:
 *                   directory:
 *                     type: string
 *                     default: "."
 *                   fileTypes:
 *                     type: array
 *                     items:
 *                       type: string
 *                     example: [".js", ".ts"]
 *                   caseSensitive:
 *                     type: boolean
 *                     default: true
 *                   contextLines:
 *                     type: integer
 *                     default: 3
 *                   maxResults:
 *                     type: integer
 *                     default: 100
 *     responses:
 *       200:
 *         description: Recherche terminée
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 matches:
 *                   type: array
 *                 totalMatches:
 *                   type: integer
 *                 filesSearched:
 *                   type: integer
 */
router.post('/search', async (req, res) => {
  try {
    const { pattern, options = {} } = req.body;

    // Validation
    if (!pattern) {
      return res.status(400).json({
        success: false,
        error: 'pattern is required'
      });
    }

    if (typeof pattern !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'pattern must be a string'
      });
    }

    const result = await capabilities.searchInFiles(pattern, options);
    
    res.json(result);
  } catch (error) {
    console.error('Error in searchInFiles:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @swagger
 * /api/capabilities/analyze:
 *   post:
 *     summary: Analyser la structure complète d'un projet
 *     tags: [Capabilities]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               directory:
 *                 type: string
 *                 default: "."
 *               options:
 *                 type: object
 *                 properties:
 *                   deep:
 *                     type: boolean
 *                     default: true
 *                   includeDependencies:
 *                     type: boolean
 *                     default: true
 *                   includeTree:
 *                     type: boolean
 *                     default: false
 *                   maxDepth:
 *                     type: integer
 *                     default: 3
 *     responses:
 *       200:
 *         description: Analyse terminée
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 projectType:
 *                   type: string
 *                 languages:
 *                   type: array
 *                 frameworks:
 *                   type: array
 *                 dependencies:
 *                   type: object
 *                 structure:
 *                   type: object
 *                 statistics:
 *                   type: object
 */
router.post('/analyze', async (req, res) => {
  try {
    const { directory = '.', options = {} } = req.body;

    // Validation
    if (typeof directory !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'directory must be a string'
      });
    }

    const result = await capabilities.analyzeCodebase(directory, options);
    
    res.json(result);
  } catch (error) {
    console.error('Error in analyzeCodebase:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @swagger
 * /api/capabilities/edit:
 *   post:
 *     summary: Éditer un fichier avec backup automatique et validation syntaxe
 *     tags: [Capabilities]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - filePath
 *               - edits
 *             properties:
 *               filePath:
 *                 type: string
 *                 example: "src/index.js"
 *               edits:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     search:
 *                       type: string
 *                     replace:
 *                       type: string
 *                     lineNumber:
 *                       type: integer
 *                     action:
 *                       type: string
 *                       enum: [replace, insert-before, insert-after, delete]
 *               options:
 *                 type: object
 *                 properties:
 *                   createBackup:
 *                     type: boolean
 *                     default: true
 *                   validateSyntax:
 *                     type: boolean
 *                     default: true
 *                   atomicEdit:
 *                     type: boolean
 *                     default: true
 *                   dryRun:
 *                     type: boolean
 *                     default: false
 *     responses:
 *       200:
 *         description: Édition réussie
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 editsApplied:
 *                   type: integer
 *                 backupPath:
 *                   type: string
 *                 diff:
 *                   type: object
 */
router.post('/edit', async (req, res) => {
  try {
    const { filePath, edits, options = {} } = req.body;

    // Validation
    if (!filePath) {
      return res.status(400).json({
        success: false,
        error: 'filePath is required'
      });
    }

    if (!Array.isArray(edits) || edits.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'edits must be a non-empty array'
      });
    }

    const result = await capabilities.editFile(filePath, edits, options);
    
    res.json(result);
  } catch (error) {
    console.error('Error in editFile:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @swagger
 * /api/capabilities/list:
 *   get:
 *     summary: Lister toutes les capacités disponibles
 *     tags: [Capabilities]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Liste des capacités
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 capabilities:
 *                   type: array
 */
router.get('/list', async (req, res) => {
  try {
    const capabilitiesList = [
      {
        name: 'readMultipleFiles',
        category: 'File Management',
        description: 'Lire plusieurs fichiers d\'un coup avec pattern matching',
        endpoint: '/api/capabilities/read-multiple',
        sprint: 1
      },
      {
        name: 'searchInFiles',
        category: 'Search',
        description: 'Recherche grep-like dans fichiers avec contexte',
        endpoint: '/api/capabilities/search',
        sprint: 1
      },
      {
        name: 'analyzeCodebase',
        category: 'Analysis',
        description: 'Analyse complète d\'un projet (type, frameworks, dépendances)',
        endpoint: '/api/capabilities/analyze',
        sprint: 1
      },
      {
        name: 'editFile',
        category: 'File Management',
        description: 'Édition multi-zone avec backup et validation syntaxe',
        endpoint: '/api/capabilities/edit',
        sprint: 1
      },
      {
        name: 'createFile',
        category: 'File Management',
        description: 'Créer un fichier',
        endpoint: '/api/agent/execute',
        sprint: 0
      },
      {
        name: 'readFile',
        category: 'File Management',
        description: 'Lire un fichier',
        endpoint: '/api/agent/execute',
        sprint: 0
      },
      {
        name: 'listDirectory',
        category: 'File Management',
        description: 'Lister un répertoire',
        endpoint: '/api/agent/execute',
        sprint: 0
      },
      {
        name: 'dockerCompose',
        category: 'Docker',
        description: 'Exécuter docker compose',
        endpoint: '/api/agent/execute',
        sprint: 0
      },
      {
        name: 'npmInstall',
        category: 'Package Management',
        description: 'Installer dépendances npm',
        endpoint: '/api/agent/execute',
        sprint: 0
      }
    ];

    res.json({
      success: true,
      capabilities: capabilitiesList,
      total: capabilitiesList.length,
      sprint1Count: capabilitiesList.filter(c => c.sprint === 1).length
    });
  } catch (error) {
    console.error('Error in list capabilities:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

export default router;
