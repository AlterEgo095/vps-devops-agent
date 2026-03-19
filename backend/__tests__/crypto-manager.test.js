/**
 * ============================================================
 * Tests Unitaires — CryptoManager
 * ============================================================
 * Vérifie le chiffrement/déchiffrement AES-256-CBC et la
 * rétrocompatibilité avec l'ancien format Base64.
 */

// Mock le logger AVANT d'importer le module
jest.mock('../../config/logger.js', () => ({
  default: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    http: jest.fn(),
  }
}));

// Définir JWT_SECRET pour les tests
process.env.JWT_SECRET = 'test-secret-at-least-32-characters-long-for-aes256';

import { encryptPassword, decryptPassword, isAESEncrypted, migrateFromBase64 } from '../../services/crypto-manager.js';

describe('CryptoManager', () => {
  
  // ============================================================
  // CHIFFREMENT AES-256-CBC
  // ============================================================
  describe('encryptPassword()', () => {
    test('chiffre un mot de passe en format iv:data', () => {
      const encrypted = encryptPassword('monMotDePasse123');
      expect(encrypted).toContain(':');
      const parts = encrypted.split(':');
      expect(parts).toHaveLength(2);
      expect(parts[0]).toMatch(/^[0-9a-f]{32}$/); // IV = 16 bytes = 32 hex
      expect(parts[1]).toMatch(/^[0-9a-f]+$/);
    });

    test('retourne chaîne vide pour input vide', () => {
      expect(encryptPassword('')).toBe('');
      expect(encryptPassword(null)).toBe('');
      expect(encryptPassword(undefined)).toBe('');
    });

    test('produit des résultats différents à chaque appel (IV aléatoire)', () => {
      const a = encryptPassword('test');
      const b = encryptPassword('test');
      expect(a).not.toBe(b); // IV différent = résultat différent
    });
  });

  // ============================================================
  // DÉCHIFFREMENT
  // ============================================================
  describe('decryptPassword()', () => {
    test('déchiffre correctement un mot de passe AES', () => {
      const original = 'SuperSecretPass!@#$%^&*()';
      const encrypted = encryptPassword(original);
      const decrypted = decryptPassword(encrypted);
      expect(decrypted).toBe(original);
    });

    test('gère les caractères spéciaux et unicode', () => {
      const original = 'P@$$w0rd_avec-des.spéciaux!';
      const encrypted = encryptPassword(original);
      const decrypted = decryptPassword(encrypted);
      expect(decrypted).toBe(original);
    });

    test('rétrocompatibilité Base64 (ancien format)', () => {
      // Simuler l'ancien format Base64
      const original = 'ancienMotDePasse';
      const base64 = Buffer.from(original).toString('base64');
      const decrypted = decryptPassword(base64);
      expect(decrypted).toBe(original);
    });

    test('retourne chaîne vide pour input vide', () => {
      expect(decryptPassword('')).toBe('');
      expect(decryptPassword(null)).toBe('');
      expect(decryptPassword(undefined)).toBe('');
    });

    test('round-trip: encrypt → decrypt = original', () => {
      const passwords = [
        'simple',
        'complex!@#$%',
        'très-long-mot-de-passe-avec-128-caractères-pour-tester-la-robustesse-du-système',
        '日本語パスワード',
        '   spaces   ',
      ];

      passwords.forEach(pwd => {
        const encrypted = encryptPassword(pwd);
        const decrypted = decryptPassword(encrypted);
        expect(decrypted).toBe(pwd);
      });
    });
  });

  // ============================================================
  // DÉTECTION DE FORMAT
  // ============================================================
  describe('isAESEncrypted()', () => {
    test('détecte le format AES (iv:data)', () => {
      const encrypted = encryptPassword('test');
      expect(isAESEncrypted(encrypted)).toBe(true);
    });

    test('rejette le Base64 simple', () => {
      const base64 = Buffer.from('test').toString('base64');
      expect(isAESEncrypted(base64)).toBe(false);
    });

    test('rejette null/undefined/vide', () => {
      expect(isAESEncrypted(null)).toBe(false);
      expect(isAESEncrypted(undefined)).toBe(false);
      expect(isAESEncrypted('')).toBe(false);
    });
  });

  // ============================================================
  // MIGRATION BASE64 → AES
  // ============================================================
  describe('migrateFromBase64()', () => {
    test('migre un mot de passe Base64 vers AES', () => {
      const original = 'monAncienPassword';
      const base64 = Buffer.from(original).toString('base64');
      const migrated = migrateFromBase64(base64);
      
      // Vérifier que c'est maintenant du AES
      expect(isAESEncrypted(migrated)).toBe(true);
      
      // Vérifier que le déchiffrement fonctionne
      expect(decryptPassword(migrated)).toBe(original);
    });

    test('ne re-migre pas un mot de passe déjà en AES', () => {
      const encrypted = encryptPassword('test');
      const migrated = migrateFromBase64(encrypted);
      expect(migrated).toBe(encrypted); // Identique = pas de double migration
    });

    test('gère les entrées vides', () => {
      expect(migrateFromBase64('')).toBe('');
      expect(migrateFromBase64(null)).toBe('');
    });
  });
});
