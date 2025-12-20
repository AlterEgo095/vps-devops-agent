import express from 'express';
import { authenticateToken } from '../middleware/auth.js';
import { capabilities } from '../services/capabilities.js';
import { validateBody, validateParams, validateQuery } from '../middleware/validate.js';
import { dockerComposeSchema, deleteProjectQuerySchema, projectNameParamSchema } from '../middleware/validation-schemas.js';

const router = express.Router();

// Toutes les routes nécessitent l'authentification
router.use(authenticateToken);

/**
 * GET /api/projects
 * Lister tous les projets dans le workspace
 */
router.get('/', async (req, res) => {
  try {
    const result = await capabilities.listDirectory('.');
    
    res.json({
      success: true,
      projects: result.files.filter(f => f.isDirectory)
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/projects/:name
 * Obtenir les détails d'un projet
 */
router.get('/:name', async (req, res) => {
  try {
    const { name } = req.params;
    const result = await capabilities.listDirectory(name);
    
    res.json({
      success: true,
      name,
      files: result.files
    });
  } catch (error) {
    res.status(404).json({ error: 'Project not found' });
  }
});

/**
 * GET /api/projects/:name/files/*
 * Lire un fichier dans un projet
 */
router.get('/:name/files/*', async (req, res) => {
  try {
    const { name } = req.params;
    const filePath = req.params[0];
    const fullPath = `${name}/${filePath}`;
    
    const result = await capabilities.readFile(fullPath);
    
    res.json({
      success: true,
      path: fullPath,
      content: result.content
    });
  } catch (error) {
    res.status(404).json({ error: 'File not found' });
  }
});

/**
 * POST /api/projects/:name/docker/compose
 * Exécuter une commande docker compose
 */
router.post('/:name/docker/compose', validateParams(projectNameParamSchema), validateBody(dockerComposeSchema), async (req, res) => {
  try {
    const { name } = req.params;
    const { command } = req.body;
    
    if (!command) {
      return res.status(400).json({ error: 'Command is required' });
    }
    
    const result = await capabilities.dockerCompose(name, command);
    
    res.json({
      success: true,
      command,
      ...result
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/projects/:name/docker/logs/:container
 * Obtenir les logs d'un conteneur
 */
router.get('/:name/docker/logs/:container', async (req, res) => {
  try {
    const { container } = req.params;
    const { tail = 100 } = req.query;
    
    const result = await capabilities.dockerLogs(container, parseInt(tail));
    
    res.json({
      success: true,
      container,
      logs: result.logs
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * DELETE /api/projects/:name
 * Supprimer un projet
 */
router.delete('/:name', validateParams(projectNameParamSchema), validateQuery(deleteProjectQuerySchema), async (req, res) => {
  try {
    const { name } = req.params;
    const { confirm } = req.query;
    
    if (confirm !== 'yes') {
      return res.status(400).json({
        error: 'Confirmation required',
        message: 'Add ?confirm=yes to delete the project'
      });
    }
    
    const result = await capabilities.delete(name);
    
    res.json({
      success: true,
      message: `Project ${name} deleted`,
      ...result
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
