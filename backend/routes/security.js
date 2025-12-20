/**
 * Security Monitoring Routes
 * Endpoints pour le monitoring de sécurité en temps réel
 */

import express from 'express';
import { 
  getSecurityMetrics, 
  getRecentCriticalEvents, 
  checkAlertThresholds 
} from '../services/security-metrics.js';

const router = express.Router();

/**
 * GET /api/security/metrics
 * Récupère les métriques de sécurité
 * Query params: timeRange (1, 24, 168 hours)
 */
router.get('/metrics', (req, res) => {
  try {
    const timeRange = parseInt(req.query.timeRange) || 24;
    
    // Valider timeRange
    if (![1, 24, 168].includes(timeRange)) {
      return res.status(400).json({
        error: 'Invalid timeRange',
        message: 'timeRange must be 1, 24, or 168 hours'
      });
    }
    
    const metrics = getSecurityMetrics(timeRange);
    
    res.json({
      success: true,
      data: metrics
    });
  } catch (error) {
    console.error('Error fetching security metrics:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to fetch security metrics'
    });
  }
});

/**
 * GET /api/security/events/critical
 * Récupère les derniers événements critiques
 * Query params: limit (default: 20)
 */
router.get('/events/critical', (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 20;
    
    // Valider limit
    if (limit < 1 || limit > 100) {
      return res.status(400).json({
        error: 'Invalid limit',
        message: 'limit must be between 1 and 100'
      });
    }
    
    const events = getRecentCriticalEvents(limit);
    
    res.json({
      success: true,
      count: events.length,
      data: events
    });
  } catch (error) {
    console.error('Error fetching critical events:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to fetch critical events'
    });
  }
});

/**
 * GET /api/security/alerts
 * Vérifie les alertes actives
 */
router.get('/alerts', (req, res) => {
  try {
    const alertStatus = checkAlertThresholds();
    
    res.json({
      success: true,
      data: alertStatus
    });
  } catch (error) {
    console.error('Error checking alerts:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to check alerts'
    });
  }
});

/**
 * GET /api/security/dashboard
 * Dashboard complet avec toutes les données
 */
router.get('/dashboard', (req, res) => {
  try {
    const timeRange = parseInt(req.query.timeRange) || 24;
    
    const metrics = getSecurityMetrics(timeRange);
    const criticalEvents = getRecentCriticalEvents(10);
    const alerts = checkAlertThresholds();
    
    res.json({
      success: true,
      data: {
        metrics,
        criticalEvents,
        alerts
      }
    });
  } catch (error) {
    console.error('Error fetching dashboard data:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to fetch dashboard data'
    });
  }
});

export default router;
