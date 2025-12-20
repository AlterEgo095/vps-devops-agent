import nodemailer from 'nodemailer';
import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const dbPath = join(__dirname, '../../data/devops-agent.db');

class AlertManager {
  constructor() {
    this.db = new Database(dbPath);
    this.transporter = null;
    this.alertHistory = new Map(); // Pour éviter spam
    this.cooldownPeriod = 300000; // 5 minutes en ms
  }

  /**
   * Initialiser le transporteur email
   */
  initEmailTransporter(config) {
    if (!config.enabled) return;

    this.transporter = nodemailer.createTransporter({
      host: config.smtp_host,
      port: config.smtp_port,
      secure: config.smtp_port === 465,
      auth: {
        user: config.smtp_user,
        pass: config.smtp_pass
      }
    });
  }

  /**
   * Envoyer une alerte
   */
  async sendAlert(alert) {
    const alertKey = `${alert.type}-${alert.level}`;
    const now = Date.now();

    // Vérifier cooldown pour éviter spam
    if (this.alertHistory.has(alertKey)) {
      const lastAlert = this.alertHistory.get(alertKey);
      if (now - lastAlert < this.cooldownPeriod) {
        return { sent: false, reason: 'cooldown' };
      }
    }

    // Récupérer la configuration
    const config = this.getAlertConfig();
    const results = [];

    // Envoyer par email si activé
    if (config.email_enabled && this.transporter) {
      try {
        await this.sendEmailAlert(alert, config);
        results.push({ channel: 'email', success: true });
      } catch (error) {
        console.error('Error sending email alert:', error);
        results.push({ channel: 'email', success: false, error: error.message });
      }
    }

    // Envoyer par Telegram si activé
    if (config.telegram_enabled && config.telegram_bot_token && config.telegram_chat_id) {
      try {
        await this.sendTelegramAlert(alert, config);
        results.push({ channel: 'telegram', success: true });
      } catch (error) {
        console.error('Error sending Telegram alert:', error);
        results.push({ channel: 'telegram', success: false, error: error.message });
      }
    }

    // Sauvegarder dans l'historique
    this.saveAlertToHistory(alert);
    this.alertHistory.set(alertKey, now);

    return { sent: true, results };
  }

  /**
   * Envoyer alerte par email
   */
  async sendEmailAlert(alert, config) {
    const subject = `[VPS DevOps] Alerte ${alert.level.toUpperCase()}: ${alert.type}`;
    const html = `
      <div style="font-family: Arial, sans-serif; padding: 20px; background: #f5f5f5;">
        <div style="background: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
          <h2 style="color: ${alert.level === 'critical' ? '#dc3545' : '#ffc107'};">
            ⚠️ Alerte ${alert.level.toUpperCase()}
          </h2>
          <p style="font-size: 16px; color: #333;">
            <strong>Type:</strong> ${alert.type}<br>
            <strong>Message:</strong> ${alert.message}<br>
            <strong>Valeur actuelle:</strong> ${alert.value}<br>
            <strong>Seuil:</strong> ${alert.threshold}<br>
            <strong>Serveur:</strong> ${config.server_name || 'VPS DevOps Agent'}<br>
            <strong>Date:</strong> ${new Date().toLocaleString('fr-FR')}
          </p>
          <hr style="border: 1px solid #eee; margin: 20px 0;">
          <p style="font-size: 14px; color: #666;">
            Cette alerte a été générée automatiquement par le système de monitoring.<br>
            Accédez au dashboard: <a href="https://devops.aenews.net">https://devops.aenews.net</a>
          </p>
        </div>
      </div>
    `;

    await this.transporter.sendMail({
      from: config.smtp_from || config.smtp_user,
      to: config.email_to,
      subject,
      html
    });
  }

  /**
   * Envoyer alerte par Telegram
   */
  async sendTelegramAlert(alert, config) {
    const emoji = alert.level === 'critical' ? '🔴' : '⚠️';
    const message = `
${emoji} *Alerte ${alert.level.toUpperCase()}*

*Type:* ${alert.type}
*Message:* ${alert.message}
*Valeur:* ${alert.value}
*Seuil:* ${alert.threshold}
*Serveur:* ${config.server_name || 'VPS DevOps Agent'}
*Date:* ${new Date().toLocaleString('fr-FR')}

[Accéder au dashboard](https://devops.aenews.net)
    `.trim();

    const url = `https://api.telegram.org/bot${config.telegram_bot_token}/sendMessage`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: config.telegram_chat_id,
        text: message,
        parse_mode: 'Markdown'
      })
    });

    if (!response.ok) {
      throw new Error(`Telegram API error: ${response.statusText}`);
    }
  }

  /**
   * Récupérer la configuration des alertes
   */
  getAlertConfig() {
    try {
      const row = this.db.prepare('SELECT * FROM alert_config WHERE id = 1').get();
      return row || this.getDefaultConfig();
    } catch (error) {
      return this.getDefaultConfig();
    }
  }

  /**
   * Sauvegarder la configuration des alertes
   */
  saveAlertConfig(config) {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO alert_config (
        id, email_enabled, email_to, smtp_host, smtp_port, smtp_user, smtp_pass, smtp_from,
        telegram_enabled, telegram_bot_token, telegram_chat_id,
        threshold_cpu, threshold_memory, threshold_disk,
        server_name
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      1,
      config.email_enabled ? 1 : 0,
      config.email_to,
      config.smtp_host,
      config.smtp_port,
      config.smtp_user,
      config.smtp_pass,
      config.smtp_from,
      config.telegram_enabled ? 1 : 0,
      config.telegram_bot_token,
      config.telegram_chat_id,
      config.threshold_cpu || 80,
      config.threshold_memory || 85,
      config.threshold_disk || 90,
      config.server_name || 'VPS DevOps Agent'
    );

    // Réinitialiser le transporteur email si nécessaire
    if (config.email_enabled) {
      this.initEmailTransporter(config);
    }
  }

  /**
   * Sauvegarder l'alerte dans l'historique
   */
  saveAlertToHistory(alert) {
    try {
      const stmt = this.db.prepare(`
        INSERT INTO alert_history (type, level, message, value, threshold, created_at)
        VALUES (?, ?, ?, ?, ?, datetime('now'))
      `);

      stmt.run(alert.type, alert.level, alert.message, alert.value, alert.threshold);
    } catch (error) {
      console.error('Error saving alert to history:', error);
    }
  }

  /**
   * Récupérer l'historique des alertes
   */
  getAlertHistory(limit = 50) {
    try {
      const stmt = this.db.prepare(`
        SELECT * FROM alert_history
        ORDER BY created_at DESC
        LIMIT ?
      `);

      return stmt.all(limit);
    } catch (error) {
      console.error('Error getting alert history:', error);
      return [];
    }
  }

  /**
   * Configuration par défaut
   */
  getDefaultConfig() {
    return {
      email_enabled: false,
      email_to: '',
      smtp_host: '',
      smtp_port: 587,
      smtp_user: '',
      smtp_pass: '',
      smtp_from: '',
      telegram_enabled: false,
      telegram_bot_token: '',
      telegram_chat_id: '',
      threshold_cpu: 80,
      threshold_memory: 85,
      threshold_disk: 90,
      server_name: 'VPS DevOps Agent'
    };
  }

  /**
   * Tester la configuration email
   */
  async testEmailConfig(config) {
    const testTransporter = nodemailer.createTransporter({
      host: config.smtp_host,
      port: config.smtp_port,
      secure: config.smtp_port === 465,
      auth: {
        user: config.smtp_user,
        pass: config.smtp_pass
      }
    });

    await testTransporter.sendMail({
      from: config.smtp_from || config.smtp_user,
      to: config.email_to,
      subject: '[VPS DevOps] Test de configuration email',
      html: '<p>Ceci est un email de test. La configuration fonctionne correctement ✅</p>'
    });

    return { success: true, message: 'Email de test envoyé avec succès' };
  }

  /**
   * Tester la configuration Telegram
   */
  async testTelegramConfig(config) {
    const url = `https://api.telegram.org/bot${config.telegram_bot_token}/sendMessage`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: config.telegram_chat_id,
        text: '✅ Test de configuration Telegram réussi!\n\nLe système de monitoring est correctement configuré.'
      })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.description || 'Erreur Telegram API');
    }

    return { success: true, message: 'Message Telegram envoyé avec succès' };
  }

  /**
   * Clear alert history
   */
  clearAlertHistory(before = null) {
    try {
      let stmt;
      if (before) {
        stmt = this.db.prepare('DELETE FROM alert_history WHERE created_at < datetime(?, "unixepoch", "localtime")');
        const result = stmt.run(Math.floor(before / 1000));
        return { success: true, deleted: result.changes };
      } else {
        stmt = this.db.prepare('DELETE FROM alert_history');
        const result = stmt.run();
        return { success: true, deleted: result.changes };
      }
    } catch (error) {
      console.error('Error clearing alert history:', error);
      return { success: false, error: error.message };
    }
  }

}

export default new AlertManager();
