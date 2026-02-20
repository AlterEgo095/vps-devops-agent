import crypto from 'crypto';
import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const dbPath = join(__dirname, '../../data/devops-agent.db');

/**
 * WebhookHandler - Gestion des webhooks GitHub et GitLab
 * Valide les signatures, parse les payloads, déclenche les pipelines
 */
class WebhookHandler {
  constructor() {
    this.db = new Database(dbPath);
  }

  /**
   * Valider signature GitHub (HMAC SHA256)
   */
  validateGitHubSignature(payload, signature, secret) {
    if (!signature) return false;
    
    const hmac = crypto.createHmac('sha256', secret);
    const digest = 'sha256=' + hmac.update(payload).digest('hex');
    
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(digest)
    );
  }

  /**
   * Valider token GitLab
   */
  validateGitLabToken(token, expectedToken) {
    if (!token || !expectedToken) return false;
    return crypto.timingSafeEqual(
      Buffer.from(token),
      Buffer.from(expectedToken)
    );
  }

  /**
   * Parser webhook GitHub
   */
  parseGitHubWebhook(payload, headers) {
    const event = headers['x-github-event'];
    const delivery = headers['x-github-delivery'];

    // On traite uniquement les push events
    if (event !== 'push') {
      return {
        valid: false,
        reason: 'Not a push event'
      };
    }

    return {
      valid: true,
      provider: 'github',
      event,
      delivery,
      data: {
        repository: payload.repository?.full_name,
        branch: payload.ref?.replace('refs/heads/', ''),
        commit: {
          id: payload.head_commit?.id,
          message: payload.head_commit?.message,
          author: payload.head_commit?.author?.name,
          timestamp: payload.head_commit?.timestamp,
          url: payload.head_commit?.url
        },
        pusher: payload.pusher?.name,
        compare: payload.compare
      }
    };
  }

  /**
   * Parser webhook GitLab
   */
  parseGitLabWebhook(payload, headers) {
    const event = headers['x-gitlab-event'];
    
    // On traite uniquement les Push Hook
    if (event !== 'Push Hook') {
      return {
        valid: false,
        reason: 'Not a push hook'
      };
    }

    return {
      valid: true,
      provider: 'gitlab',
      event,
      data: {
        repository: payload.project?.path_with_namespace,
        branch: payload.ref?.replace('refs/heads/', ''),
        commit: {
          id: payload.checkout_sha,
          message: payload.commits?.[0]?.message,
          author: payload.user_name,
          timestamp: payload.commits?.[0]?.timestamp,
          url: payload.commits?.[0]?.url
        },
        pusher: payload.user_name,
        compare: payload.project?.web_url + '/compare/' + payload.before + '...' + payload.after
      }
    };
  }

  /**
   * Obtenir la configuration webhook d'un projet
   */
  getProjectWebhookConfig(projectId) {
    try {
      const stmt = this.db.prepare(`
        SELECT * FROM webhook_configs 
        WHERE project_id = ? AND enabled = 1
      `);
      return stmt.get(projectId);
    } catch (error) {
      console.error('Error getting webhook config:', error);
      return null;
    }
  }

  /**
   * Sauvegarder un webhook reçu dans la BDD
   */
  saveWebhookEvent(data) {
    try {
      const stmt = this.db.prepare(`
        INSERT INTO webhook_events (
          provider, event_type, repository, branch, 
          commit_id, commit_message, author, 
          payload, received_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      `);

      const result = stmt.run(
        data.provider,
        data.event,
        data.data.repository,
        data.data.branch,
        data.data.commit.id,
        data.data.commit.message,
        data.data.commit.author,
        JSON.stringify(data)
      );

      return { success: true, id: result.lastInsertRowid };
    } catch (error) {
      console.error('Error saving webhook event:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Vérifier si une branche doit déclencher un déploiement
   */
  shouldTriggerDeployment(config, branch) {
    if (!config || !config.branches_filter) return false;
    
    const branches = config.branches_filter.split(',').map(b => b.trim());
    
    // Si * = toutes les branches
    if (branches.includes('*')) return true;
    
    // Vérifier si la branche correspond
    return branches.includes(branch);
  }

  /**
   * Process webhook complet
   *
   * [SECURITY] P1.6 — Validation de la signature HMAC AVANT tout traitement.
   *
   * GitHub : HMAC-SHA256 envoyé dans le header 'x-hub-signature-256'.
   *          La validation est effectuée avec le webhook_secret stocké en base.
   *          Si le secret est configuré et que la signature est invalide/absente,
   *          le webhook est REJETÉ avec un 401 (sans révéler pourquoi).
   *
   * GitLab : Token en clair dans le header 'x-gitlab-token'.
   *          Comparaison via timingSafeEqual pour éviter les timing attacks.
   *
   * Si aucun secret n'est configuré pour le projet, le webhook est accepté
   * (comportement permissif — à documenter et à durcir en production).
   */
  async processWebhook(provider, payload, headers, projectId) {
    try {
      // 0. Récupérer la config webhook du projet EN PREMIER pour la validation
      const config = this.getProjectWebhookConfig(projectId);

      // [SECURITY] P1.6 — Validation de signature si un secret est configuré
      if (config && config.webhook_secret) {
        if (provider === 'github') {
          const signature = headers['x-hub-signature-256'];
          const isValid = this.validateGitHubSignature(payload, signature, config.webhook_secret);
          if (!isValid) {
            console.warn(`[SECURITY] Invalid GitHub webhook signature for project ${projectId}`);
            // Réponse générique pour ne pas révéler si le secret est correct
            return { success: false, error: 'Webhook validation failed' };
          }
        } else if (provider === 'gitlab') {
          const token = headers['x-gitlab-token'];
          const isValid = this.validateGitLabToken(token, config.webhook_secret);
          if (!isValid) {
            console.warn(`[SECURITY] Invalid GitLab webhook token for project ${projectId}`);
            return { success: false, error: 'Webhook validation failed' };
          }
        }
      } else if (config && !config.webhook_secret) {
        // Secret non configuré : on accepte mais on avertit dans les logs
        console.warn(`[SECURITY] Webhook for project ${projectId} has no secret configured. Consider adding one.`);
      }

      // 1. Parser le webhook selon le provider
      let parsed;
      if (provider === 'github') {
        // Parser avec le payload déjà parsé (req.body) converti en objet
        try {
          parsed = this.parseGitHubWebhook(JSON.parse(payload), headers);
        } catch {
          parsed = this.parseGitHubWebhook(payload, headers);
        }
      } else if (provider === 'gitlab') {
        try {
          parsed = this.parseGitLabWebhook(JSON.parse(payload), headers);
        } catch {
          parsed = this.parseGitLabWebhook(payload, headers);
        }
      } else {
        return { success: false, error: 'Unknown provider' };
      }

      if (!parsed.valid) {
        return { success: false, error: parsed.reason };
      }

      // 2. Sauvegarder l'événement
      const saved = this.saveWebhookEvent(parsed);
      if (!saved.success) {
        return { success: false, error: 'Failed to save event' };
      }

      // 3. Pas de config = webhook enregistré mais pas de déploiement
      if (!config) {
        return {
          success: true,
          message: 'Webhook received but no config found',
          eventId: saved.id
        };
      }

      // 4. Vérifier si on doit déclencher un déploiement
      const shouldDeploy = this.shouldTriggerDeployment(config, parsed.data.branch);

      return {
        success: true,
        eventId: saved.id,
        shouldDeploy,
        data: parsed.data
      };

    } catch (error) {
      console.error('Error processing webhook:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Obtenir l'historique des webhooks
   */
  getWebhookHistory(filters = {}, limit = 50) {
    try {
      let query = 'SELECT * FROM webhook_events WHERE 1=1';
      const params = [];

      if (filters.provider) {
        query += ' AND provider = ?';
        params.push(filters.provider);
      }

      if (filters.repository) {
        query += ' AND repository = ?';
        params.push(filters.repository);
      }

      if (filters.branch) {
        query += ' AND branch = ?';
        params.push(filters.branch);
      }

      query += ' ORDER BY received_at DESC LIMIT ?';
      params.push(limit);

      const stmt = this.db.prepare(query);
      return stmt.all(...params);
    } catch (error) {
      console.error('Error getting webhook history:', error);
      return [];
    }
  }
}

export default new WebhookHandler();
