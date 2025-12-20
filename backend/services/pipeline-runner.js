import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import deploymentManager from './deployment-manager.js';
import AlertManager from './alert-manager.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const dbPath = path.join(__dirname, '../../data/database.sqlite');

class PipelineRunner {
  constructor() {
    this.db = new Database(dbPath);
    this.runningJobs = new Map();
    this.jobQueue = [];
    this.isProcessing = false;
    this.maxConcurrentJobs = 3; // Maximum 3 déploiements simultanés
  }

  /**
   * Ajouter un job à la queue
   */
  addJob(job) {
    const jobId = this.createPipelineJob(job);
    this.jobQueue.push({
      id: jobId,
      ...job
    });
    
    // Démarrer le traitement si pas déjà en cours
    if (!this.isProcessing) {
      this.processQueue();
    }
    
    return jobId;
  }

  /**
   * Créer un enregistrement de pipeline job
   */
  createPipelineJob(data) {
    const stmt = this.db.prepare(`
      INSERT INTO pipeline_jobs (
        project_id, webhook_event_id, commit_sha, 
        branch, status, queued_at
      ) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `);
    
    const result = stmt.run(
      data.projectId,
      data.webhookEventId || null,
      data.commitSha,
      data.branch,
      'queued'
    );
    
    return result.lastInsertRowid;
  }

  /**
   * Mettre à jour le statut d'un job
   */
  updateJobStatus(jobId, status, deploymentId = null) {
    const now = new Date().toISOString();
    let stmt;
    
    if (status === 'running') {
      stmt = this.db.prepare(`
        UPDATE pipeline_jobs 
        SET status = ?, started_at = ?
        WHERE id = ?
      `);
      stmt.run(status, now, jobId);
    } else if (status === 'completed') {
      stmt = this.db.prepare(`
        UPDATE pipeline_jobs 
        SET status = ?, deployment_id = ?, completed_at = ?
        WHERE id = ?
      `);
      stmt.run(status, deploymentId, now, jobId);
    } else if (status === 'failed') {
      stmt = this.db.prepare(`
        UPDATE pipeline_jobs 
        SET status = ?, deployment_id = ?, completed_at = ?
        WHERE id = ?
      `);
      stmt.run(status, deploymentId, now, jobId);
    } else {
      stmt = this.db.prepare(`
        UPDATE pipeline_jobs 
        SET status = ?
        WHERE id = ?
      `);
      stmt.run(status, jobId);
    }
  }

  /**
   * Traiter la queue de jobs
   */
  async processQueue() {
    if (this.isProcessing) return;
    this.isProcessing = true;
    
    while (this.jobQueue.length > 0) {
      // Vérifier le nombre de jobs en cours
      if (this.runningJobs.size >= this.maxConcurrentJobs) {
        // Attendre qu'un job se termine
        await new Promise(resolve => setTimeout(resolve, 5000));
        continue;
      }
      
      // Prendre le prochain job
      const job = this.jobQueue.shift();
      if (!job) continue;
      
      // Démarrer le job
      this.runJob(job);
      
      // Petit délai pour éviter de surcharger
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    this.isProcessing = false;
  }

  /**
   * Exécuter un job de déploiement
   */
  async runJob(job) {
    const jobId = job.id;
    this.runningJobs.set(jobId, job);
    
    try {
      // Marquer comme en cours
      this.updateJobStatus(jobId, 'running');
      
      console.log(`[Pipeline] Starting deployment job #${jobId} for project #${job.projectId}`);
      
      // Lancer le déploiement
      const result = await deploymentManager.deploy({
        commitSha: job.commitSha,
        branch: job.branch,
        triggeredBy: 'pipeline',
        eventId: job.webhookEventId
      }, job.projectId);
      
      if (result.success) {
        // Déploiement réussi
        this.updateJobStatus(jobId, 'completed', result.deploymentId);
        console.log(`[Pipeline] Job #${jobId} completed successfully. Deployment #${result.deploymentId}`);
        
        // Envoyer notification de succès
        await this.sendNotification(job, 'success', result);
      } else {
        // Déploiement échoué
        this.updateJobStatus(jobId, 'failed', result.deploymentId);
        console.error(`[Pipeline] Job #${jobId} failed: ${result.error}`);
        
        // Envoyer notification d'échec
        await this.sendNotification(job, 'failed', result);
      }
      
    } catch (error) {
      this.updateJobStatus(jobId, 'failed');
      console.error(`[Pipeline] Job #${jobId} crashed:`, error);
      
      // Envoyer notification d'erreur
      await this.sendNotification(job, 'error', { error: error.message });
    } finally {
      this.runningJobs.delete(jobId);
    }
  }

  /**
   * Envoyer une notification après déploiement
   */
  async sendNotification(job, status, result) {
    try {
      const projectConfig = deploymentManager.getProjectConfig(job.projectId);
      
      let alertLevel, message;
      if (status === 'success') {
        alertLevel = 'info';
        message = `✅ Déploiement réussi pour ${projectConfig.name}\nCommit: ${job.commitSha}\nBranch: ${job.branch}`;
      } else {
        alertLevel = 'critical';
        message = `❌ Déploiement échoué pour ${projectConfig.name}\nCommit: ${job.commitSha}\nBranch: ${job.branch}\nErreur: ${result.error}`;
      }
      
      await AlertManager.sendAlert({
        type: 'deployment',
        level: alertLevel,
        message: message,
        metadata: {
          projectId: job.projectId,
          projectName: projectConfig.name,
          commitSha: job.commitSha,
          branch: job.branch,
          deploymentId: result.deploymentId
        }
      });
    } catch (error) {
      console.error('[Pipeline] Failed to send notification:', error);
    }
  }

  /**
   * Obtenir l'état de la queue
   */
  getQueueStatus() {
    return {
      queueLength: this.jobQueue.length,
      runningJobs: this.runningJobs.size,
      maxConcurrent: this.maxConcurrentJobs,
      jobs: Array.from(this.runningJobs.values()).map(job => ({
        id: job.id,
        projectId: job.projectId,
        commitSha: job.commitSha,
        branch: job.branch
      }))
    };
  }

  /**
   * Obtenir l'historique des jobs
   */
  getJobHistory(filters = {}, limit = 50) {
    let query = `
      SELECT 
        pj.*,
        d.status as deployment_status,
        d.error_message as deployment_error
      FROM pipeline_jobs pj
      LEFT JOIN deployments d ON d.id = pj.deployment_id
      WHERE 1=1
    `;
    
    const params = [];
    
    if (filters.projectId) {
      query += ` AND pj.project_id = ?`;
      params.push(filters.projectId);
    }
    
    if (filters.status) {
      query += ` AND pj.status = ?`;
      params.push(filters.status);
    }
    
    if (filters.branch) {
      query += ` AND pj.branch = ?`;
      params.push(filters.branch);
    }
    
    query += ` ORDER BY pj.queued_at DESC LIMIT ?`;
    params.push(limit);
    
    const stmt = this.db.prepare(query);
    return stmt.all(...params);
  }

  /**
   * Annuler un job en attente
   */
  cancelJob(jobId) {
    // Vérifier si le job est dans la queue
    const index = this.jobQueue.findIndex(job => job.id === jobId);
    if (index !== -1) {
      this.jobQueue.splice(index, 1);
      this.updateJobStatus(jobId, 'cancelled');
      return { success: true, message: 'Job removed from queue' };
    }
    
    // Vérifier si le job est en cours
    if (this.runningJobs.has(jobId)) {
      return { 
        success: false, 
        message: 'Cannot cancel running job. Use rollback instead.' 
      };
    }
    
    return { success: false, message: 'Job not found' };
  }

  /**
   * Obtenir les statistiques de pipeline
   */
  getStatistics(projectId = null) {
    let query = `
      SELECT 
        COUNT(*) as total_jobs,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as successful,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
        SUM(CASE WHEN status = 'queued' THEN 1 ELSE 0 END) as queued,
        SUM(CASE WHEN status = 'running' THEN 1 ELSE 0 END) as running,
        AVG(
          CASE 
            WHEN completed_at IS NOT NULL AND started_at IS NOT NULL 
            THEN (julianday(completed_at) - julianday(started_at)) * 86400
            ELSE NULL 
          END
        ) as avg_duration_seconds
      FROM pipeline_jobs
    `;
    
    if (projectId) {
      query += ` WHERE project_id = ?`;
      const stmt = this.db.prepare(query);
      return stmt.get(projectId);
    } else {
      const stmt = this.db.prepare(query);
      return stmt.get();
    }
  }

  /**
   * Nettoyer les anciens jobs
   */
  cleanOldJobs(daysToKeep = 30) {
    const stmt = this.db.prepare(`
      DELETE FROM pipeline_jobs
      WHERE completed_at < datetime('now', '-' || ? || ' days')
      AND status IN ('completed', 'failed', 'cancelled')
    `);
    
    const result = stmt.run(daysToKeep);
    console.log(`[Pipeline] Cleaned ${result.changes} old jobs`);
    return result.changes;
  }
}

export default new PipelineRunner();
