import express from 'express';
import dockerManager from '../services/docker-manager.js';
import { cacheMiddleware } from '../middleware/cache.js';
import { authenticateToken } from '../middleware/auth.js';
import logger from '../config/logger.js';

const router = express.Router();

// ============================================================
// [SECURITY] P0 — Auth JWT réelle sur TOUTES les routes Docker
// Utilise le middleware centralisé auth.js (jwt.verify validé)
// Suppression du faux middleware qui laissait passer tout le monde
// ============================================================
router.use(authenticateToken);

// Middleware d'audit — log chaque action Docker avec l'utilisateur
router.use((req, res, next) => {
  logger.info(`[DOCKER] ${req.method} ${req.path}`, {
    user: req.user?.username || 'unknown',
    ip: req.ip,
    action: `docker:${req.method.toLowerCase()}:${req.path}`
  });
  next();
});

// ==========================================
// ROUTES GESTION DES CONTENEURS
// ==========================================

/**
 * GET /api/docker/containers
 * Liste tous les conteneurs (running + stopped)
 * Cache: 5s (docker change rapidement mais pas à chaque seconde)
 */
router.get('/containers', cacheMiddleware(5), async (req, res) => {
  try {
    const all = req.query.all !== 'false'; // Par défaut true
    const containers = await dockerManager.listContainers(all);
    res.json({
      success: true,
      count: containers.length,
      containers
    });
  } catch (error) {
    logger.error('Erreur listContainers:', { error: error.message });
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/docker/containers/:id
 * Détails complets d'un conteneur
 */
router.get('/containers/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const details = await dockerManager.getContainerDetails(id);
    res.json({
      success: true,
      container: details
    });
  } catch (error) {
    logger.error('Erreur getContainerDetails:', { error: error.message });
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/docker/containers/:id/stats
 * Statistiques temps réel (CPU, RAM, Network)
 */
router.get('/containers/:id/stats', async (req, res) => {
  try {
    const { id } = req.params;
    const stats = await dockerManager.getContainerStats(id);
    res.json({
      success: true,
      stats
    });
  } catch (error) {
    logger.error('Erreur getContainerStats:', { error: error.message });
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/docker/containers/:id/logs
 * Logs d'un conteneur
 */
router.get('/containers/:id/logs', async (req, res) => {
  try {
    const { id } = req.params;
    const tail = parseInt(req.query.tail) || 100;
    const logs = await dockerManager.getContainerLogs(id, tail);
    res.json({
      success: true,
      logs
    });
  } catch (error) {
    logger.error('Erreur getContainerLogs:', { error: error.message });
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/docker/containers
 * Créer un nouveau conteneur
 * Body: {
 *   image: 'nginx:latest',
 *   name: 'my-nginx',
 *   ports: { '80/tcp': 8080 },
 *   env: ['KEY=value'],
 *   volumes: ['/host:/container']
 * }
 */
router.post('/containers', async (req, res) => {
  try {
    const options = req.body;
    
    // Validation basique
    if (!options.image) {
      return res.status(400).json({
        success: false,
        error: 'Image Docker requise'
      });
    }

    const container = await dockerManager.createContainer(options);
    res.status(201).json({
      success: true,
      message: 'Conteneur créé avec succès',
      container: {
        id: container.id,
        name: options.name || 'auto-generated'
      }
    });
  } catch (error) {
    logger.error('Erreur createContainer:', { error: error.message });
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/docker/containers/:id/start
 * Démarrer un conteneur
 */
router.post('/containers/:id/start', async (req, res) => {
  try {
    const { id } = req.params;
    await dockerManager.startContainer(id);
    res.json({
      success: true,
      message: 'Conteneur démarré'
    });
  } catch (error) {
    logger.error('Erreur startContainer:', { error: error.message });
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/docker/containers/:id/stop
 * Arrêter un conteneur
 */
router.post('/containers/:id/stop', async (req, res) => {
  try {
    const { id } = req.params;
    const timeout = parseInt(req.body.timeout) || 10;
    await dockerManager.stopContainer(id, timeout);
    res.json({
      success: true,
      message: 'Conteneur arrêté'
    });
  } catch (error) {
    logger.error('Erreur stopContainer:', { error: error.message });
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/docker/containers/:id/restart
 * Redémarrer un conteneur
 */
router.post('/containers/:id/restart', async (req, res) => {
  try {
    const { id } = req.params;
    await dockerManager.restartContainer(id);
    res.json({
      success: true,
      message: 'Conteneur redémarré'
    });
  } catch (error) {
    logger.error('Erreur restartContainer:', { error: error.message });
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * DELETE /api/docker/containers/:id
 * Supprimer un conteneur
 */
router.delete('/containers/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const force = req.query.force === 'true';
    await dockerManager.removeContainer(id, force);
    res.json({
      success: true,
      message: 'Conteneur supprimé'
    });
  } catch (error) {
    logger.error('Erreur removeContainer:', { error: error.message });
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ==========================================
// ROUTES GESTION DES IMAGES
// ==========================================

/**
 * GET /api/docker/images
 * Liste toutes les images Docker
 */
router.get('/images', async (req, res) => {
  try {
    const images = await dockerManager.listImages();
    res.json({
      success: true,
      count: images.length,
      images
    });
  } catch (error) {
    logger.error('Erreur listImages:', { error: error.message });
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/docker/images/pull
 * Télécharger une image Docker
 * Body: { image: 'nginx:latest' }
 */
router.post('/images/pull', async (req, res) => {
  try {
    const { image } = req.body;
    
    if (!image) {
      return res.status(400).json({
        success: false,
        error: 'Nom d\'image requis'
      });
    }

    await dockerManager.pullImage(image);
    res.json({
      success: true,
      message: `Image ${image} téléchargée avec succès`
    });
  } catch (error) {
    logger.error('Erreur pullImage:', { error: error.message });
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * DELETE /api/docker/images/:id
 * Supprimer une image Docker
 */
router.delete('/images/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const force = req.query.force === 'true';
    await dockerManager.removeImage(id, force);
    res.json({
      success: true,
      message: 'Image supprimée'
    });
  } catch (error) {
    logger.error('Erreur removeImage:', { error: error.message });
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ==========================================
// ROUTES GÉNÉRATION DE CODE
// ==========================================

/**
 * POST /api/docker/generate/dockerfile
 * Générer un Dockerfile
 * Body: {
 *   projectType: 'nodejs' | 'python' | 'php' | 'nginx',
 *   options: { port: 3000, version: '18', ... }
 * }
 */
router.post('/generate/dockerfile', async (req, res) => {
  try {
    const { projectType, options } = req.body;
    
    if (!projectType) {
      return res.status(400).json({
        success: false,
        error: 'Type de projet requis (nodejs, python, php, nginx)'
      });
    }

    const dockerfile = dockerManager.generateDockerfile(projectType, options || {});
    res.json({
      success: true,
      dockerfile
    });
  } catch (error) {
    logger.error('Erreur generateDockerfile:', { error: error.message });
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/docker/generate/compose
 * Générer un docker-compose.yml
 * Body: {
 *   projectName: 'my-app',
 *   services: [
 *     { name: 'web', image: 'nginx:latest', ports: ['80:80'] },
 *     { name: 'db', image: 'postgres:14', environment: ['POSTGRES_PASSWORD=secret'] }
 *   ]
 * }
 */
router.post('/generate/compose', async (req, res) => {
  try {
    const { projectName, services } = req.body;
    
    if (!projectName || !services || !Array.isArray(services)) {
      return res.status(400).json({
        success: false,
        error: 'projectName et services[] requis'
      });
    }

    const compose = dockerManager.generateDockerCompose(projectName, services);
    res.json({
      success: true,
      compose
    });
  } catch (error) {
    logger.error('Erreur generateDockerCompose:', { error: error.message });
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ==========================================
// ROUTE DE TEST / HEALTH CHECK
// ==========================================

/**
 * GET /api/docker/health
 * Vérifier que Docker est accessible
 */
router.get('/health', async (req, res) => {
  try {
    const info = await dockerManager.docker.info();
    res.json({
      success: true,
      docker: {
        version: info.ServerVersion,
        containers: info.Containers,
        images: info.Images,
        running: info.ContainersRunning,
        paused: info.ContainersPaused,
        stopped: info.ContainersStopped
      }
    });
  } catch (error) {
    logger.error('Erreur Docker health:', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Docker non accessible: ' + error.message
    });
  }
});

export default router;
