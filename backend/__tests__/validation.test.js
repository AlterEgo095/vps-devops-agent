/**
 * Tests de validation (Input Validation Layer) - CORRECTED
 * Teste les schémas Joi et la validation des entrées
 */

import { describe, test, expect } from '@jest/globals';
import {
  loginSchema,
  executeMultiServerCommandSchema
} from '../middleware/validation-schemas.js';

describe('Input Validation - Login Schema', () => {
  test('devrait accepter des credentials valides', () => {
    const validInput = {
      username: 'admin',
      password: 'password123'
    };
    
    const { error } = loginSchema.validate(validInput);
    expect(error).toBeUndefined();
  });
  
  test('devrait rejeter un username trop court', () => {
    const invalidInput = {
      username: 'ab',
      password: 'password123'
    };
    
    const { error } = loginSchema.validate(invalidInput);
    expect(error).toBeDefined();
    expect(error.details[0].type).toBe('string.min');
  });
  
  test('devrait rejeter un username avec caractères spéciaux', () => {
    const invalidInput = {
      username: 'admin<script>',
      password: 'password123'
    };
    
    const { error } = loginSchema.validate(invalidInput);
    expect(error).toBeDefined();
    expect(error.details[0].type).toBe('string.alphanum');
  });
  
  test('devrait rejeter un password trop court', () => {
    const invalidInput = {
      username: 'admin',
      password: '12345'
    };
    
    const { error } = loginSchema.validate(invalidInput);
    expect(error).toBeDefined();
    expect(error.details[0].type).toBe('string.min');
  });
  
  test('devrait rejeter des champs manquants', () => {
    const invalidInput = {
      username: 'admin'
    };
    
    const { error } = loginSchema.validate(invalidInput);
    expect(error).toBeDefined();
    expect(error.details[0].type).toBe('any.required');
  });
});

describe('Input Validation - Multi-Server Command Schema', () => {
  test('devrait accepter une commande multi-serveurs valide', () => {
    const validInput = {
      serverIds: [1, 2, 3],
      command: 'ls -la',
      timeout: 30000
    };
    
    const { error } = executeMultiServerCommandSchema.validate(validInput);
    expect(error).toBeUndefined();
  });
  
  test('devrait rejeter un tableau de serverIds vide', () => {
    const invalidInput = {
      serverIds: [],
      command: 'ls -la'
    };
    
    const { error } = executeMultiServerCommandSchema.validate(invalidInput);
    expect(error).toBeDefined();
    expect(error.details[0].type).toBe('array.min');
  });
  
  test('devrait rejeter une commande vide (string.empty)', () => {
    const invalidInput = {
      serverIds: [1, 2],
      command: ''
    };
    
    const { error } = executeMultiServerCommandSchema.validate(invalidInput);
    expect(error).toBeDefined();
    // Joi retourne 'string.empty' pour une string vide
    expect(error.details[0].type).toBe('string.empty');
  });
  
  test('devrait rejeter une commande trop longue', () => {
    const invalidInput = {
      serverIds: [1],
      command: 'x'.repeat(5001) // Dépasse la limite de 5000
    };
    
    const { error } = executeMultiServerCommandSchema.validate(invalidInput);
    expect(error).toBeDefined();
    expect(error.details[0].type).toBe('string.max');
  });
});

describe('Input Validation - SQL Injection Prevention', () => {
  test('devrait rejeter username avec tentative SQL injection', () => {
    const sqlInjectionInputs = [
      { username: "admin' OR '1'='1", password: 'test123456' },
      { username: "admin' OR 1=1--", password: 'test123456' },
      { username: "admin'; DROP TABLE users--", password: 'test123456' }
    ];
    
    sqlInjectionInputs.forEach(input => {
      const { error } = loginSchema.validate(input);
      expect(error).toBeDefined();
    });
  });
});

describe('Input Validation - XSS Prevention', () => {
  test('devrait rejeter username avec tentative XSS', () => {
    const xssInputs = [
      { username: 'admin<script>alert(1)</script>', password: 'test123456' },
      { username: 'admin<img src=x onerror=alert(1)>', password: 'test123456' },
      { username: 'admin<svg/onload=alert(1)>', password: 'test123456' }
    ];
    
    xssInputs.forEach(input => {
      const { error } = loginSchema.validate(input);
      expect(error).toBeDefined();
    });
  });
});
