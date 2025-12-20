/**
 * Tests API de sécurité - CORRECTED
 * Teste les endpoints de monitoring de sécurité
 */

import { describe, test, expect } from '@jest/globals';
import request from 'supertest';
import express from 'express';
import securityRouter from '../routes/security.js';

// Créer une app Express de test
const app = express();
app.use(express.json());
app.use('/api/security', securityRouter);

describe('Security API - Metrics Endpoint', () => {
  test('GET /api/security/metrics devrait retourner des métriques', async () => {
    const response = await request(app)
      .get('/api/security/metrics?timeRange=24')
      .expect('Content-Type', /json/)
      .expect(200);
    
    expect(response.body.success).toBe(true);
    expect(response.body.data).toHaveProperty('overview');
    expect(response.body.data).toHaveProperty('distribution');
    expect(response.body.data).toHaveProperty('attacks');
    expect(response.body.data).toHaveProperty('authentication');
    expect(response.body.data).toHaveProperty('timeline');
  });
  
  test('GET /api/security/metrics avec timeRange invalide devrait retourner 400', async () => {
    const response = await request(app)
      .get('/api/security/metrics?timeRange=99')
      .expect(400);
    
    expect(response.body.error).toBe('Invalid timeRange');
  });
  
  test('GET /api/security/metrics devrait utiliser 24h par défaut', async () => {
    const response = await request(app)
      .get('/api/security/metrics')
      .expect(200);
    
    expect(response.body.data.overview.timeRange).toBe('24h');
  });
});

describe('Security API - Critical Events Endpoint', () => {
  test('GET /api/security/events/critical devrait retourner des événements', async () => {
    const response = await request(app)
      .get('/api/security/events/critical?limit=10')
      .expect('Content-Type', /json/)
      .expect(200);
    
    expect(response.body.success).toBe(true);
    expect(response.body).toHaveProperty('count');
    expect(response.body).toHaveProperty('data');
    expect(Array.isArray(response.body.data)).toBe(true);
  });
  
  test('GET /api/security/events/critical avec limit invalide devrait retourner 400', async () => {
    const response = await request(app)
      .get('/api/security/events/critical?limit=999')
      .expect(400);
    
    expect(response.body.error).toBe('Invalid limit');
  });
});

describe('Security API - Alerts Endpoint', () => {
  test('GET /api/security/alerts devrait retourner le statut des alertes', async () => {
    const response = await request(app)
      .get('/api/security/alerts')
      .expect('Content-Type', /json/)
      .expect(200);
    
    expect(response.body.success).toBe(true);
    expect(response.body.data).toHaveProperty('hasAlerts');
    expect(response.body.data).toHaveProperty('count');
    expect(response.body.data).toHaveProperty('alerts');
    expect(response.body.data).toHaveProperty('checkedAt');
  });
  
  test('GET /api/security/alerts devrait retourner un boolean pour hasAlerts', async () => {
    const response = await request(app)
      .get('/api/security/alerts')
      .expect(200);
    
    expect(typeof response.body.data.hasAlerts).toBe('boolean');
    expect(typeof response.body.data.count).toBe('number');
  });
});

describe('Security API - Dashboard Endpoint', () => {
  test('GET /api/security/dashboard devrait retourner toutes les données', async () => {
    const response = await request(app)
      .get('/api/security/dashboard?timeRange=24')
      .expect('Content-Type', /json/)
      .expect(200);
    
    expect(response.body.success).toBe(true);
    expect(response.body.data).toHaveProperty('metrics');
    expect(response.body.data).toHaveProperty('criticalEvents');
    expect(response.body.data).toHaveProperty('alerts');
  });
  
  test('GET /api/security/dashboard devrait limiter les événements critiques à 10', async () => {
    const response = await request(app)
      .get('/api/security/dashboard')
      .expect(200);
    
    expect(response.body.data.criticalEvents.length).toBeLessThanOrEqual(10);
  });
});

describe('Security API - Response Format', () => {
  test('Toutes les réponses succès devraient avoir success=true', async () => {
    const endpoints = [
      '/api/security/metrics',
      '/api/security/events/critical',
      '/api/security/alerts',
      '/api/security/dashboard'
    ];
    
    for (const endpoint of endpoints) {
      const response = await request(app).get(endpoint).expect(200);
      expect(response.body.success).toBe(true);
    }
  });
  
  test('Les métriques devraient avoir lastUpdated en ISO format', async () => {
    const response = await request(app)
      .get('/api/security/metrics')
      .expect(200);
    
    const timestamp = response.body.data.lastUpdated;
    expect(timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });
});
