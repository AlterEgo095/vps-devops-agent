import express from 'express';
import dockerManager from '../services/docker-manager.js';
import { cacheMiddleware } from '../middleware/cache.js';

const router = express.Router();

// Middleware d'authentification (utilisé sur toutes les routes)
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Token manquant' });
  }

  // Vérification JWT (à adapter selon votre configuration)
  try {
    // req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch (err) {
    return res.status(403).json({ error: 'Token invalide' });
  }
};

// Appliquer l'authentification sur toutes les routes
router.use(authenticateToken);

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
    console.error('Erreur listContainers:', error);
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
    console.error('Erreur getContainerDetails:', error);
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
    console.error('Erreur getContainerStats:', error);
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
    console.error('Erreur getContainerLogs:', error);
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
    console.error('Erreur createContainer:', error);
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
    console.error('Erreur startContainer:', error);
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
    console.error('Erreur stopContainer:', error);
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
    console.error('Erreur restartContainer:', error);
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
    console.error('Erreur removeContainer:', error);
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
    console.error('Erreur listImages:', error);
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
    console.error('Erreur pullImage:', error);
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
    console.error('Erreur removeImage:', error);
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
    console.error('Erreur generateDockerfile:', error);
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
    console.error('Erreur generateDockerCompose:', error);
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
    console.error('Erreur Docker health:', error);
    res.status(500).json({
      success: false,
      error: 'Docker non accessible: ' + error.message
    });
  }
});

export default router;
