import express from 'express';
import webhookHandler from '../services/webhook-handler.js';
import deploymentManager from '../services/deployment-manager.js';
import pipelineRunner from '../services/pipeline-runner.js';
import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
// [SECURITY] P1.4 — Import du middleware d'authentification JWT
import { authenticateToken } from '../middleware/auth.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const router = express.Router();

const dbPath = path.join(__dirname, '../../data/database.sqlite');
const db = new Database(dbPath);

// ============================================================
// [SECURITY] P1.4 — PROTECTION GLOBALE DES ROUTES CI/CD
//
// TOUTES les routes de ce router nécessitent un JWT valide,
// À L'EXCEPTION des endpoints webhook (GitHub/GitLab) qui sont
// appelés par des services externes et validés par signature HMAC.
// Ces routes sont déclarées APRÈS ce middleware global et
// utilisent leur propre validation de signature (P1.6).
// ============================================================
router.use(authenticateToken);

// ============================================
// PROJECTS MANAGEMENT
// ============================================

// GET /api/cicd/projects - Liste tous les projets
router.get('/projects', (req, res) => {
  try {
    const stmt = db.prepare(`
      SELECT 
        p.*,
        (SELECT COUNT(*) FROM deployments WHERE project_id = p.id) as deployment_count,
        (SELECT COUNT(*) FROM deployments WHERE project_id = p.id AND status = 'success') as success_count
      FROM projects p
      ORDER BY p.created_at DESC
    `);
    const projects = stmt.all();
    res.json({ success: true, projects });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/cicd/projects/:id - Détails d'un projet
router.get('/projects/:id', (req, res) => {
  try {
    const stmt = db.prepare('SELECT * FROM projects WHERE id = ?');
    const project = stmt.get(req.params.id);
    
    if (!project) {
      return res.status(404).json({ success: false, error: 'Project not found' });
    }
    
    // Récupérer les configs webhook
    const webhookStmt = db.prepare('SELECT * FROM webhook_configs WHERE project_id = ?');
    const webhooks = webhookStmt.all(req.params.id);
    
    res.json({ success: true, project: { ...project, webhooks } });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/cicd/projects - Créer un nouveau projet
router.post('/projects', (req, res) => {
  try {
    const { name, repo_url, branch_filter, deployment_type, build_command, test_command, start_command, health_check_url } = req.body;
    
    const stmt = db.prepare(`
      INSERT INTO projects (name, repo_url, branch_filter, deployment_type, build_command, test_command, start_command, health_check_url)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    const result = stmt.run(
      name,
      repo_url,
      branch_filter || 'main',
      deployment_type || 'pm2',
      build_command || null,
      test_command || null,
      start_command || 'server.js',
      health_check_url || null
    );
    
    res.json({ success: true, projectId: result.lastInsertRowid });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// PUT /api/cicd/projects/:id - Mettre à jour un projet
router.put('/projects/:id', (req, res) => {
  try {
    const { name, repo_url, branch_filter, deployment_type, build_command, test_command, start_command, health_check_url, enabled } = req.body;
    
    const stmt = db.prepare(`
      UPDATE projects 
      SET name = ?, repo_url = ?, branch_filter = ?, deployment_type = ?, 
          build_command = ?, test_command = ?, start_command = ?, 
          health_check_url = ?, enabled = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `);
    
    stmt.run(
      name,
      repo_url,
      branch_filter,
      deployment_type,
      build_command,
      test_command,
      start_command,
      health_check_url,
      enabled,
      req.params.id
    );
    
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// DELETE /api/cicd/projects/:id - Supprimer un projet
router.delete('/projects/:id', (req, res) => {
  try {
    const stmt = db.prepare('DELETE FROM projects WHERE id = ?');
    stmt.run(req.params.id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// WEBHOOK CONFIGURATION
// ============================================

// POST /api/cicd/webhooks/config - Configurer un webhook
router.post('/webhooks/config', (req, res) => {
  try {
    const { project_id, provider, webhook_secret } = req.body;
    
    const stmt = db.prepare(`
      INSERT INTO webhook_configs (project_id, provider, webhook_secret)
      VALUES (?, ?, ?)
    `);
    
    const result = stmt.run(project_id, provider, webhook_secret);
    res.json({ success: true, webhookId: result.lastInsertRowid });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// DELETE /api/cicd/webhooks/config/:id - Supprimer une config webhook
router.delete('/webhooks/config/:id', (req, res) => {
  try {
    const stmt = db.prepare('DELETE FROM webhook_configs WHERE id = ?');
    stmt.run(req.params.id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================
// WEBHOOK ENDPOINTS (GitHub & GitLab) — ROUTER PUBLIC SÉPARÉ
// [SECURITY] P1.4 — Ces routes ne nécessitent PAS de JWT car
// elles sont appelées par GitHub/GitLab. Elles sont montées sur
// un router distinct (webhookRouter) sans authenticateToken.
// La sécurité est assurée par la validation de signature HMAC
// implémentée dans processWebhook() (voir P1.6).
// ============================================================
export const webhookRouter = express.Router();

// POST /api/cicd/webhooks/github/:projectId - Recevoir webhook GitHub
webhookRouter.post('/github/:projectId', async (req, res) => {
  try {
    const projectId = parseInt(req.params.projectId);
    const payload = JSON.stringify(req.body);

    // [SECURITY] P1.6 — La validation de signature est gérée dans processWebhook()
    const result = await webhookHandler.processWebhook(
      'github',
      payload,
      req.headers,
      projectId
    );

    if (!result.success) {
      return res.status(400).json(result);
    }

    // Si doit déclencher un déploiement
    if (result.shouldDeploy) {
      const jobId = pipelineRunner.addJob({
        projectId: projectId,
        webhookEventId: result.eventId,
        commitSha: result.data.commitSha,
        branch: result.data.branch
      });

      return res.json({
        success: true,
        message: 'Webhook received and deployment queued',
        eventId: result.eventId,
        jobId: jobId
      });
    }

    res.json({
      success: true,
      message: 'Webhook received but deployment not triggered',
      eventId: result.eventId,
      reason: 'Branch filter did not match'
    });

  } catch (error) {
    console.error('[Webhook] GitHub error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/cicd/webhooks/gitlab/:projectId - Recevoir webhook GitLab
webhookRouter.post('/gitlab/:projectId', async (req, res) => {
  try {
    const projectId = parseInt(req.params.projectId);
    const payload = JSON.stringify(req.body);

    // [SECURITY] P1.6 — La validation de token GitLab est gérée dans processWebhook()
    const result = await webhookHandler.processWebhook(
      'gitlab',
      payload,
      req.headers,
      projectId
    );

    if (!result.success) {
      return res.status(400).json(result);
    }

    // Si doit déclencher un déploiement
    if (result.shouldDeploy) {
      const jobId = pipelineRunner.addJob({
        projectId: projectId,
        webhookEventId: result.eventId,
        commitSha: result.data.commitSha,
        branch: result.data.branch
      });

      return res.json({
        success: true,
        message: 'Webhook received and deployment queued',
        eventId: result.eventId,
        jobId: jobId
      });
    }

    res.json({
      success: true,
      message: 'Webhook received but deployment not triggered',
      eventId: result.eventId,
      reason: 'Branch filter did not match'
    });

  } catch (error) {
    console.error('[Webhook] GitLab error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/cicd/webhooks/history - Historique des webhooks
router.get('/webhooks/history', (req, res) => {
  try {
    const { projectId, limit = 50 } = req.query;
    
    const filters = {};
    if (projectId) filters.projectId = parseInt(projectId);
    
    const history = webhookHandler.getWebhookHistory(filters, parseInt(limit));
    res.json({ success: true, history });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// DEPLOYMENTS
// ============================================

// POST /api/cicd/deployments/trigger - Déclencher un déploiement manuel
router.post('/deployments/trigger', async (req, res) => {
  try {
    const { projectId, commitSha, branch } = req.body;
    
    const jobId = pipelineRunner.addJob({
      projectId: parseInt(projectId),
      commitSha,
      branch,
      triggeredBy: 'manual'
    });
    
    res.json({ 
      success: true, 
      message: 'Deployment queued',
      jobId 
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/cicd/deployments/:id/rollback - Rollback un déploiement
router.post('/deployments/:projectId/rollback', async (req, res) => {
  try {
    const projectId = parseInt(req.params.projectId);
    const { targetDeploymentId } = req.body;
    
    const result = await deploymentManager.rollback(projectId, targetDeploymentId);
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/cicd/deployments/history - Historique des déploiements
router.get('/deployments/history', (req, res) => {
  try {
    const { projectId, limit = 50 } = req.query;
    
    const history = deploymentManager.getDeploymentHistory(
      parseInt(projectId),
      parseInt(limit)
    );
    
    res.json({ success: true, history });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/cicd/deployments/:id/logs - Logs d'un déploiement
router.get('/deployments/:id/logs', (req, res) => {
  try {
    const logs = deploymentManager.getDeploymentLogs(parseInt(req.params.id));
    res.json({ success: true, logs });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// PIPELINE QUEUE & JOBS
// ============================================

// GET /api/cicd/pipeline/queue - État de la queue
router.get('/pipeline/queue', (req, res) => {
  try {
    const status = pipelineRunner.getQueueStatus();
    res.json({ success: true, ...status });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/cicd/pipeline/jobs - Historique des jobs
router.get('/pipeline/jobs', (req, res) => {
  try {
    const { projectId, status, branch, limit = 50 } = req.query;
    
    const filters = {};
    if (projectId) filters.projectId = parseInt(projectId);
    if (status) filters.status = status;
    if (branch) filters.branch = branch;
    
    const jobs = pipelineRunner.getJobHistory(filters, parseInt(limit));
    res.json({ success: true, jobs });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// DELETE /api/cicd/pipeline/jobs/:id/cancel - Annuler un job
router.delete('/pipeline/jobs/:id/cancel', (req, res) => {
  try {
    const result = pipelineRunner.cancelJob(parseInt(req.params.id));
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/cicd/pipeline/statistics - Statistiques de pipeline
router.get('/pipeline/statistics', (req, res) => {
  try {
    const { projectId } = req.query;
    
    const stats = pipelineRunner.getStatistics(
      projectId ? parseInt(projectId) : null
    );
    
    res.json({ success: true, statistics: stats });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
