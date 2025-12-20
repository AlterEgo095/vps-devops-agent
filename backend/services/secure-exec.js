/**
 * Secure Command Execution Helper
 * Prévient les injections de commandes en utilisant execFile au lieu de exec
 */

import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

/**
 * Exécute une commande de manière sécurisée avec execFile
 * @param {string} command - Commande à exécuter (sans arguments)
 * @param {string[]} args - Arguments de la commande (array séparé)
 * @param {object} options - Options d'exécution
 * @returns {Promise<{stdout: string, stderr: string}>}
 */
export async function secureExec(command, args = [], options = {}) {
  // Validation de base
  if (typeof command !== 'string' || !command) {
    throw new Error('Command must be a non-empty string');
  }
  
  if (!Array.isArray(args)) {
    throw new Error('Args must be an array');
  }
  
  // Sanitize command name (pas de path traversal)
  if (command.includes('/') && !command.startsWith('/usr/bin/') && !command.startsWith('/bin/')) {
    throw new Error('Invalid command path');
  }
  
  // Options par défaut sécurisées
  const safeOptions = {
    timeout: options.timeout || 60000,
    maxBuffer: options.maxBuffer || 10 * 1024 * 1024, // 10MB
    shell: false, // IMPORTANT: désactiver shell pour éviter injections
    ...options
  };
  
  try {
    const result = await execFileAsync(command, args, safeOptions);
    return result;
  } catch (error) {
    // Re-throw avec contexte
    throw new Error(`Secure exec failed: ${error.message}`);
  }
}

/**
 * Exécute find de manière sécurisée
 * @param {string} basePath - Chemin de base
 * @param {object} options - Options de recherche
 */
export async function secureFind(basePath, options = {}) {
  const args = [basePath];
  
  // Ajouter options de manière sécurisée
  if (options.name) {
    args.push('-name', options.name);
  }
  
  if (options.type) {
    args.push('-type', options.type);
  }
  
  if (options.maxdepth) {
    args.push('-maxdepth', String(options.maxdepth));
  }
  
  // Limiter les résultats
  if (options.limit) {
    args.push('-print');
    args.push('|');
    args.push('head');
    args.push('-n');
    args.push(String(options.limit));
  }
  
  return await secureExec('find', args, { timeout: options.timeout || 30000 });
}

/**
 * Exécute grep de manière sécurisée
 */
export async function secureGrep(pattern, files, options = {}) {
  const args = [];
  
  // Options
  if (options.ignoreCase) args.push('-i');
  if (options.recursive) args.push('-r');
  if (options.lineNumber) args.push('-n');
  if (options.count) args.push('-c');
  
  // Pattern et fichiers
  args.push(pattern);
  if (Array.isArray(files)) {
    args.push(...files);
  } else {
    args.push(files);
  }
  
  return await secureExec('grep', args, { timeout: options.timeout || 30000 });
}

export default { secureExec, secureFind, secureGrep };
