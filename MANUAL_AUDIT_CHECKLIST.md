# 🔍 Checklist d'Audit Manuel de Sécurité

**Projet**: VPS DevOps Agent  
**Date**: 2025-11-24  
**Auditeur**: _________________  
**Version**: 1.0

---

## 📋 Instructions d'Utilisation

1. **Exécutez d'abord le script automatisé** : `bash security-audit.sh`
2. **Complétez cette checklist manuellement** pour les points non automatisables
3. **Cochez ✅** les points conformes, **❌** les points non conformes
4. **Ajoutez des notes** dans la colonne "Observations"

---

## 🔐 1. AUTHENTIFICATION & SESSIONS

### 1.1 JWT Configuration

| # | Point de Vérification | Statut | Observations |
|---|----------------------|--------|--------------|
| 1.1.1 | JWT_SECRET fait ≥64 caractères | ⬜ |  |
| 1.1.2 | JWT_SECRET généré aléatoirement (pas "secret123") | ⬜ |  |
| 1.1.3 | JWT_SECRET stocké dans .env (pas en dur dans code) | ⬜ |  |
| 1.1.4 | Token expiration ≤7 jours | ⬜ |  |
| 1.1.5 | Algorithme JWT = RS256 ou HS256 (pas "none") | ⬜ |  |
| 1.1.6 | Token inclut JWT ID (jti) pour révocation | ⬜ |  |
| 1.1.7 | Payload JWT minimal (pas de données sensibles) | ⬜ |  |

**Notes critiques** :
```
Fichier à vérifier: /opt/vps-devops-agent/backend/middleware/auth.js

Commandes:
  grep -n "JWT_SECRET" backend/.env
  grep -n "expiresIn" backend/middleware/auth.js
  grep -n "algorithm" backend/middleware/auth.js
```

---

### 1.2 Authentification à Deux Facteurs (2FA)

| # | Point de Vérification | Statut | Observations |
|---|----------------------|--------|--------------|
| 1.2.1 | 2FA implémenté (TOTP) | ⬜ |  |
| 1.2.2 | Codes backup générés (10 codes min) | ⬜ |  |
| 1.2.3 | QR code généré pour Google Authenticator | ⬜ |  |
| 1.2.4 | Tentatives 2FA limitées (max 3 échecs) | ⬜ |  |
| 1.2.5 | Secret 2FA stocké chiffré en DB | ⬜ |  |
| 1.2.6 | 2FA obligatoire pour admin | ⬜ |  |
| 1.2.7 | Table two_factor_attempts existe | ⬜ |  |

**Code à vérifier** :
```sql
-- Vérifier tables
SELECT name FROM sqlite_master WHERE type='table' AND name LIKE '%2fa%';
SELECT name FROM sqlite_master WHERE type='table' AND name LIKE '%two_factor%';

-- Vérifier colonnes users
PRAGMA table_info(users);
```

---

### 1.3 Gestion des Mots de Passe

| # | Point de Vérification | Statut | Observations |
|---|----------------------|--------|--------------|
| 1.3.1 | Hashing = Argon2id (ou bcrypt cost≥12) | ⬜ |  |
| 1.3.2 | Aucun mot de passe en clair dans DB | ⬜ |  |
| 1.3.3 | Validation longueur min 8 caractères | ⬜ |  |
| 1.3.4 | Exigence complexité (maj, min, chiffre, symbole) | ⬜ |  |
| 1.3.5 | Pas de limitation longueur max (accepte 128+ chars) | ⬜ |  |
| 1.3.6 | Reset password sécurisé (token unique temporaire) | ⬜ |  |
| 1.3.7 | Anciens mots de passe non réutilisables (historique) | ⬜ |  |

**Tests manuels** :
```bash
# Tester création compte avec password faible
curl -X POST https://devops.aenews.net/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"username":"test","password":"123"}'
# Devrait être rejeté

# Vérifier hash en DB
sqlite3 data/devops-agent.db "SELECT password FROM users LIMIT 1"
# Devrait voir $argon2 ou $2b (bcrypt)
```

---

### 1.4 Révocation de Tokens

| # | Point de Vérification | Statut | Observations |
|---|----------------------|--------|--------------|
| 1.4.1 | Table token_blacklist existe | ⬜ |  |
| 1.4.2 | Logout ajoute token à blacklist | ⬜ |  |
| 1.4.3 | authenticateToken vérifie blacklist | ⬜ |  |
| 1.4.4 | Refresh tokens implémentés (30 jours) | ⬜ |  |
| 1.4.5 | Access tokens courts (15min) | ⬜ |  |
| 1.4.6 | Endpoint /logout-all révoque tous tokens user | ⬜ |  |
| 1.4.7 | Nettoyage automatique tokens expirés | ⬜ |  |

**Tests** :
```bash
# 1. Login
TOKEN=$(curl -X POST https://devops.aenews.net/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"Admin123!"}' | jq -r '.token')

# 2. Utiliser token (devrait marcher)
curl https://devops.aenews.net/api/servers \
  -H "Authorization: Bearer $TOKEN"

# 3. Logout
curl -X POST https://devops.aenews.net/api/auth/logout \
  -H "Authorization: Bearer $TOKEN"

# 4. Réutiliser token (devrait être rejeté 403)
curl https://devops.aenews.net/api/servers \
  -H "Authorization: Bearer $TOKEN"
```

---

## 🛡️ 2. PROTECTION CONTRE LES ATTAQUES

### 2.1 Rate Limiting

| # | Point de Vérification | Statut | Observations |
|---|----------------------|--------|--------------|
| 2.1.1 | express-rate-limit installé | ⬜ |  |
| 2.1.2 | /login limité à 5 tentatives/15min | ⬜ |  |
| 2.1.3 | /api/* limité à 100 requêtes/min | ⬜ |  |
| 2.1.4 | Actions sensibles limitées (10/heure) | ⬜ |  |
| 2.1.5 | Rate limits stockés en DB (pas mémoire) | ⬜ |  |
| 2.1.6 | IP tracking pour rate limiting | ⬜ |  |
| 2.1.7 | Messages d'erreur clairs (429 status) | ⬜ |  |

**Test brute-force** :
```bash
# Essayer 10 logins rapides (5 devraient passer, 5+ devraient être bloqués)
for i in {1..10}; do
  curl -w "\n%{http_code}\n" -X POST https://devops.aenews.net/api/auth/login \
    -H "Content-Type: application/json" \
    -d '{"username":"admin","password":"wrong"}'
  sleep 1
done

# Devrait voir 200/401 pour les 5 premiers, puis 429 (Too Many Requests)
```

---

### 2.2 Protection CSRF

| # | Point de Vérification | Statut | Observations |
|---|----------------------|--------|--------------|
| 2.2.1 | Tokens CSRF générés par backend | ⬜ |  |
| 2.2.2 | Frontend envoie X-CSRF-Token header | ⬜ |  |
| 2.2.3 | Tous POST/PUT/DELETE vérifient CSRF | ⬜ |  |
| 2.2.4 | GET/HEAD/OPTIONS exemptés CSRF | ⬜ |  |
| 2.2.5 | Tokens CSRF expirent (1h) | ⬜ |  |
| 2.2.6 | Double submit cookie ou synchronizer pattern | ⬜ |  |

**Fichiers à vérifier** :
```bash
# Backend
grep -rn "csrf" backend/middleware/
grep -rn "x-csrf-token" backend/

# Frontend
grep -rn "csrf" frontend/auth-guard.js
grep -rn "X-CSRF-Token" frontend/
```

**Test manuel** :
```bash
# Essayer requête POST sans CSRF token (devrait être rejeté)
curl -X POST https://devops.aenews.net/api/servers \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"hostname":"evil.com","ip":"1.2.3.4"}'
# Devrait recevoir 403 Forbidden
```

---

### 2.3 Validation des Entrées

| # | Point de Vérification | Statut | Observations |
|---|----------------------|--------|--------------|
| 2.3.1 | Joi (ou équivalent) installé | ⬜ |  |
| 2.3.2 | Tous POST/PUT/PATCH ont validation | ⬜ |  |
| 2.3.3 | Types validés (string, number, email, etc.) | ⬜ |  |
| 2.3.4 | Longueurs min/max définies | ⬜ |  |
| 2.3.5 | Patterns regex pour formats spécifiques | ⬜ |  |
| 2.3.6 | Champs inconnus supprimés (stripUnknown) | ⬜ |  |
| 2.3.7 | Messages d'erreur pas trop verbeux | ⬜ |  |

**Test injection SQL** :
```bash
# Essayer injection dans username
curl -X POST https://devops.aenews.net/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin'\'' OR 1=1--","password":"anything"}'
# Devrait être rejeté (validation ou préparation)

# Essayer injection dans command
curl -X POST https://devops.aenews.net/api/commands/execute \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"command":"ls; rm -rf /","server_id":1}'
# Devrait être rejeté ou sanitizé
```

---

### 2.4 Protection XSS

| # | Point de Vérification | Statut | Observations |
|---|----------------------|--------|--------------|
| 2.4.1 | DOMPurify (ou équivalent) installé | ⬜ |  |
| 2.4.2 | Toutes sorties HTML sanitizées | ⬜ |  |
| 2.4.3 | Content-Security-Policy header configuré | ⬜ |  |
| 2.4.4 | Pas de eval() ou innerHTML avec données user | ⬜ |  |
| 2.4.5 | Encodage HTML sur affichage données | ⬜ |  |
| 2.4.6 | X-XSS-Protection header activé | ⬜ |  |

**Test XSS** :
```bash
# Essayer injecter script dans nom serveur
curl -X POST https://devops.aenews.net/api/servers \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"hostname":"<script>alert(1)</script>","ip":"1.2.3.4"}'

# Vérifier en DB
sqlite3 data/devops-agent.db "SELECT hostname FROM servers ORDER BY id DESC LIMIT 1"
# Devrait être sanitizé ou rejeté
```

---

### 2.5 Protection Injection SQL

| # | Point de Vérification | Statut | Observations |
|---|----------------------|--------|--------------|
| 2.5.1 | Tous requêtes utilisent .prepare() | ⬜ |  |
| 2.5.2 | Aucune concaténation SQL (SELECT...+) | ⬜ |  |
| 2.5.3 | Paramètres bindés (.bind() ou ?) | ⬜ |  |
| 2.5.4 | ORM/Query builder utilisé (optionnel) | ⬜ |  |
| 2.5.5 | Privilèges DB minimaux (pas root) | ⬜ |  |

**Scan code** :
```bash
# Chercher concaténations dangereuses
cd /opt/vps-devops-agent/backend
grep -rn "SELECT.*+" routes/
grep -rn "INSERT.*+" routes/
grep -rn "UPDATE.*+" routes/
grep -rn "DELETE.*+" routes/

# Devrait être vide ou utiliser template literals avec .prepare()
```

---

## 🔒 3. CONFIGURATION SERVEUR

### 3.1 Headers de Sécurité HTTP

| # | Point de Vérification | Statut | Observations |
|---|----------------------|--------|--------------|
| 3.1.1 | Helmet.js installé et configuré | ⬜ |  |
| 3.1.2 | Content-Security-Policy défini | ⬜ |  |
| 3.1.3 | Strict-Transport-Security (HSTS) | ⬜ |  |
| 3.1.4 | X-Frame-Options: DENY ou SAMEORIGIN | ⬜ |  |
| 3.1.5 | X-Content-Type-Options: nosniff | ⬜ |  |
| 3.1.6 | Referrer-Policy configuré | ⬜ |  |
| 3.1.7 | Permissions-Policy défini | ⬜ |  |

**Test headers** :
```bash
# Vérifier tous les headers de sécurité
curl -I https://devops.aenews.net | grep -E "(Content-Security|Strict-Transport|X-Frame|X-Content)"

# Tester avec securityheaders.com
# https://securityheaders.com/?q=https://devops.aenews.net
```

**Headers attendus** :
```
Content-Security-Policy: default-src 'self'
Strict-Transport-Security: max-age=31536000; includeSubDomains
X-Frame-Options: DENY
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
```

---

### 3.2 Configuration CORS

| # | Point de Vérification | Statut | Observations |
|---|----------------------|--------|--------------|
| 3.2.1 | CORS pas wildcard (origin != '*') | ⬜ |  |
| 3.2.2 | Whitelist domaines spécifiques | ⬜ |  |
| 3.2.3 | credentials: true si cookies utilisés | ⬜ |  |
| 3.2.4 | Méthodes limitées (pas ALL) | ⬜ |  |
| 3.2.5 | Headers autorisés minimaux | ⬜ |  |

**Fichier à vérifier** :
```javascript
// backend/index.js
app.use(cors({
  origin: 'https://devops.aenews.net', // ✅ Pas '*'
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token']
}));
```

---

### 3.3 SSL/TLS Configuration

| # | Point de Vérification | Statut | Observations |
|---|----------------------|--------|--------------|
| 3.3.1 | Certificat SSL valide (Let's Encrypt) | ⬜ |  |
| 3.3.2 | Redirection HTTP -> HTTPS active | ⬜ |  |
| 3.3.3 | TLS 1.2+ uniquement (pas SSLv3, TLS 1.0/1.1) | ⬜ |  |
| 3.3.4 | Ciphers sécurisés (ECDHE, AES-GCM) | ⬜ |  |
| 3.3.5 | Perfect Forward Secrecy (PFS) | ⬜ |  |
| 3.3.6 | Renouvellement auto certificat (certbot) | ⬜ |  |

**Test SSL Labs** :
```bash
# Tester configuration SSL
# https://www.ssllabs.com/ssltest/analyze.html?d=devops.aenews.net

# Ou avec testssl.sh
git clone https://github.com/drwetter/testssl.sh
cd testssl.sh
./testssl.sh https://devops.aenews.net
```

**Score attendu** : A ou A+

---

## 💾 4. SÉCURITÉ BASE DE DONNÉES

### 4.1 Configuration DB

| # | Point de Vérification | Statut | Observations |
|---|----------------------|--------|--------------|
| 4.1.1 | Permissions DB = 600 ou 640 | ⬜ |  |
| 4.1.2 | DB propriétaire = user app (pas root) | ⬜ |  |
| 4.1.3 | DB chiffrée (SQLCipher ou dm-crypt) | ⬜ |  |
| 4.1.4 | Backups réguliers (quotidiens min) | ⬜ |  |
| 4.1.5 | Backups chiffrés (GPG) | ⬜ |  |
| 4.1.6 | Backups stockés hors serveur | ⬜ |  |
| 4.1.7 | Tests de restauration backups | ⬜ |  |

**Vérifications** :
```bash
# Permissions
ls -la /opt/vps-devops-agent/data/devops-agent.db
# Devrait afficher: -rw------- user user (600)

# Propriétaire
stat -c "%U %G" /opt/vps-devops-agent/data/devops-agent.db
# Devrait être: pm2user pm2user (pas root)

# Chiffrement
file /opt/vps-devops-agent/data/devops-agent.db
# Si chiffré: affichera "data" ou "encrypted"

# Backups
ls -lah /opt/vps-devops-agent/data/*.backup*
ls -lah /opt/vps-devops-agent/data/*.gpg
```

---

### 4.2 Audit Logging

| # | Point de Vérification | Statut | Observations |
|---|----------------------|--------|--------------|
| 4.2.1 | Table audit_logs existe | ⬜ |  |
| 4.2.2 | Tous logins loggés (succès + échecs) | ⬜ |  |
| 4.2.3 | Actions sensibles loggées (DELETE, admin) | ⬜ |  |
| 4.2.4 | Logs incluent: user, IP, timestamp, action | ⬜ |  |
| 4.2.5 | Logs non modifiables (append-only) | ⬜ |  |
| 4.2.6 | Rotation logs anciens (>90 jours) | ⬜ |  |
| 4.2.7 | Alertes sur actions suspectes | ⬜ |  |

**Vérifier logs** :
```sql
-- Vérifier table existe
SELECT name FROM sqlite_master WHERE type='table' AND name='audit_logs';

-- Voir structure
PRAGMA table_info(audit_logs);

-- Vérifier données récentes
SELECT user_id, action, ip_address, created_at 
FROM audit_logs 
ORDER BY created_at DESC 
LIMIT 10;

-- Compter logins échoués
SELECT COUNT(*) 
FROM audit_logs 
WHERE action='LOGIN' AND success=0 
  AND created_at > datetime('now', '-1 day');
```

---

## 🎨 5. SÉCURITÉ FRONTEND

### 5.1 AuthGuard Configuration

| # | Point de Vérification | Statut | Observations |
|---|----------------------|--------|--------------|
| 5.1.1 | debugMode = false en production | ⬜ |  |
| 5.1.2 | Token expiration vérifiée côté client | ⬜ |  |
| 5.1.3 | Redirection auto si token expiré | ⬜ |  |
| 5.1.4 | Toutes pages protégées par protectPage() | ⬜ |  |
| 5.1.5 | API calls utilisent createApiInterceptor() | ⬜ |  |
| 5.1.6 | CSRF token inclus dans requêtes | ⬜ |  |

**Fichier** : `/opt/vps-devops-agent/frontend/auth-guard.js`

```javascript
// Vérifier config
const AuthGuard = {
    config: {
        debugMode: false,  // ✅ Doit être false
        // ...
    }
};
```

---

### 5.2 Stockage Sécurisé

| # | Point de Vérification | Statut | Observations |
|---|----------------------|--------|--------------|
| 5.2.1 | Données sensibles pas en localStorage | ⬜ |  |
| 5.2.2 | Alternative: httpOnly cookies si possible | ⬜ |  |
| 5.2.3 | Pas de secrets API en frontend | ⬜ |  |
| 5.2.4 | Pas de clés privées en frontend | ⬜ |  |

**Test** :
```javascript
// Ouvrir DevTools Console sur https://devops.aenews.net
console.log(localStorage);
// Vérifier qu'il n'y a pas de secrets, passwords, API keys
```

---

### 5.3 Content Security Policy

| # | Point de Vérification | Statut | Observations |
|---|----------------------|--------|--------------|
| 5.3.1 | CSP header présent | ⬜ |  |
| 5.3.2 | script-src pas 'unsafe-inline' (ou minimal) | ⬜ |  |
| 5.3.3 | default-src 'self' | ⬜ |  |
| 5.3.4 | object-src 'none' | ⬜ |  |
| 5.3.5 | base-uri 'self' | ⬜ |  |
| 5.3.6 | form-action 'self' | ⬜ |  |

**CSP recommandé** :
```
Content-Security-Policy: 
  default-src 'self'; 
  script-src 'self' https://cdn.tailwindcss.com; 
  style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; 
  img-src 'self' data: https:; 
  font-src 'self' https://cdn.jsdelivr.net; 
  connect-src 'self'; 
  object-src 'none'; 
  base-uri 'self'; 
  form-action 'self';
```

---

## 📦 6. GESTION DES DÉPENDANCES

### 6.1 Audit NPM

| # | Point de Vérification | Statut | Observations |
|---|----------------------|--------|--------------|
| 6.1.1 | npm audit sans vulnérabilités critiques | ⬜ |  |
| 6.1.2 | npm audit sans vulnérabilités hautes | ⬜ |  |
| 6.1.3 | Dépendances à jour (npm outdated) | ⬜ |  |
| 6.1.4 | Pas de dépendances inutiles | ⬜ |  |
| 6.1.5 | package-lock.json commité | ⬜ |  |
| 6.1.6 | npm ci utilisé (pas npm install) | ⬜ |  |

**Commandes** :
```bash
cd /opt/vps-devops-agent/backend

# Audit sécurité
npm audit
npm audit fix  # Corriger automatiquement

# Vérifier mises à jour
npm outdated

# Vérifier dépendances inutilisées
npx depcheck
```

---

## 🚨 7. DÉTECTION D'INTRUSION

### 7.1 Monitoring

| # | Point de Vérification | Statut | Observations |
|---|----------------------|--------|--------------|
| 7.1.1 | Monitoring temps réel actif | ⬜ |  |
| 7.1.2 | Alertes email sur échecs login (5+) | ⬜ |  |
| 7.1.3 | Détection patterns SQL injection | ⬜ |  |
| 7.1.4 | Détection patterns XSS | ⬜ |  |
| 7.1.5 | Détection path traversal | ⬜ |  |
| 7.1.6 | Dashboard sécurité accessible | ⬜ |  |

---

## 📄 8. CONFORMITÉ & DOCUMENTATION

### 8.1 Documentation

| # | Point de Vérification | Statut | Observations |
|---|----------------------|--------|--------------|
| 8.1.1 | README.md à jour | ⬜ |  |
| 8.1.2 | Architecture documentée | ⬜ |  |
| 8.1.3 | Procédures incident response | ⬜ |  |
| 8.1.4 | Plan de continuité (disaster recovery) | ⬜ |  |
| 8.1.5 | Contact sécurité défini | ⬜ |  |

---

## 🎯 SCORE FINAL

### Calcul du Score

```
Nombre total de points vérifiés: _____ / 150+
Points conformes (✅):           _____ 
Points non conformes (❌):       _____
Points N/A:                      _____

Score = (Points conformes / Points vérifiés) × 100
Score = _____ %
```

### Interprétation

- **90-100%** : ✅ Excellent - Sécurité de niveau entreprise
- **75-89%**  : 🟢 Bon - Quelques améliorations recommandées
- **60-74%**  : 🟡 Moyen - Corrections nécessaires
- **40-59%**  : 🟠 Faible - Corrections URGENTES
- **0-39%**   : 🔴 Critique - Refonte sécurité complète

---

## 📋 ACTIONS PRIORITAIRES

### 🔴 Critiques (À corriger immédiatement)

1. ⬜ _________________________________
2. ⬜ _________________________________
3. ⬜ _________________________________

### 🟠 Hautes (À corriger cette semaine)

1. ⬜ _________________________________
2. ⬜ _________________________________
3. ⬜ _________________________________

### 🟡 Moyennes (À planifier ce mois)

1. ⬜ _________________________________
2. ⬜ _________________________________
3. ⬜ _________________________________

---

## ✍️ SIGNATURES

**Auditeur** : _____________________ Date : __________

**Responsable Technique** : _____________________ Date : __________

**Validation** : _____________________ Date : __________

---

**Prochain audit planifié** : ___________________

**Rappel** : Effectuer un audit complet tous les 3 mois minimum.
