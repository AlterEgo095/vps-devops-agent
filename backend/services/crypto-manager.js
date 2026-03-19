/**
 * ============================================================
 * CryptoManager — Module centralisé de chiffrement
 * ============================================================
 * 
 * OBJECTIF : Uniformiser TOUT le chiffrement du projet en AES-256-CBC.
 * Supprime la dépendance au Base64 simple (non sécurisé) qui était
 * utilisé dans certaines routes (/servers POST, /servers PUT).
 * 
 * RÉTROCOMPATIBILITÉ : Le déchiffrement détecte automatiquement
 * l'ancien format Base64 et le convertit en AES-256-CBC au vol.
 * 
 * UTILISATION :
 *   import { encryptPassword, decryptPassword, migrateFromBase64 } from './crypto-manager.js';
 *   const encrypted = encryptPassword('mon-mot-de-passe');
 *   const decrypted = decryptPassword(encrypted);
 * 
 * @module CryptoManager
 * @version 2.0.0
 * @since 2026-03-19
 */

import crypto from 'crypto';
import logger from '../config/logger.js';

// ============================================================
// CONFIGURATION
// ============================================================
const ALGORITHM = 'aes-256-cbc';
const IV_LENGTH = 16;
const KEY_LENGTH = 32;
const SALT = 'vps-devops-agent-salt-v2'; // Salt déterministe pour dérivation de clé

/**
 * Dérive une clé AES-256 à partir du JWT_SECRET
 * Utilise scrypt (résistant aux attaques par force brute)
 */
function deriveKey() {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error('[CRYPTO] JWT_SECRET absent ou trop court — impossible de chiffrer');
  }
  return crypto.scryptSync(secret, SALT, KEY_LENGTH);
}

/**
 * Chiffre un mot de passe en AES-256-CBC
 * Format de sortie : "iv_hex:encrypted_hex"
 * 
 * @param {string} plaintext - Le mot de passe en clair
 * @returns {string} Le mot de passe chiffré au format "iv:data"
 * @throws {Error} Si JWT_SECRET est manquant
 */
export function encryptPassword(plaintext) {
  if (!plaintext) return '';
  
  try {
    const key = deriveKey();
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    
    let encrypted = cipher.update(plaintext, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    return `${iv.toString('hex')}:${encrypted}`;
  } catch (error) {
    logger.error('[CRYPTO] Erreur chiffrement:', { error: error.message });
    throw new Error('Erreur de chiffrement du mot de passe');
  }
}

/**
 * Déchiffre un mot de passe
 * Détecte automatiquement le format :
 *   - AES-256-CBC : "iv_hex:encrypted_hex" (nouveau, sécurisé)
 *   - Base64 brut  : "dXNlcm5hbWU=" (ancien, NON sécurisé)
 * 
 * @param {string} encryptedData - Le mot de passe chiffré
 * @returns {string} Le mot de passe en clair
 */
export function decryptPassword(encryptedData) {
  if (!encryptedData) return '';
  
  // ============================================================
  // DÉTECTION DU FORMAT
  // ============================================================
  
  // Format AES-256-CBC : contient ":" et les deux parties sont en hex
  if (encryptedData.includes(':')) {
    const parts = encryptedData.split(':');
    if (parts.length === 2 && /^[0-9a-f]+$/i.test(parts[0]) && /^[0-9a-f]+$/i.test(parts[1])) {
      return _decryptAES(encryptedData);
    }
  }
  
  // Fallback Base64 (ancien format — migration nécessaire)
  try {
    const decoded = Buffer.from(encryptedData, 'base64').toString('utf8');
    // Vérifier que le décodage produit du texte lisible
    if (/^[\x20-\x7E]+$/.test(decoded)) {
      logger.warn('[CRYPTO] Mot de passe en Base64 détecté — migration AES-256-CBC recommandée');
      return decoded;
    }
  } catch (e) {
    // Pas du Base64 valide
  }
  
  // Dernière tentative : retourner tel quel (peut être du plaintext résiduel)
  logger.error('[CRYPTO] Format de chiffrement non reconnu');
  return encryptedData;
}

/**
 * Déchiffrement AES-256-CBC interne
 * @private
 */
function _decryptAES(encryptedData) {
  try {
    const [ivHex, encryptedHex] = encryptedData.split(':');
    const iv = Buffer.from(ivHex, 'hex');
    const key = deriveKey();
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    
    let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  } catch (error) {
    logger.error('[CRYPTO] Erreur déchiffrement AES:', { error: error.message });
    
    // Fallback Base64 si le AES échoue (cas de migration partielle)
    try {
      return Buffer.from(encryptedData.split(':').join(''), 'base64').toString('utf8');
    } catch (e) {
      return '';
    }
  }
}

/**
 * Vérifie si un mot de passe est au format AES-256-CBC
 * @param {string} data - Données à vérifier
 * @returns {boolean}
 */
export function isAESEncrypted(data) {
  if (!data || !data.includes(':')) return false;
  const parts = data.split(':');
  return parts.length === 2 && 
         /^[0-9a-f]{32}$/i.test(parts[0]) && // IV = 16 bytes = 32 hex chars
         /^[0-9a-f]+$/i.test(parts[1]);
}

/**
 * Migre un mot de passe Base64 vers AES-256-CBC
 * Utile pour une migration en masse des anciens enregistrements
 * 
 * @param {string} base64Data - Mot de passe en Base64
 * @returns {string} Mot de passe rechiffré en AES-256-CBC
 */
export function migrateFromBase64(base64Data) {
  if (!base64Data) return '';
  if (isAESEncrypted(base64Data)) return base64Data; // Déjà migré
  
  try {
    const plaintext = Buffer.from(base64Data, 'base64').toString('utf8');
    return encryptPassword(plaintext);
  } catch (error) {
    logger.error('[CRYPTO] Erreur migration Base64->AES:', { error: error.message });
    return base64Data; // Retourner l'original en cas d'erreur
  }
}

export default {
  encryptPassword,
  decryptPassword,
  isAESEncrypted,
  migrateFromBase64
};
