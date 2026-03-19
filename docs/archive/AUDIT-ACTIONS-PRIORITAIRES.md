# ⚡ ACTIONS PRIORITAIRES - BACKEND VPS DEVOPS AGENT

**Date:** 26 Novembre 2025  
**Score Actuel:** 68/100  
**Score Cible (30j):** 85/100

---

## 🔴 CRITIQUE - À FAIRE AUJOURD'HUI

### 1. Corriger Command Injection (2-3h)
**Fichier:** `backend/services/capabilities.js:360`  
**Problème:** Utilisation de `exec()` avec variables non sanitizées  
**Risque:** Exécution code arbitraire

**Solution:**
```javascript
// ❌ AVANT (DANGEREUX)
exec(`find ${safePath} ${findPattern} -exec grep ${grepFlags} '${escapedPattern}' {} +`)

// ✅ APRÈS (SÉCURISÉ)
import { execFile } from 'child_process';
execFile('find', [safePath, findPattern, '-exec', 'grep', grepFlags, escapedPattern, '{}', '+'])
```

**Commande:**
```bash
cd /opt/vps-devops-agent/backend
nano services/capabilities.js  # Ligne 360
# Remplacer exec() par execFile() avec array arguments
```

---

### 2. Ajouter Validation d'Entrées (4-6h)
**Fichiers:** Tous les fichiers dans `backend/routes/`  
**Problème:** 0 validation, 437 endpoints vulnérables  
**Risque:** Injection, manipulation données

**Solution:**
```bash
# Installer express-validator
cd /opt/vps-devops-agent/backend
npm install express-validator

# Créer middleware validation
cat > middleware/validation.js << 'VALID'
import { body, param, query, validationResult } from 'express-validator';

export const validate = (validations) => {
  return async (req, res, next) => {
    await Promise.all(validations.map(validation => validation.run(req)));
    
    const errors = validationResult(req);
    if (errors.isEmpty()) {
      return next();
    }
    
    return res.status(400).json({ 
      error: 'Validation failed', 
      details: errors.array() 
    });
  };
};

// Validateurs réutilisables
export const validators = {
  serverId: param('id').isString().notEmpty(),
  email: body('email').isEmail(),
  password: body('password').isLength({ min: 8 }),
  username: body('username').isAlphanumeric().isLength({ min: 3, max: 30 })
};
VALID

# Exemple utilisation dans routes/auth.js
nano routes/auth.js
# Ajouter:
# import { validate, validators } from '../middleware/validation.js';
# router.post('/login', validate([validators.username, validators.password]), async (req, res) => { ... });
```

---

### 3. Supprimer Logs Sensibles (1h)
**Fichiers:** 
- `backend/routes/auth.js:18`
- `backend/routes/agent.js:537`

**Problème:** Logs exposent passwords et tokens  
**Risque:** Fuite credentials dans logs

**Solution:**
```bash
cd /opt/vps-devops-agent/backend

# auth.js - ligne 18
# ❌ SUPPRIMER:
# console.log(`🔐 Login attempt - Username: "${username}", Password length: ${password?.length}`);

# ✅ REMPLACER PAR:
# console.log(`🔐 Login attempt - Username: "${username}"`);

# agent.js - ligne 537
# ❌ SUPPRIMER:
# console.log("[DEBUG] Decrypted password:", server.decrypted_password);

# ✅ REMPLACER PAR:
# console.log("[DEBUG] Decrypted password: ***");
```

**Commandes:**
```bash
# Backup
cp routes/auth.js routes/auth.js.backup-audit-26nov
cp routes/agent.js routes/agent.js.backup-audit-26nov

# Éditer
nano routes/auth.js      # Ligne 18
nano routes/agent.js     # Ligne 537

# Redémarrer service
pm2 restart vps-devops-agent
```

---

## 🟠 HAUTE PRIORITÉ - CETTE SEMAINE

### 4. Système de Migrations DB (3-4h)
```bash
cd /opt/vps-devops-agent/backend

# Installer db-migrate
npm install db-migrate db-migrate-sqlite3

# Créer dossier migrations
mkdir -p migrations

# Créer database.json
cat > database.json << 'DBCONF'
{
  "dev": {
    "driver": "sqlite3",
    "filename": "../data/devops-agent.db"
  },
  "production": {
    "driver": "sqlite3",
    "filename": "../data/devops-agent.db"
  }
}
DBCONF

# Créer première migration
npx db-migrate create initial-schema --sql-file

# Exporter schéma actuel
sqlite3 ../data/devops-agent.db .schema > migrations/sqls/initial-schema-up.sql

# Tester migration
npx db-migrate up

# Ajouter au package.json
# "scripts": {
#   "migrate": "db-migrate up",
#   "migrate:down": "db-migrate down"
# }
```

---

### 5. Pool Connexions HTTP (2h)
**Fichier:** `backend/services/capabilities.js` et autres services  
**Problème:** Nouvelle connexion à chaque requête  
**Impact:** Performance sous-optimale

**Solution:**
```javascript
// Créer backend/config/http-pool.js
import http from 'http';
import https from 'https';

export const httpAgent = new http.Agent({
  keepAlive: true,
  maxSockets: 50,
  maxFreeSockets: 10,
  timeout: 60000
});

export const httpsAgent = new https.Agent({
  keepAlive: true,
  maxSockets: 50,
  maxFreeSockets: 10,
  timeout: 60000
});

// Utiliser dans services/openai-provider.js
import axios from 'axios';
import { httpAgent, httpsAgent } from '../config/http-pool.js';

const api = axios.create({
  httpAgent,
  httpsAgent,
  timeout: 60000
});
```

---

### 6. Mettre à Jour Dépendances (4-6h avec tests)
```bash
cd /opt/vps-devops-agent/backend

# Backup package.json
cp package.json package.json.backup-26nov

# Mise à jour sécuritaire (patches)
npm update nodemailer

# Tests avant mises à jour majeures
npm outdated

# Créer branche test
git checkout -b update-deps-26nov

# Mises à jour majeures (TESTER)
npm install openai@latest    # 4.x → 6.x (BREAKING)
npm install uuid@latest      # 9.x → 13.x (BREAKING)

# Tester l'application
pm2 restart vps-devops-agent
# Vérifier logs: pm2 logs vps-devops-agent --nostream
# Tester API: curl http://localhost:3001/api/health

# Si OK, merge
git add package.json package-lock.json
git commit -m "chore: update dependencies (openai 6.x, uuid 13.x)"
git checkout main
git merge update-deps-26nov
```

---

### 7. Compression Gzip (30min)
```bash
cd /opt/vps-devops-agent/backend

# Installer compression
npm install compression

# Éditer server.js
nano server.js

# Ajouter après imports:
# import compression from 'compression';

# Ajouter après app = express():
# app.use(compression({
#   filter: (req, res) => {
#     if (req.headers['x-no-compression']) return false;
#     return compression.filter(req, res);
#   },
#   level: 6
# }));

# Redémarrer
pm2 restart vps-devops-agent

# Vérifier
curl -I -H "Accept-Encoding: gzip" http://localhost:3001/api/health
# Chercher: Content-Encoding: gzip
```

---

## 🟡 MOYENNE PRIORITÉ - CE MOIS

### 8. Refactoring capabilities.js (6-8h)
```bash
# Diviser capabilities.js (1406 lignes) en modules
mkdir -p services/capabilities/
touch services/capabilities/{file-ops.js,process-mgmt.js,network-utils.js,search.js}

# Déplacer fonctions par domaine
# - file-ops.js: readFile, writeFile, listDir, etc.
# - process-mgmt.js: startProcess, stopProcess, etc.
# - network-utils.js: testConnection, etc.
# - search.js: findInFiles, grepCode, etc.

# Créer index.js pour exports
```

---

### 9. Winston Logging (3-4h)
```bash
cd /opt/vps-devops-agent/backend

# Installer Winston
npm install winston winston-daily-rotate-file

# Créer config/logger.js
cat > config/logger.js << 'LOGGER'
import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  transports: [
    new DailyRotateFile({
      filename: 'logs/error-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      level: 'error',
      maxSize: '20m',
      maxFiles: '14d'
    }),
    new DailyRotateFile({
      filename: 'logs/combined-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      maxSize: '20m',
      maxFiles: '14d'
    })
  ]
});

if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: winston.format.simple()
  }));
}

export default logger;
LOGGER

# Remplacer console.log par logger
# console.log('info') → logger.info('info')
# console.error('err') → logger.error('err')
```

---

### 10. Implémenter Cache (2-3h)
```bash
npm install node-cache

# Créer config/cache.js
cat > config/cache.js << 'CACHE'
import NodeCache from 'node-cache';

// Cache général (TTL 5min)
export const appCache = new NodeCache({
  stdTTL: 300,
  checkperiod: 60
});

// Cache métriques (TTL 30s)
export const metricsCache = new NodeCache({
  stdTTL: 30,
  checkperiod: 10
});
CACHE

# Utiliser dans routes
# const cached = metricsCache.get('system-metrics');
# if (cached) return res.json(cached);
# // ... fetch data
# metricsCache.set('system-metrics', data);
```

---

## 📊 CHECKLIST DE PROGRESSION

```
🔴 CRITIQUE (Aujourd'hui - 9h)
[ ] 1. Command Injection corrigée       (2-3h)
[ ] 2. Validation entrées basique       (4-6h)
[ ] 3. Logs sensibles supprimés         (1h)

🟠 HAUTE (Cette semaine - 11h)
[ ] 4. Système migrations DB            (3-4h)
[ ] 5. Pool connexions HTTP             (2h)
[ ] 6. Dépendances à jour               (4-6h)
[ ] 7. Compression gzip                 (30min)

🟡 MOYENNE (Ce mois - 20h)
[ ] 8. Refactoring capabilities.js      (6-8h)
[ ] 9. Winston logging                  (3-4h)
[ ] 10. Cache node-cache                (2-3h)
[ ] 11. CSRF protection                 (2h)
[ ] 12. Headers cache HTTP              (1h)

TOTAL: ~40 heures pour passer de 68/100 à 85/100
```

---

## 🎯 RÉSULTAT ATTENDU

### Après Actions Critiques (9h)
- **Sécurité:** 6/10 → 7.5/10 (+1.5)
- **Score:** 68/100 → 73/100

### Après Actions Haute Priorité (+11h = 20h total)
- **Sécurité:** 7.5/10 → 8.5/10
- **Performance:** 7/10 → 8/10
- **Score:** 73/100 → 80/100

### Après Actions Moyenne Priorité (+20h = 40h total)
- **Sécurité:** 8.5/10 → 9/10
- **Performance:** 8/10 → 8.5/10
- **Qualité:** 7.5/10 → 8.5/10
- **Maintenance:** 6.5/10 → 8/10
- **Score:** 80/100 → 85/100 ✅

---

## 📞 SUPPORT

**Documentation complète:**
- `/opt/vps-devops-agent/docs/AUDIT-BACKEND-COMPLET-26NOV.md`
- `/opt/vps-devops-agent/docs/AUDIT-RESUME-VISUEL.md`

**Commandes utiles:**
```bash
# Vérifier état service
pm2 status vps-devops-agent

# Logs en temps réel
pm2 logs vps-devops-agent --nostream

# Redémarrer après modifs
pm2 restart vps-devops-agent

# Tester API
curl http://localhost:3001/api/health
```

---

**Créé le:** 26 Novembre 2025, 10:20 UTC  
**Par:** Claude Code Agent
