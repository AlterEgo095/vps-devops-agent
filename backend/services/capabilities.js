// SÉCURITÉ: Import secure-exec pour remplacer child_process.exec
import { secureExec, secureFind, secureGrep } from './secure-exec.js';
import fs from 'fs/promises';
import path from 'path';
import * as enhancements from './enhancements/index.js';

const WORKSPACE = process.env.AGENT_WORKSPACE || '/opt/agent-projects';

/**
 * Valider et sécuriser un chemin
 */
function validatePath(requestedPath) {
  // Si c'est un chemin absolu qui commence par /opt, l'autoriser directement
  if (requestedPath.startsWith('/opt/')) {
    return path.resolve(requestedPath);
  }
  
  // Sinon, utiliser le workspace
  const resolved = path.resolve(WORKSPACE, requestedPath);
  
  // Vérifier que le chemin est dans le workspace
  if (!resolved.startsWith(WORKSPACE)) {
    throw new Error('Path outside workspace is not allowed');
  }
  
  return resolved;
}

/**
 * Liste blanche de capacités sécurisées
 */
export const capabilities = {
  /**
   * Créer un fichier
   */
  async createFile(filePath, content) {
    const safePath = validatePath(filePath);
    const dir = path.dirname(safePath);
    
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(safePath, content, 'utf8');
    
    return { success: true, path: safePath };
  },

  /**
   * Lire un fichier
   */
  async readFile(filePath) {
    const safePath = validatePath(filePath);
    const content = await fs.readFile(safePath, 'utf8');
    return { success: true, content };
  },

  /**
   * Lister les fichiers d'un répertoire
   */
  async listFiles(dirPath) {
    const safePath = validatePath(dirPath);
    const entries = await fs.readdir(safePath, { withFileTypes: true });
    
    const files = entries.map(entry => ({
      name: entry.name,
      isDirectory: entry.isDirectory(),
      isFile: entry.isFile()
    }));
    
    return { success: true, files };
  },

  /**
   * Docker Compose - SÉCURISÉ avec secureExec
   */
  async dockerCompose(projectPath, command) {
    const safePath = validatePath(projectPath);
    
    // Liste blanche stricte
    const allowedCommands = ['up -d', 'down', 'ps', 'logs', 'restart', 'stop', 'start'];
    if (!allowedCommands.some(cmd => command.startsWith(cmd))) {
      throw new Error(`Docker compose command not allowed: ${command}`);
    }

    // SÉCURITÉ: Utiliser secureExec au lieu d'execAsync
    const commandParts = ['compose', ...command.split(' ')];
    const { stdout, stderr } = await secureExec('docker', commandParts, {
      cwd: safePath,
      timeout: 120000
    });

    return { success: true, stdout, stderr };
  },

  /**
   * Exécuter une commande npm - SÉCURISÉ
   */
  async runNpmCommand(projectPath, command) {
    const safePath = validatePath(projectPath);
    
    // Liste blanche stricte pour npm
    const allowedCommands = ['install', 'start', 'build', 'test', 'run'];
    const commandParts = command.split(' ');
    
    if (!allowedCommands.includes(commandParts[0])) {
      throw new Error(`NPM command not allowed: ${commandParts[0]}`);
    }

    // SÉCURITÉ: Utiliser secureExec
    const { stdout, stderr } = await secureExec('npm', commandParts, {
      cwd: safePath,
      timeout: 300000
    });

    return { success: true, stdout, stderr };
  },

  /**
   * Git clone - SÉCURISÉ
   */
  async gitClone(repoUrl, targetPath) {
    const safePath = validatePath(targetPath);
    
    // Valider URL git
    if (!repoUrl.match(/^(https?:\/\/|git@)/)) {
      throw new Error('Invalid git repository URL');
    }

    // SÉCURITÉ: Arguments séparés
    const { stdout, stderr } = await secureExec('git', ['clone', repoUrl, safePath], {
      timeout: 300000
    });

    return { success: true, stdout, stderr };
  },

  /**
   * Git pull - SÉCURISÉ
   */
  async gitPull(projectPath) {
    const safePath = validatePath(projectPath);

    // SÉCURITÉ: Arguments séparés
    const { stdout, stderr } = await secureExec('git', ['pull'], {
      cwd: safePath,
      timeout: 60000
    });

    return { success: true, stdout, stderr };
  },

  /**
   * Recherche dans fichiers - SÉCURISÉ avec secureFind et secureGrep
   */
  async searchInFiles(dirPath, pattern, options = {}) {
    const safePath = validatePath(dirPath);
    
    // Valider le pattern
    if (!pattern || typeof pattern !== 'string') {
      throw new Error('Invalid search pattern');
    }

    try {
      // SÉCURITÉ: Utiliser secureFind au lieu de find + grep
      const results = await secureFind(safePath, pattern, {
        fileTypes: options.fileTypes || [],
        caseSensitive: options.caseSensitive !== false,
        timeout: 60000
      });

      return {
        success: true,
        matches: results.matches || [],
        count: results.count || 0
      };
    } catch (error) {
      console.error('Search error:', error.message);
      return {
        success: false,
        error: error.message,
        matches: [],
        count: 0
      };
    }
  },

  /**
   * Analyser projet - SÉCURISÉ
   */
  async analyzeProject(projectPath) {
    const safePath = validatePath(projectPath);
    
    try {
      const analysis = {
        path: safePath,
        files: [],
        stats: {
          totalFiles: 0,
          totalDirs: 0,
          totalLines: 0
        }
      };

      // Compter fichiers de manière sécurisée
      async function countEntries(dir) {
        const entries = await fs.readdir(dir, { withFileTypes: true });
        
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          
          if (entry.isDirectory()) {
            analysis.stats.totalDirs++;
            if (!entry.name.startsWith('.') && entry.name !== 'node_modules') {
              await countEntries(fullPath);
            }
          } else if (entry.isFile()) {
            analysis.stats.totalFiles++;
            
            // Compter lignes pour fichiers texte
            if (entry.name.match(/\.(js|ts|json|md|txt|py|java|go)$/)) {
              try {
                const content = await fs.readFile(fullPath, 'utf8');
                analysis.stats.totalLines += content.split('\n').length;
              } catch (err) {
                // Ignorer erreurs de lecture
              }
            }
          }
        }
      }

      await countEntries(safePath);

      return { success: true, analysis };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  /**
   * Vérifier syntaxe code - SÉCURISÉ
   */
  async checkSyntax(filePath, language) {
    const safePath = validatePath(filePath);
    
    try {
      if (language === 'javascript' || language === 'js') {
        // SÉCURITÉ: Utiliser secureExec avec arguments séparés
        await secureExec('node', ['--check', safePath], { timeout: 5000 });
        return { success: true, valid: true };
      } else if (language === 'python' || language === 'py') {
        // SÉCURITÉ: Utiliser secureExec avec arguments séparés
        await secureExec('python3', ['-m', 'py_compile', safePath], { timeout: 5000 });
        return { success: true, valid: true };
      } else {
        return { success: false, error: 'Unsupported language' };
      }
    } catch (error) {
      return {
        success: false,
        valid: false,
        error: error.message
      };
    }
  },

  /**
   * Créer répertoire
   */
  async createDirectory(dirPath) {
    const safePath = validatePath(dirPath);
    await fs.mkdir(safePath, { recursive: true });
    return { success: true, path: safePath };
  },

  /**
   * Supprimer fichier
   */
  async deleteFile(filePath) {
    const safePath = validatePath(filePath);
    await fs.unlink(safePath);
    return { success: true };
  },

  /**
   * Supprimer répertoire
   */
  async deleteDirectory(dirPath) {
    const safePath = validatePath(dirPath);
    await fs.rm(safePath, { recursive: true, force: true });
    return { success: true };
  },

  /**
   * Copier fichier
   */
  async copyFile(sourcePath, destPath) {
    const safeSrc = validatePath(sourcePath);
    const safeDest = validatePath(destPath);
    await fs.copyFile(safeSrc, safeDest);
    return { success: true };
  },

  /**
   * Déplacer/Renommer fichier
   */
  async moveFile(sourcePath, destPath) {
    const safeSrc = validatePath(sourcePath);
    const safeDest = validatePath(destPath);
    await fs.rename(safeSrc, safeDest);
    return { success: true };
  },

  /**
   * Obtenir informations fichier
   */
  async getFileInfo(filePath) {
    const safePath = validatePath(filePath);
    const stats = await fs.stat(safePath);
    
    return {
      success: true,
      info: {
        size: stats.size,
        isDirectory: stats.isDirectory(),
        isFile: stats.isFile(),
        created: stats.birthtime,
        modified: stats.mtime,
        accessed: stats.atime
      }
    };
  }
};

// Exporter les enhancements si disponibles
if (enhancements) {
  Object.assign(capabilities, enhancements);
}

export default capabilities;
