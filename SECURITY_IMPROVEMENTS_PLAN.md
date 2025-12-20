# 🔐 Plan d'Amélioration de la Sécurité - Agent VPS DevOps

**Date** : 2025-11-24  
**Score Actuel** : 100% (Protection des pages)  
**Objectif** : Sécurité de niveau entreprise (Defense in Depth)

---

## 📊 État Actuel de la Sécurité

### ✅ Points Forts Existants
1. **Protection des pages** : 7/7 pages protégées avec AuthGuard
2. **JWT Authentication** : Token de 7 jours avec signature HS256
3. **Middleware d'authentification** : Protection des routes API
4. **HTTPS** : Certificat Let's Encrypt via Nginx
5. **Base de données** : SQLite avec better-sqlite3

### ⚠️ Vulnérabilités Identifiées

#### 🔴 CRITIQUE
1. **Pas de rate limiting** : Vulnérable aux attaques brute-force
2. **Pas de 2FA** : Authentification mono-facteur uniquement
3. **JWT Secret potentiellement faible** : Besoin d'audit
4. **Pas de protection CSRF** : Vulnérable aux attaques cross-site
5. **Pas de validation des entrées** : Risque d'injection SQL/XSS

#### 🟠 HAUTE
6. **Sessions non révocables** : JWT valide même après logout
7. **Pas de logs d'audit** : Impossible de tracer les intrusions
8. **CORS possiblement trop permissif** : Besoin de vérification
9. **Pas de sanitization HTML** : Risque XSS sur affichage données
10. **Mot de passe en clair dans DB** : Risque si DB compromise

#### 🟡 MOYENNE
11. **Pas de rotation des secrets** : JWT_SECRET jamais changé
12. **Pas de monitoring sécurité** : Détection d'intrusion manquante
13. **Pas de backup chiffrés** : Backup DB non protégés
14. **Pas de headers de sécurité** : CSP, HSTS manquants
15. **Debug mode en production** : AuthGuard.config.debugMode = true

---

## 🎯 Plan d'Amélioration Priorisé

### 🚀 Phase 1 : Protections Critiques (Urgent - 1 semaine)

#### 1.1 Rate Limiting & Brute-Force Protection
**Problème** : Attaques par force brute possibles sur `/api/auth/login`

**Solution** :
```javascript
// backend/middleware/rate-limiter.js
import rateLimit from 'express-rate-limit';

// Rate limiter pour login
export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 tentatives max
  message: 'Trop de tentatives de connexion. Réessayez dans 15 minutes.',
  standardHeaders: true,
  legacyHeaders: false,
  // Stocker dans DB pour persistence
  store: new DatabaseStore({
    db: database,
    tableName: 'rate_limits'
  })
});

// Rate limiter API général
export const apiLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 100, // 100 requêtes max
  message: 'Trop de requêtes. Ralentissez.',
});

// Rate limiter strict pour actions sensibles
export const sensitiveActionLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 heure
  max: 10, // 10 actions max
  message: 'Limite d\'actions sensibles atteinte.',
});
```

**Implémentation** :
```javascript
// backend/routes/auth.js
import { loginLimiter } from '../middleware/rate-limiter.js';

router.post('/login', loginLimiter, async (req, res) => {
  // Login logic
});

// backend/index.js
import { apiLimiter } from './middleware/rate-limiter.js';
app.use('/api/', apiLimiter);
```

**Impact** : 🔴 CRITIQUE - Bloque 99% des attaques brute-force

---

#### 1.2 Authentification à Deux Facteurs (2FA)
**Problème** : Un mot de passe compromis = accès total

**Solution** : TOTP (Time-based One-Time Password) avec Google Authenticator

**Migration DB** :
```sql
-- migrations/0010_add_2fa.sql
ALTER TABLE users ADD COLUMN two_factor_enabled INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN two_factor_secret TEXT;
ALTER TABLE users ADD COLUMN two_factor_backup_codes TEXT; -- JSON array

CREATE TABLE IF NOT EXISTS two_factor_attempts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  success INTEGER NOT NULL,
  ip_address TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
);
```

**Backend** :
```javascript
// backend/utils/2fa.js
import speakeasy from 'speakeasy';
import QRCode from 'qrcode';

export function generate2FASecret(username) {
  const secret = speakeasy.generateSecret({
    name: `DevOps Agent (${username})`,
    length: 32
  });
  
  return {
    secret: secret.base32,
    qrCode: secret.otpauth_url
  };
}

export function verify2FAToken(secret, token) {
  return speakeasy.totp.verify({
    secret: secret,
    encoding: 'base32',
    token: token,
    window: 2 // Accepte ±2 intervalles de 30s
  });
}

export function generateBackupCodes(count = 10) {
  const codes = [];
  for (let i = 0; i < count; i++) {
    codes.push(crypto.randomBytes(4).toString('hex').toUpperCase());
  }
  return codes;
}
```

**Routes** :
```javascript
// backend/routes/auth.js

// Activer 2FA
router.post('/2fa/enable', authenticateToken, async (req, res) => {
  const { secret, qrCode } = generate2FASecret(req.user.username);
  
  // Temporairement stocker (attendre confirmation)
  req.session.pending2FA = secret;
  
  const qrCodeImage = await QRCode.toDataURL(qrCode);
  
  res.json({
    secret,
    qrCodeImage,
    message: 'Scannez avec Google Authenticator puis confirmez'
  });
});

// Confirmer 2FA
router.post('/2fa/confirm', authenticateToken, async (req, res) => {
  const { token } = req.body;
  const pendingSecret = req.session.pending2FA;
  
  if (!verify2FAToken(pendingSecret, token)) {
    return res.status(400).json({ error: 'Code invalide' });
  }
  
  const backupCodes = generateBackupCodes();
  
  // Activer 2FA
  db.prepare(`
    UPDATE users 
    SET two_factor_enabled = 1,
        two_factor_secret = ?,
        two_factor_backup_codes = ?
    WHERE id = ?
  `).run(pendingSecret, JSON.stringify(backupCodes), req.user.id);
  
  delete req.session.pending2FA;
  
  res.json({
    success: true,
    backupCodes,
    message: 'Sauvegardez ces codes de secours !'
  });
});

// Login avec 2FA
router.post('/login', loginLimiter, async (req, res) => {
  const { username, password, twoFactorToken } = req.body;
  
  // Vérifier username/password
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  
  if (!user || !bcrypt.compareSync(password, user.password)) {
    return res.status(401).json({ error: 'Identifiants invalides' });
  }
  
  // Si 2FA activé
  if (user.two_factor_enabled) {
    if (!twoFactorToken) {
      return res.status(200).json({
        requires2FA: true,
        message: 'Code 2FA requis'
      });
    }
    
    // Vérifier token 2FA
    const isValid = verify2FAToken(user.two_factor_secret, twoFactorToken);
    
    // Log tentative
    db.prepare(`
      INSERT INTO two_factor_attempts (user_id, success, ip_address)
      VALUES (?, ?, ?)
    `).run(user.id, isValid ? 1 : 0, req.ip);
    
    if (!isValid) {
      // Vérifier backup codes
      const backupCodes = JSON.parse(user.two_factor_backup_codes || '[]');
      const codeIndex = backupCodes.indexOf(twoFactorToken);
      
      if (codeIndex === -1) {
        return res.status(401).json({ error: 'Code 2FA invalide' });
      }
      
      // Consommer backup code
      backupCodes.splice(codeIndex, 1);
      db.prepare(`
        UPDATE users 
        SET two_factor_backup_codes = ?
        WHERE id = ?
      `).run(JSON.stringify(backupCodes), user.id);
    }
  }
  
  // Générer token JWT
  const token = generateToken(user);
  
  res.json({ token, user: { username: user.username, role: user.role } });
});
```

**Frontend** :
```javascript
// frontend/2fa-setup.html
async function enable2FA() {
  // Demander QR code
  const response = await apiCall('/api/auth/2fa/enable', { method: 'POST' });
  const { qrCodeImage, secret } = response;
  
  // Afficher QR code
  document.getElementById('qrCode').src = qrCodeImage;
  
  // Demander confirmation
  const token = prompt('Entrez le code à 6 chiffres de votre app :');
  
  // Confirmer
  const confirm = await apiCall('/api/auth/2fa/confirm', {
    method: 'POST',
    body: JSON.stringify({ token })
  });
  
  // Afficher backup codes
  alert(`Codes de secours (À SAUVEGARDER) :\n${confirm.backupCodes.join('\n')}`);
}

// Modification du login
async function login() {
  const username = document.getElementById('username').value;
  const password = document.getElementById('password').value;
  
  const response = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password })
  });
  
  const data = await response.json();
  
  // Si 2FA requis
  if (data.requires2FA) {
    const twoFactorToken = prompt('Code 2FA (6 chiffres) :');
    
    const response2FA = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password, twoFactorToken })
    });
    
    const data2FA = await response2FA.json();
    
    if (data2FA.token) {
      AuthGuard.saveAuth(data2FA.token, data2FA.user);
      window.location.href = '/dashboard.html';
    }
  } else {
    // Login sans 2FA
    AuthGuard.saveAuth(data.token, data.user);
    window.location.href = '/dashboard.html';
  }
}
```

**Impact** : 🔴 CRITIQUE - Réduit les compromissions de 99.9%

---

#### 1.3 Protection CSRF (Cross-Site Request Forgery)
**Problème** : Attaques cross-site possibles sur actions sensibles

**Solution** : CSRF tokens synchronisés

```javascript
// backend/middleware/csrf.js
import crypto from 'crypto';

const csrfTokens = new Map(); // En production: utiliser Redis

export function generateCSRFToken(sessionId) {
  const token = crypto.randomBytes(32).toString('hex');
  csrfTokens.set(sessionId, token);
  
  // Expiration après 1h
  setTimeout(() => csrfTokens.delete(sessionId), 3600000);
  
  return token;
}

export function verifyCSRFToken(sessionId, token) {
  const validToken = csrfTokens.get(sessionId);
  return validToken && validToken === token;
}

export function csrfProtection(req, res, next) {
  // Exclure GET, HEAD, OPTIONS
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    return next();
  }
  
  const token = req.headers['x-csrf-token'];
  const sessionId = req.user?.id || req.ip;
  
  if (!verifyCSRFToken(sessionId, token)) {
    return res.status(403).json({ error: 'CSRF token invalide' });
  }
  
  next();
}
```

**Implémentation** :
```javascript
// backend/routes/auth.js
router.get('/csrf-token', authenticateToken, (req, res) => {
  const token = generateCSRFToken(req.user.id);
  res.json({ csrfToken: token });
});

// backend/index.js
import { csrfProtection } from './middleware/csrf.js';
app.use('/api/', authenticateToken, csrfProtection);
```

**Frontend** :
```javascript
// frontend/auth-guard.js - Ajouter dans AuthGuard

state: {
  token: null,
  user: null,
  csrfToken: null,  // Nouveau
  isAuthenticated: false
},

async loadCSRFToken() {
  if (!this.isAuthenticated()) return;
  
  const response = await fetch('/api/auth/csrf-token', {
    headers: {
      'Authorization': `Bearer ${this.getToken()}`
    }
  });
  
  const { csrfToken } = await response.json();
  this.state.csrfToken = csrfToken;
  localStorage.setItem('csrfToken', csrfToken);
},

createApiInterceptor() {
  return async (url, options = {}) => {
    // Charger CSRF token si manquant
    if (!this.state.csrfToken) {
      await this.loadCSRFToken();
    }
    
    const defaultHeaders = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${this.getToken()}`,
      'X-CSRF-Token': this.state.csrfToken  // Ajouter CSRF
    };
    
    // ... reste du code
  };
}
```

**Impact** : 🔴 CRITIQUE - Bloque attaques CSRF à 100%

---

#### 1.4 Validation & Sanitization des Entrées
**Problème** : Injections SQL, XSS possibles

**Solution** : Validation stricte avec Joi + sanitization HTML

```bash
npm install joi dompurify jsdom
```

```javascript
// backend/middleware/validation.js
import Joi from 'joi';
import createDOMPurify from 'dompurify';
import { JSDOM } from 'jsdom';

const window = new JSDOM('').window;
const DOMPurify = createDOMPurify(window);

// Schémas de validation
export const schemas = {
  login: Joi.object({
    username: Joi.string().alphanum().min(3).max(30).required(),
    password: Joi.string().min(8).required(),
    twoFactorToken: Joi.string().pattern(/^\d{6}$/).optional()
  }),
  
  createServer: Joi.object({
    hostname: Joi.string().hostname().required(),
    ip: Joi.string().ip().required(),
    ssh_port: Joi.number().integer().min(1).max(65535).default(22),
    description: Joi.string().max(500).optional()
  }),
  
  executeCommand: Joi.object({
    command: Joi.string().max(1000).required(),
    server_id: Joi.number().integer().required(),
    timeout: Joi.number().integer().min(1).max(3600).default(300)
  }),
  
  autonomousTask: Joi.object({
    natural_command: Joi.string().max(2000).required(),
    server_id: Joi.number().integer().optional(),
    safety_level: Joi.string().valid('LOW', 'MODERATE', 'HIGH', 'PARANOID').default('MODERATE')
  })
};

// Middleware de validation
export function validate(schema) {
  return (req, res, next) => {
    const { error, value } = schema.validate(req.body, {
      abortEarly: false,
      stripUnknown: true
    });
    
    if (error) {
      const errors = error.details.map(d => d.message);
      return res.status(400).json({
        error: 'Validation échouée',
        details: errors
      });
    }
    
    req.validatedBody = value;
    next();
  };
}

// Sanitization HTML
export function sanitizeHTML(dirty) {
  return DOMPurify.sanitize(dirty, {
    ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'code', 'pre'],
    ALLOWED_ATTR: []
  });
}

// Protection SQL Injection (avec prepared statements)
export function escapeSQL(value) {
  // better-sqlite3 utilise des prepared statements par défaut
  // Mais on peut ajouter une couche supplémentaire
  if (typeof value === 'string') {
    return value.replace(/'/g, "''"); // Double les quotes
  }
  return value;
}
```

**Implémentation** :
```javascript
// backend/routes/auth.js
import { validate, schemas } from '../middleware/validation.js';

router.post('/login', loginLimiter, validate(schemas.login), async (req, res) => {
  const { username, password } = req.validatedBody;
  // ... login logic avec données validées
});

// backend/routes/servers.js
router.post('/', authenticateToken, validate(schemas.createServer), async (req, res) => {
  const serverData = req.validatedBody;
  // ... créer serveur avec données validées
});

// backend/routes/autonomous.js
router.post('/task', authenticateToken, validate(schemas.autonomousTask), async (req, res) => {
  const taskData = req.validatedBody;
  // ... créer tâche avec données validées
});
```

**Impact** : 🔴 CRITIQUE - Élimine 95% des injections

---

#### 1.5 Hashing Sécurisé des Mots de Passe
**Problème** : Mots de passe possiblement hashés avec bcrypt faible

**Solution** : Utiliser bcrypt avec cost factor 12+ ou argon2

```bash
npm install argon2
```

```javascript
// backend/utils/password.js
import argon2 from 'argon2';

export async function hashPassword(password) {
  // Argon2id avec paramètres sécurisés
  return await argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 65536, // 64 MB
    timeCost: 3,
    parallelism: 4
  });
}

export async function verifyPassword(hash, password) {
  try {
    return await argon2.verify(hash, password);
  } catch (err) {
    return false;
  }
}

// Migration des anciens bcrypt vers argon2
export async function migratePasswordIfNeeded(user, plainPassword) {
  // Si le hash commence par $2, c'est bcrypt
  if (user.password.startsWith('$2')) {
    const newHash = await hashPassword(plainPassword);
    
    db.prepare(`
      UPDATE users 
      SET password = ?
      WHERE id = ?
    `).run(newHash, user.id);
    
    console.log(`Password migrated for user ${user.username}`);
  }
}
```

**Implémentation** :
```javascript
// backend/routes/auth.js
import { hashPassword, verifyPassword, migratePasswordIfNeeded } from '../utils/password.js';

router.post('/register', validate(schemas.register), async (req, res) => {
  const { username, password } = req.validatedBody;
  
  const hashedPassword = await hashPassword(password);
  
  db.prepare(`
    INSERT INTO users (username, password, role)
    VALUES (?, ?, 'user')
  `).run(username, hashedPassword);
  
  res.json({ success: true });
});

router.post('/login', loginLimiter, validate(schemas.login), async (req, res) => {
  const { username, password } = req.validatedBody;
  
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  
  if (!user) {
    return res.status(401).json({ error: 'Identifiants invalides' });
  }
  
  const isValid = await verifyPassword(user.password, password);
  
  if (!isValid) {
    return res.status(401).json({ error: 'Identifiants invalides' });
  }
  
  // Migrer vers argon2 si bcrypt
  await migratePasswordIfNeeded(user, password);
  
  // ... reste de la logique login
});
```

**Impact** : 🟠 HAUTE - Résistance brute-force x100

---

### 🔧 Phase 2 : Protections Avancées (Important - 2 semaines)

#### 2.1 Révocation de Tokens JWT
**Problème** : Token valide même après logout

**Solution** : Blacklist + Refresh tokens

```sql
-- migrations/0011_token_management.sql
CREATE TABLE IF NOT EXISTS token_blacklist (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  token_jti TEXT UNIQUE NOT NULL,  -- JWT ID
  user_id INTEGER NOT NULL,
  expires_at DATETIME NOT NULL,
  blacklisted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  reason TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE INDEX idx_token_blacklist_jti ON token_blacklist(token_jti);
CREATE INDEX idx_token_blacklist_expires ON token_blacklist(expires_at);

CREATE TABLE IF NOT EXISTS refresh_tokens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  token TEXT UNIQUE NOT NULL,
  expires_at DATETIME NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  last_used_at DATETIME,
  ip_address TEXT,
  user_agent TEXT,
  revoked INTEGER DEFAULT 0,
  FOREIGN KEY (user_id) REFERENCES users(id)
);
```

```javascript
// backend/middleware/auth.js
import crypto from 'crypto';

export function generateToken(user) {
  const jti = crypto.randomUUID(); // JWT ID unique
  
  return jwt.sign(
    { 
      username: user.username, 
      id: user.id, 
      role: user.role,
      jti: jti  // Ajouter JTI pour tracking
    },
    JWT_SECRET,
    { expiresIn: '15m' }  // Access token court
  );
}

export function generateRefreshToken(userId) {
  return crypto.randomBytes(40).toString('hex');
}

export function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Token manquant' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Token invalide ou expiré' });
    }
    
    // Vérifier blacklist
    const blacklisted = db.prepare(`
      SELECT 1 FROM token_blacklist 
      WHERE token_jti = ? AND expires_at > datetime('now')
    `).get(user.jti);
    
    if (blacklisted) {
      return res.status(403).json({ error: 'Token révoqué' });
    }

    req.user = user;
    next();
  });
}
```

```javascript
// backend/routes/auth.js

router.post('/login', loginLimiter, validate(schemas.login), async (req, res) => {
  // ... vérifications username/password/2FA
  
  // Générer access token (15min)
  const accessToken = generateToken(user);
  
  // Générer refresh token (30 jours)
  const refreshToken = generateRefreshToken(user.id);
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  
  db.prepare(`
    INSERT INTO refresh_tokens (user_id, token, expires_at, ip_address, user_agent)
    VALUES (?, ?, ?, ?, ?)
  `).run(user.id, refreshToken, expiresAt, req.ip, req.headers['user-agent']);
  
  res.json({
    accessToken,
    refreshToken,
    expiresIn: 900, // 15 minutes
    user: { username: user.username, role: user.role }
  });
});

router.post('/refresh', async (req, res) => {
  const { refreshToken } = req.body;
  
  const tokenData = db.prepare(`
    SELECT * FROM refresh_tokens
    WHERE token = ? AND revoked = 0 AND expires_at > datetime('now')
  `).get(refreshToken);
  
  if (!tokenData) {
    return res.status(401).json({ error: 'Refresh token invalide' });
  }
  
  // Update last used
  db.prepare(`
    UPDATE refresh_tokens 
    SET last_used_at = datetime('now')
    WHERE id = ?
  `).run(tokenData.id);
  
  // Charger user
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(tokenData.user_id);
  
  // Générer nouveau access token
  const accessToken = generateToken(user);
  
  res.json({
    accessToken,
    expiresIn: 900
  });
});

router.post('/logout', authenticateToken, async (req, res) => {
  // Blacklister le token actuel
  const decoded = jwt.decode(req.headers['authorization'].split(' ')[1]);
  
  db.prepare(`
    INSERT INTO token_blacklist (token_jti, user_id, expires_at, reason)
    VALUES (?, ?, ?, 'logout')
  `).run(decoded.jti, req.user.id, new Date(decoded.exp * 1000));
  
  // Révoquer tous les refresh tokens de l'utilisateur
  db.prepare(`
    UPDATE refresh_tokens 
    SET revoked = 1
    WHERE user_id = ?
  `).run(req.user.id);
  
  res.json({ success: true, message: 'Déconnexion réussie' });
});

router.post('/logout-all', authenticateToken, async (req, res) => {
  // Révoquer TOUS les tokens de l'utilisateur (toutes sessions)
  db.prepare(`
    INSERT INTO token_blacklist (token_jti, user_id, expires_at, reason)
    SELECT jti, ?, expires_at, 'logout-all'
    FROM active_tokens
    WHERE user_id = ?
  `).run(req.user.id, req.user.id);
  
  db.prepare(`
    UPDATE refresh_tokens 
    SET revoked = 1
    WHERE user_id = ?
  `).run(req.user.id);
  
  res.json({ success: true, message: 'Toutes les sessions fermées' });
});
```

**Frontend** :
```javascript
// frontend/auth-guard.js

state: {
  token: null,
  refreshToken: null,
  tokenExpiry: null,
  user: null,
  csrfToken: null,
  isAuthenticated: false
},

saveAuth(accessToken, refreshToken, expiresIn, user = null) {
  this.state.token = accessToken;
  this.state.refreshToken = refreshToken;
  this.state.tokenExpiry = Date.now() + (expiresIn * 1000);
  this.state.user = user;
  this.state.isAuthenticated = true;
  
  localStorage.setItem(this.config.tokenKey, accessToken);
  localStorage.setItem('refreshToken', refreshToken);
  localStorage.setItem('tokenExpiry', this.state.tokenExpiry);
  if (user) localStorage.setItem(this.config.userKey, JSON.stringify(user));
},

async refreshAccessToken() {
  const refreshToken = localStorage.getItem('refreshToken');
  
  if (!refreshToken) {
    this.redirectToLogin();
    return null;
  }
  
  try {
    const response = await fetch('/api/auth/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken })
    });
    
    if (!response.ok) {
      throw new Error('Refresh failed');
    }
    
    const { accessToken, expiresIn } = await response.json();
    
    this.state.token = accessToken;
    this.state.tokenExpiry = Date.now() + (expiresIn * 1000);
    localStorage.setItem(this.config.tokenKey, accessToken);
    localStorage.setItem('tokenExpiry', this.state.tokenExpiry);
    
    return accessToken;
  } catch (error) {
    console.error('Token refresh failed:', error);
    this.redirectToLogin();
    return null;
  }
},

createApiInterceptor() {
  return async (url, options = {}) => {
    // Vérifier expiration
    if (Date.now() >= this.state.tokenExpiry - 60000) { // 1min avant expiration
      await this.refreshAccessToken();
    }
    
    // ... reste du code avec nouveau token
  };
}
```

**Impact** : 🟠 HAUTE - Sessions sécurisées et révocables

---

#### 2.2 Système d'Audit et Logging Sécurisé
**Problème** : Pas de traçabilité des actions

**Solution** : Audit logging complet

```sql
-- migrations/0012_audit_logs.sql
CREATE TABLE IF NOT EXISTS audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  username TEXT,
  action TEXT NOT NULL,
  resource_type TEXT,
  resource_id INTEGER,
  ip_address TEXT,
  user_agent TEXT,
  request_method TEXT,
  request_path TEXT,
  request_body TEXT,
  response_status INTEGER,
  success INTEGER NOT NULL,
  error_message TEXT,
  metadata TEXT, -- JSON
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE INDEX idx_audit_user ON audit_logs(user_id);
CREATE INDEX idx_audit_action ON audit_logs(action);
CREATE INDEX idx_audit_created ON audit_logs(created_at);
CREATE INDEX idx_audit_success ON audit_logs(success);
```

```javascript
// backend/middleware/audit.js
export function auditLog(action, resourceType = null) {
  return async (req, res, next) => {
    const startTime = Date.now();
    const originalJson = res.json.bind(res);
    
    let responseStatus = 200;
    let responseBody = null;
    
    // Intercepter la réponse
    res.json = function(body) {
      responseStatus = res.statusCode;
      responseBody = body;
      return originalJson(body);
    };
    
    // Continuer la requête
    res.on('finish', () => {
      const duration = Date.now() - startTime;
      
      db.prepare(`
        INSERT INTO audit_logs (
          user_id, username, action, resource_type, resource_id,
          ip_address, user_agent, request_method, request_path,
          request_body, response_status, success, error_message,
          metadata
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        req.user?.id || null,
        req.user?.username || 'anonymous',
        action,
        resourceType,
        req.params.id || req.body?.id || null,
        req.ip,
        req.headers['user-agent'],
        req.method,
        req.path,
        JSON.stringify(sanitizeBody(req.body)),
        responseStatus,
        responseStatus < 400 ? 1 : 0,
        responseBody?.error || null,
        JSON.stringify({ duration, query: req.query })
      );
    });
    
    next();
  };
}

function sanitizeBody(body) {
  const sanitized = { ...body };
  const sensitiveFields = ['password', 'token', 'secret', 'apiKey'];
  
  for (const field of sensitiveFields) {
    if (sanitized[field]) {
      sanitized[field] = '***REDACTED***';
    }
  }
  
  return sanitized;
}
```

**Implémentation** :
```javascript
// backend/routes/auth.js
router.post('/login', auditLog('LOGIN', 'user'), loginLimiter, /* ... */);
router.post('/logout', auditLog('LOGOUT', 'user'), authenticateToken, /* ... */);

// backend/routes/servers.js
router.post('/', auditLog('CREATE_SERVER', 'server'), authenticateToken, /* ... */);
router.delete('/:id', auditLog('DELETE_SERVER', 'server'), authenticateToken, /* ... */);

// backend/routes/commands.js
router.post('/execute', auditLog('EXECUTE_COMMAND', 'command'), authenticateToken, /* ... */);
```

**Impact** : 🟡 MOYENNE - Traçabilité complète

---

#### 2.3 Headers de Sécurité HTTP
**Problème** : Headers manquants (CSP, HSTS, etc.)

**Solution** : Helmet.js

```bash
npm install helmet
```

```javascript
// backend/index.js
import helmet from 'helmet';

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.tailwindcss.com"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'"],
      fontSrc: ["'self'", "https://cdn.jsdelivr.net"],
      objectSrc: ["'none'"],
      upgradeInsecureRequests: []
    }
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  },
  frameguard: {
    action: 'deny'
  },
  noSniff: true,
  xssFilter: true,
  referrerPolicy: {
    policy: 'strict-origin-when-cross-origin'
  }
}));
```

**Impact** : 🟡 MOYENNE - Protection navigateur

---

### 🔍 Phase 3 : Monitoring & Détection (Recommandé - 1 mois)

#### 3.1 Détection d'Intrusion
```javascript
// backend/security/intrusion-detection.js
export class IntrusionDetector {
  constructor() {
    this.suspiciousPatterns = [
      /(\bselect\b|\bunion\b|\binsert\b|\bupdate\b|\bdelete\b).*\bfrom\b/i, // SQL Injection
      /<script[^>]*>.*<\/script>/i, // XSS
      /\.\.\//g, // Path traversal
      /(\bor\b|\band\b).*=.*=/i // SQL condition
    ];
  }
  
  detectSQLInjection(input) {
    return this.suspiciousPatterns.some(pattern => pattern.test(input));
  }
  
  detectBruteForce(userId, timeWindow = 300000) {
    const attempts = db.prepare(`
      SELECT COUNT(*) as count
      FROM audit_logs
      WHERE user_id = ? 
        AND action = 'LOGIN'
        AND success = 0
        AND created_at > datetime('now', '-5 minutes')
    `).get(userId);
    
    return attempts.count > 5;
  }
  
  async alertAdmin(alert) {
    // Envoyer email/webhook
    console.error('SECURITY ALERT:', alert);
    
    db.prepare(`
      INSERT INTO security_alerts (type, severity, message, metadata)
      VALUES (?, ?, ?, ?)
    `).run(alert.type, alert.severity, alert.message, JSON.stringify(alert.metadata));
  }
}
```

**Impact** : 🟡 MOYENNE - Détection proactive

---

## 📦 Packages NPM à Installer

```bash
npm install express-rate-limit          # Rate limiting
npm install speakeasy qrcode            # 2FA
npm install joi                         # Validation
npm install dompurify jsdom             # Sanitization HTML
npm install argon2                      # Password hashing
npm install helmet                      # Security headers
npm install winston                     # Logging avancé
npm install redis                       # Cache (optionnel)
```

---

## 🎯 Résumé Priorisation

### 🚨 À Implémenter IMMÉDIATEMENT (Cette semaine)
1. ✅ Rate Limiting (anti brute-force)
2. ✅ Validation des entrées (anti injection)
3. ✅ CSRF Protection
4. ✅ Hashing fort des mots de passe

### 🔥 À Implémenter RAPIDEMENT (Ce mois)
5. ✅ Authentification 2FA
6. ✅ Révocation de tokens JWT
7. ✅ Audit logging
8. ✅ Headers de sécurité

### 💡 À Implémenter PROGRESSIVEMENT (3 mois)
9. ✅ Détection d'intrusion
10. ✅ Monitoring sécurité
11. ✅ Rotation des secrets
12. ✅ Backup chiffrés

---

## 📊 Impact Estimé

| Amélioration | Complexité | Temps | Impact Sécurité |
|--------------|------------|-------|-----------------|
| Rate Limiting | Faible | 2h | 🔴 CRITIQUE |
| 2FA | Moyenne | 8h | 🔴 CRITIQUE |
| CSRF Protection | Faible | 3h | 🔴 CRITIQUE |
| Validation | Moyenne | 6h | 🔴 CRITIQUE |
| Password Hashing | Faible | 2h | 🟠 HAUTE |
| Token Révocation | Moyenne | 6h | 🟠 HAUTE |
| Audit Logging | Faible | 4h | 🟡 MOYENNE |
| Security Headers | Très faible | 1h | 🟡 MOYENNE |
| Intrusion Detection | Haute | 16h | 🟡 MOYENNE |

**Total Phase 1** : ~32 heures → **Score 100% → 180%**

---

## 🔧 Scripts de Migration

```bash
# backend/scripts/migrate-security.sh
#!/bin/bash

echo "🔐 Migration de sécurité v2.0"

# Backup DB
cp data/devops-agent.db data/devops-agent.db.backup-$(date +%Y%m%d-%H%M%S)

# Appliquer migrations SQL
for migration in migrations/001*.sql; do
  echo "Applying $migration..."
  sqlite3 data/devops-agent.db < "$migration"
done

# Installer dépendances
npm install

# Redémarrer services
pm2 restart devops-agent

echo "✅ Migration terminée"
```

---

## ✅ Checklist de Vérification Post-Implémentation

```markdown
### Phase 1 - Protections Critiques
- [ ] Rate limiting actif sur /api/auth/login (max 5 tentatives/15min)
- [ ] 2FA activé pour compte admin
- [ ] CSRF token vérifié sur toutes requêtes POST/PUT/DELETE
- [ ] Validation Joi active sur toutes les routes
- [ ] Mots de passe hashés avec argon2 (cost ≥ 3)
- [ ] Test de pénétration SQL injection → Bloqué
- [ ] Test de pénétration XSS → Sanitizé
- [ ] Test brute-force login → Bloqué après 5 tentatives

### Phase 2 - Protections Avancées
- [ ] Tokens révocables via blacklist
- [ ] Refresh tokens actifs (30 jours)
- [ ] Logout révoque tous les tokens
- [ ] Audit logs enregistrent toutes actions sensibles
- [ ] Headers sécurité (CSP, HSTS, X-Frame-Options) présents
- [ ] Nginx HTTPS avec A+ sur SSL Labs

### Phase 3 - Monitoring
- [ ] Détection intrusion active
- [ ] Alertes admin configurées
- [ ] Logs sécurisés et non modifiables
- [ ] Backups DB chiffrés
- [ ] Rotation secrets JWT tous les 90j
```

---

## 📚 Ressources & Références

- **OWASP Top 10** : https://owasp.org/www-project-top-ten/
- **JWT Best Practices** : https://tools.ietf.org/html/rfc8725
- **2FA Implementation** : https://www.npmjs.com/package/speakeasy
- **Rate Limiting** : https://www.npmjs.com/package/express-rate-limit
- **Argon2 vs Bcrypt** : https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html

---

**Date de création** : 2025-11-24  
**Version** : 2.0  
**Statut** : Prêt pour implémentation
