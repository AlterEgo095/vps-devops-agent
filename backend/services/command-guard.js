/**
 * ============================================================
 * CommandGuard — Pare-feu de commandes système
 * ============================================================
 * 
 * OBJECTIF : Bloquer catégoriquement les commandes destructrices
 * AVANT qu'elles n'atteignent le serveur SSH. Le classifyRisk()
 * existant informe mais n'empêche rien. Ce module BLOQUE.
 * 
 * ARCHITECTURE :
 *   1. BLACKLIST absolue — commandes JAMAIS exécutables
 *   2. GRAYLIST avertissement — commandes nécessitant confirmation explicite
 *   3. WHITELIST — commandes toujours autorisées (lecture seule)
 *   4. Détection d'injection (pipes, subshells, chainage malveillant)
 * 
 * @module CommandGuard
 * @version 1.0.0
 * @since 2026-03-19
 */

import logger from '../config/logger.js';

// ============================================================
// BLACKLIST ABSOLUE — JAMAIS EXÉCUTABLES
// Ces commandes sont bloquées même avec confirmation admin
// ============================================================
const BLACKLISTED_COMMANDS = [
  // Destruction de données
  /rm\s+(-[rRf]+\s+)*\//i,                    // rm -rf / ou rm / 
  /rm\s+-[rRf]+\s+--no-preserve-root/i,        // rm avec no-preserve-root
  /rm\s+-[rRf]+\s+\*/i,                        // rm -rf *
  /rm\s+-[rRf]+\s+~\//i,                       // rm -rf ~/
  
  // Formatage / destruction disque
  /mkfs\./i,                                     // mkfs.ext4 etc
  /dd\s+if=\/dev\/(zero|random|urandom)\s+of=\/dev\/[sh]d/i, // dd sur disque
  /wipefs/i,                                     // wipefs
  /fdisk\s+\/dev/i,                             // fdisk sur disque
  /parted\s+\/dev/i,                            // parted
  
  // Extinction serveur
  /shutdown\s+-h\s+now/i,                       // shutdown immédiat
  /poweroff/i,                                   // poweroff
  /halt/i,                                       // halt
  /init\s+0/i,                                  // init 0
  
  // Fork bomb / déni de service
  /:\(\)\{.*\|.*&.*\}/i,                        // fork bomb bash
  /\byes\s*\|/i,                                // yes | (pipe infini)
  
  // Suppression utilisateurs système
  /userdel\s+(-r\s+)?(root|www-data|node|postgres|mysql)/i,
  
  // Destruction iptables complète
  /iptables\s+-F\s*&&\s*iptables\s+-X/i,       // Flush + delete chains
  
  // Destruction Docker complète
  /docker\s+(rm|rmi)\s+-f\s+\$\(docker\s+(ps|images)\s+-aq?\)/i, // docker rm -f $(docker ps -aq)
  /docker\s+system\s+prune\s+-a\s+--volumes/i,  // Tout supprimer Docker
  
  // Commandes crypto/ransomware patterns
  /openssl\s+enc.*-in\s+\/.*-out\s+\//i,       // Chiffrement de fichiers système
  
  // Modification du bootloader
  /grub-install/i,
  /update-grub/i,
  
  // Désactivation de la sécurité
  /setenforce\s+0/i,                            // Désactiver SELinux
  /ufw\s+disable/i,                             // Désactiver le firewall
  /systemctl\s+(disable|mask)\s+fail2ban/i,     // Désactiver fail2ban
];

// ============================================================
// GRAYLIST — NÉCESSITENT CONFIRMATION EXPLICITE
// ============================================================
const GRAYLISTED_COMMANDS = [
  { pattern: /reboot/i, reason: 'Redémarrage du serveur — connexion perdue pendant 1-3 minutes' },
  { pattern: /systemctl\s+stop\s/i, reason: 'Arrêt d\'un service — peut impacter la production' },
  { pattern: /systemctl\s+disable\s/i, reason: 'Désactivation permanente d\'un service' },
  { pattern: /apt\s+(remove|purge|autoremove)/i, reason: 'Suppression de paquets — peut casser des dépendances' },
  { pattern: /yum\s+(remove|erase)/i, reason: 'Suppression de paquets — peut casser des dépendances' },
  { pattern: /chmod\s+-R\s+777/i, reason: 'Permissions 777 récursives — faille de sécurité majeure' },
  { pattern: /chown\s+-R\s+.*\//i, reason: 'Changement de propriétaire récursif — risque de casser le système' },
  { pattern: /docker\s+stop\s/i, reason: 'Arrêt de conteneur(s) Docker' },
  { pattern: /docker\s+rm\s/i, reason: 'Suppression de conteneur(s) Docker' },
  { pattern: /docker\s+rmi\s/i, reason: 'Suppression d\'image(s) Docker' },
  { pattern: /docker\s+system\s+prune/i, reason: 'Nettoyage Docker — supprime les ressources inutilisées' },
  { pattern: /DROP\s+(TABLE|DATABASE)/i, reason: 'Suppression de base/table SQL' },
  { pattern: /TRUNCATE\s+TABLE/i, reason: 'Vidage de table SQL' },
  { pattern: /kill\s+-9/i, reason: 'Kill forcé de processus' },
  { pattern: /pkill\s/i, reason: 'Kill de processus par nom' },
  { pattern: /iptables\s/i, reason: 'Modification des règles firewall' },
  { pattern: /crontab\s+-r/i, reason: 'Suppression de toutes les tâches cron' },
  { pattern: /nginx\s+-s\s+stop/i, reason: 'Arrêt de Nginx — site(s) hors-ligne' },
  { pattern: /pm2\s+delete\s+all/i, reason: 'Suppression de tous les processus PM2' },
];

// ============================================================
// DÉTECTION D'INJECTION
// ============================================================
const INJECTION_PATTERNS = [
  { pattern: /;\s*rm\s/i, reason: 'Injection de commande rm après point-virgule' },
  { pattern: /\|\s*rm\s/i, reason: 'Pipe vers rm détecté' },
  { pattern: /`[^`]*rm\s/i, reason: 'Exécution de rm dans backticks' },
  { pattern: /\$\([^)]*rm\s/i, reason: 'Exécution de rm dans subshell' },
  { pattern: /&&\s*(rm|shutdown|poweroff|halt|reboot|mkfs|dd\s+if)/i, reason: 'Commande destructrice chaînée avec &&' },
  { pattern: /\|\|\s*(rm|shutdown|poweroff|halt|reboot)/i, reason: 'Commande destructrice chaînée avec ||' },
  { pattern: />\s*\/dev\/[sh]d[a-z]/i, reason: 'Redirection vers un périphérique bloc' },
  { pattern: />\s*\/etc\/(passwd|shadow|sudoers)/i, reason: 'Écrasement de fichier système critique' },
  { pattern: /curl.*\|\s*(bash|sh|zsh)/i, reason: 'Exécution de script distant (curl | bash)' },
  { pattern: /wget.*\|\s*(bash|sh|zsh)/i, reason: 'Exécution de script distant (wget | bash)' },
  { pattern: /\beval\s/i, reason: 'Utilisation de eval() — risque d\'injection' },
];

/**
 * Valide une commande avant exécution
 * 
 * @param {string} command - La commande à valider
 * @param {object} options - Options de validation
 * @param {boolean} options.allowGraylist - Si true, autorise les commandes graylist
 * @param {string} options.userId - ID utilisateur pour audit trail
 * @returns {{ allowed: boolean, level: string, reason: string, warnings: string[] }}
 */
export function validateCommand(command, options = {}) {
  const { allowGraylist = false, userId = 'unknown' } = options;
  const warnings = [];
  
  if (!command || typeof command !== 'string') {
    return {
      allowed: false,
      level: 'BLOCKED',
      reason: 'Commande vide ou invalide',
      warnings: []
    };
  }

  // Normaliser la commande (trim, pas de retour chariot)
  const normalizedCmd = command.trim().replace(/\r\n/g, '\n');
  
  // ============================================================
  // 1. CHECK BLACKLIST — BLOCAGE ABSOLU
  // ============================================================
  for (const pattern of BLACKLISTED_COMMANDS) {
    if (pattern.test(normalizedCmd)) {
      logger.error(`[COMMAND-GUARD] BLOCKED command from user ${userId}: ${normalizedCmd.substring(0, 100)}`);
      return {
        allowed: false,
        level: 'BLOCKED',
        reason: `Commande bloquée par la politique de sécurité. Pattern interdit détecté.`,
        warnings: ['Cette commande est catégoriquement interdite et ne peut pas être exécutée.']
      };
    }
  }
  
  // ============================================================
  // 2. CHECK INJECTION — BLOCAGE
  // ============================================================
  for (const { pattern, reason } of INJECTION_PATTERNS) {
    if (pattern.test(normalizedCmd)) {
      logger.warn(`[COMMAND-GUARD] INJECTION detected from user ${userId}: ${reason}`);
      return {
        allowed: false,
        level: 'INJECTION',
        reason: `Tentative d'injection détectée : ${reason}`,
        warnings: ['La commande contient des patterns d\'injection potentiellement dangereux.']
      };
    }
  }
  
  // ============================================================
  // 3. CHECK GRAYLIST — CONFIRMATION REQUISE
  // ============================================================
  for (const { pattern, reason } of GRAYLISTED_COMMANDS) {
    if (pattern.test(normalizedCmd)) {
      if (!allowGraylist) {
        logger.warn(`[COMMAND-GUARD] GRAYLIST command from user ${userId}: ${normalizedCmd.substring(0, 100)}`);
        return {
          allowed: false,
          level: 'NEEDS_CONFIRMATION',
          reason: reason,
          warnings: [`Confirmation requise : ${reason}`]
        };
      }
      warnings.push(`Attention : ${reason}`);
    }
  }
  
  // ============================================================
  // 4. COMMANDE AUTORISÉE
  // ============================================================
  return {
    allowed: true,
    level: 'ALLOWED',
    reason: 'Commande autorisée',
    warnings
  };
}

/**
 * Vérifie si une commande est en lecture seule (SAFE)
 * @param {string} command
 * @returns {boolean}
 */
export function isReadOnlyCommand(command) {
  const READONLY_PATTERNS = [
    /^ls\b/i, /^pwd$/i, /^whoami$/i, /^date$/i, /^uptime$/i,
    /^df\b/i, /^du\b/i, /^cat\b/i, /^head\b/i, /^tail\b/i,
    /^grep\b/i, /^find\b/i, /^which\b/i, /^man\b/i,
    /^ps\b/i, /^top$/i, /^htop$/i, /^free\b/i,
    /^netstat\b/i, /^ss\b/i, /^ip\s+(addr|route|link)/i,
    /^hostname$/i, /^uname\b/i, /^lsb_release\b/i,
    /^systemctl\s+status\b/i, /^journalctl\b/i,
    /^docker\s+(ps|images|logs|inspect|stats)\b/i,
    /^git\s+(status|log|branch|diff|remote)\b/i,
    /^npm\s+(list|outdated|ls)\b/i,
    /^pm2\s+(list|status|info|logs|show|describe)\b/i,
    /^curl\s+-[sIL]/i, /^ping\b/i, /^traceroute\b/i, /^dig\b/i,
    /^nslookup\b/i, /^host\b/i, /^wget\s+--spider/i,
    /^wc\b/i, /^sort\b/i, /^uniq\b/i, /^awk\b/i, /^sed\b/i,
    /^echo\b/i, /^printf\b/i, /^env$/i, /^printenv\b/i,
  ];
  
  const trimmed = (command || '').trim();
  return READONLY_PATTERNS.some(p => p.test(trimmed));
}

export default {
  validateCommand,
  isReadOnlyCommand
};
