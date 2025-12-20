import simpleGit from 'simple-git';
// SÉCURITÉ: Remplacer child_process.exec par secure-exec
import { secureExec } from './secure-exec.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import Database from 'better-sqlite3';
import * as tar from 'tar';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const dbPath = path.join(__dirname, '../../data/database.sqlite');

class DeploymentManager {
  constructor() {
    this.db = new Database(dbPath);
    this.deploymentsPath = '/opt/deployments';
    this.backupsPath = '/opt/deployments/backups';
    
    // Créer les dossiers si nécessaire
    if (!fs.existsSync(this.deploymentsPath)) {
      fs.mkdirSync(this.deploymentsPath, { recursive: true });
    }
    if (!fs.existsSync(this.backupsPath)) {
      fs.mkdirSync(this.backupsPath, { recursive: true });
    }
  }

  // Exécution sécurisée de commandes npm
  async runNpmCommand(projectPath, command) {
    try {
      // SÉCURITÉ: Valider le chemin du projet
      if (!projectPath || !path.isAbsolute(projectPath)) {
        throw new Error('Invalid project path');
      }

      // SÉCURITÉ: Valider la commande npm
      const allowedCommands = ['install', 'build', 'start', 'test', 'run'];
      const commandParts = command.split(' ');
      if (!allowedCommands.includes(commandParts[0])) {
        throw new Error(`Commande npm non autorisée: ${commandParts[0]}`);
      }

      // Utiliser secureExec au lieu de execAsync
      const { stdout, stderr } = await secureExec('npm', commandParts, {
        cwd: projectPath,
        timeout: 300000 // 5 minutes
      });

      return { stdout, stderr };
    } catch (error) {
      console.error('Erreur npm:', error.message);
      throw error;
    }
  }

  // Obtenir le statut PM2 de manière sécurisée
  async getPM2Status() {
    try {
      const { stdout } = await secureExec('pm2', ['jlist'], {
        timeout: 10000
      });
      
      return JSON.parse(stdout);
    } catch (error) {
      console.error('Erreur PM2:', error.message);
      return [];
    }
  }

  // Reste des méthodes inchangées...
  async deploy(projectName, gitUrl, branch = 'main') {
    const projectPath = path.join(this.deploymentsPath, projectName);
    
    try {
      // Clone ou pull
      if (!fs.existsSync(projectPath)) {
        const git = simpleGit();
        await git.clone(gitUrl, projectPath);
      } else {
        const git = simpleGit(projectPath);
        await git.pull('origin', branch);
      }

      // Installation des dépendances
      await this.runNpmCommand(projectPath, 'install');

      // Build si nécessaire
      const packageJson = JSON.parse(
        fs.readFileSync(path.join(projectPath, 'package.json'), 'utf8')
      );
      if (packageJson.scripts && packageJson.scripts.build) {
        await this.runNpmCommand(projectPath, 'build');
      }

      // Enregistrer dans la base
      const stmt = this.db.prepare(`
        INSERT INTO deployments (project_name, git_url, branch, status, deployed_at)
        VALUES (?, ?, ?, 'success', datetime('now'))
      `);
      stmt.run(projectName, gitUrl, branch);

      return { success: true, projectPath };
    } catch (error) {
      console.error('Erreur déploiement:', error);
      
      const stmt = this.db.prepare(`
        INSERT INTO deployments (project_name, git_url, branch, status, error_message, deployed_at)
        VALUES (?, ?, ?, 'failed', ?, datetime('now'))
      `);
      stmt.run(projectName, gitUrl, branch, error.message);

      throw error;
    }
  }

  async createBackup(projectName) {
    const projectPath = path.join(this.deploymentsPath, projectName);
    if (!fs.existsSync(projectPath)) {
      throw new Error('Projet non trouvé');
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupFile = path.join(this.backupsPath, `${projectName}-${timestamp}.tar.gz`);

    await tar.create(
      {
        gzip: true,
        file: backupFile,
        cwd: this.deploymentsPath
      },
      [projectName]
    );

    return backupFile;
  }

  getDeployments(limit = 50) {
    const stmt = this.db.prepare(`
      SELECT * FROM deployments 
      ORDER BY deployed_at DESC 
      LIMIT ?
    `);
    return stmt.all(limit);
  }
}

export default new DeploymentManager();
