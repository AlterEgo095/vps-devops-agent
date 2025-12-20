/**
 * Security Metrics Service
 * Analyse les logs de sécurité et fournit des métriques en temps réel
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const LOGS_DIR = path.join(__dirname, '../logs');
const SECURITY_LOG = path.join(LOGS_DIR, 'security-audit.log');
const FAILED_AUTH_LOG = path.join(LOGS_DIR, 'failed-auth.log');

/**
 * Lit et parse un fichier de log JSON line par ligne
 */
function readLogFile(filePath) {
  try {
    if (!fs.existsSync(filePath)) {
      return [];
    }
    
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.trim().split('\n').filter(line => line.length > 0);
    
    return lines.map(line => {
      try {
        return JSON.parse(line);
      } catch (e) {
        return null;
      }
    }).filter(entry => entry !== null);
  } catch (error) {
    console.error(`Error reading log file ${filePath}:`, error);
    return [];
  }
}

/**
 * Filtre les entrées par période de temps
 */
function filterByTimeRange(entries, hours = 24) {
  const cutoffTime = new Date(Date.now() - hours * 60 * 60 * 1000);
  return entries.filter(entry => {
    const entryTime = new Date(entry.timestamp);
    return entryTime >= cutoffTime;
  });
}

/**
 * Compte les occurrences par propriété
 */
function countBy(entries, property) {
  const counts = {};
  entries.forEach(entry => {
    const value = entry[property] || 'unknown';
    counts[value] = (counts[value] || 0) + 1;
  });
  return counts;
}

/**
 * Récupère le top N des entrées
 */
function getTopN(counts, n = 10) {
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([key, value]) => ({ key, count: value }));
}

/**
 * Analyse des métriques de sécurité
 */
export function getSecurityMetrics(timeRange = 24) {
  const securityEntries = readLogFile(SECURITY_LOG);
  const failedAuthEntries = readLogFile(FAILED_AUTH_LOG);
  
  // Filtrer par période
  const recentSecurity = filterByTimeRange(securityEntries, timeRange);
  const recentAuth = filterByTimeRange(failedAuthEntries, timeRange);
  
  // Métriques globales
  const totalEvents = recentSecurity.length;
  const criticalAttacks = recentSecurity.filter(e => e.level === 'CRITICAL').length;
  const failedLogins = recentAuth.length;
  const validationFailures = recentSecurity.filter(e => e.category === 'VALIDATION_FAILED').length;
  
  // Analyse par catégorie
  const eventsByCategory = countBy(recentSecurity, 'category');
  const eventsByLevel = countBy(recentSecurity, 'level');
  
  // Top IPs attaquantes
  const attackIPs = recentSecurity
    .filter(e => e.level === 'CRITICAL')
    .map(e => e.ip);
  const topAttackIPs = getTopN(countBy(attackIPs, ip => ip), 10);
  
  // Top routes attaquées
  const attackedRoutes = recentSecurity
    .filter(e => e.level === 'CRITICAL')
    .map(e => e.route);
  const topAttackedRoutes = getTopN(countBy(attackedRoutes, route => route), 10);
  
  // Analyse des échecs d'authentification
  const failedAuthReasons = countBy(recentAuth, 'reason');
  const failedAuthUsernames = getTopN(countBy(recentAuth, 'username'), 10);
  
  // Types d'attaques détectées
  const attackTypes = recentSecurity
    .filter(e => e.message && (e.message.includes('INJECTION') || e.message.includes('XSS') || e.message.includes('ATTEMPT')))
    .map(e => e.message);
  const attackTypesCounts = countBy(attackTypes, type => type);
  
  // Timeline (événements par heure)
  const timeline = {};
  recentSecurity.forEach(entry => {
    const hour = new Date(entry.timestamp).toISOString().slice(0, 13) + ':00:00Z';
    timeline[hour] = (timeline[hour] || 0) + 1;
  });
  
  return {
    overview: {
      totalEvents,
      criticalAttacks,
      failedLogins,
      validationFailures,
      timeRange: `${timeRange}h`
    },
    distribution: {
      byCategory: eventsByCategory,
      byLevel: eventsByLevel
    },
    attacks: {
      types: attackTypesCounts,
      topIPs: topAttackIPs,
      topRoutes: topAttackedRoutes
    },
    authentication: {
      totalFailed: failedLogins,
      reasons: failedAuthReasons,
      topUsernames: failedAuthUsernames
    },
    timeline,
    lastUpdated: new Date().toISOString()
  };
}

/**
 * Récupère les derniers événements critiques
 */
export function getRecentCriticalEvents(limit = 20) {
  const securityEntries = readLogFile(SECURITY_LOG);
  
  return securityEntries
    .filter(e => e.level === 'CRITICAL')
    .slice(-limit)
    .reverse();
}

/**
 * Vérifie les seuils d'alerte
 */
export function checkAlertThresholds() {
  const metrics = getSecurityMetrics(1); // Dernière heure
  const alerts = [];
  
  // Alerte: Plus de 10 attaques critiques en 1h
  if (metrics.overview.criticalAttacks > 10) {
    alerts.push({
      level: 'HIGH',
      type: 'CRITICAL_ATTACKS_SPIKE',
      message: `${metrics.overview.criticalAttacks} attaques critiques détectées dans la dernière heure`,
      threshold: 10,
      current: metrics.overview.criticalAttacks
    });
  }
  
  // Alerte: Plus de 20 échecs d'authentification en 1h
  if (metrics.overview.failedLogins > 20) {
    alerts.push({
      level: 'MEDIUM',
      type: 'FAILED_AUTH_SPIKE',
      message: `${metrics.overview.failedLogins} échecs d'authentification dans la dernière heure`,
      threshold: 20,
      current: metrics.overview.failedLogins
    });
  }
  
  // Alerte: Plus de 50 événements de validation échoués en 1h
  if (metrics.overview.validationFailures > 50) {
    alerts.push({
      level: 'MEDIUM',
      type: 'VALIDATION_FAILURES_SPIKE',
      message: `${metrics.overview.validationFailures} validations échouées dans la dernière heure`,
      threshold: 50,
      current: metrics.overview.validationFailures
    });
  }
  
  return {
    hasAlerts: alerts.length > 0,
    count: alerts.length,
    alerts,
    checkedAt: new Date().toISOString()
  };
}

export default {
  getSecurityMetrics,
  getRecentCriticalEvents,
  checkAlertThresholds
};
