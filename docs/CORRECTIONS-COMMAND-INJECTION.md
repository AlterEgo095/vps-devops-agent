# 🔒 CORRECTIONS COMMAND INJECTION - GUIDE DÉTAILLÉ

**Date:** 26 Novembre 2025  
**Priorité:** 🔴 CRITIQUE  
**Temps estimé:** 2-3h

---

## 📊 PROBLÈME IDENTIFIÉ

**Fichier:** `backend/services/capabilities.js`  
**Ligne:** 360 (et autres)  
**Vulnérabilité:** Command Injection via `exec()` avec variables non sanitizées

**Code vulnérable:**
```javascript
const { stdout } = await execAsync(
  `find ${safePath} ${findPattern} -exec grep ${grepFlags} '${escapedPattern}' {} + 2>/dev/null || true`,
  { timeout: 60000, maxBuffer: 10 * 1024 * 1024 }
);
```

**Risque:** Un attaquant peut injecter des commandes shell arbitraires via les variables.

---

## ✅ SOLUTIONS IMPLÉMENTÉES

### 1. Helper Sécurisé Créé ✅
**Fichier:** `backend/services/secure-exec.js`

```javascript
import { secureExec, secureFind, secureGrep } from './secure-exec.js';

// ✅ SÉCURISÉ: Arguments séparés, pas de shell
const result = await secureExec('find', [basePath, '-name', '*.js']);
```

### 2. Backup Créé ✅
**Fichier:** `capabilities.js.backup-command-injection-26nov`

---

## 🔧 CORRECTION MANUELLE REQUISE

### Option A: Utiliser le Helper Sécurisé (RECOMMANDÉ)

**Étape 1:** Importer le helper dans `capabilities.js`
```javascript
// Ligne 2: Ajouter
import { secureFind, secureGrep } from './secure-exec.js';
```

**Étape 2:** Remplacer ligne 360 (findInFiles)
```javascript
// ❌ AVANT (VULNÉRABLE)
const { stdout } = await execAsync(
  `find ${safePath} ${findPattern} -exec grep ${grepFlags} '${escapedPattern}' {} + 2>/dev/null || true`,
  { timeout: 60000 }
);

// ✅ APRÈS (SÉCURISÉ)
// D'abord, find les fichiers
const findResult = await secureFind(safePath, {
  name: filePattern || '*',
  type: 'f',
  maxdepth: recursive ? 999 : 1,
  timeout: 30000
});

// Ensuite, grep dans les fichiers trouvés
const files = findResult.stdout.split('\n').filter(f => f);
if (files.length > 0) {
  const grepResult = await secureGrep(pattern, files, {
    lineNumber: true,
    ignoreCase: !caseSensitive,
    timeout: 30000
  });
  const stdout = grepResult.stdout;
}
```

### Option B: Installer & Utiliser 'execa' (Alternative)

```bash
npm install execa
```

```javascript
import { execa } from 'execa';

// Utilisation sécurisée
const { stdout } = await execa('find', [safePath, '-name', '*.js'], {
  timeout: 60000,
  reject: false
});
```

---

## 🎯 AUTRES OCCURRENCES À CORRIGER

### 1. `deployment-manager.js` (ligne 2)
```javascript
// Ligne 2
import { exec } from 'child_process'; // ⚠️ À remplacer
```

**Correction:**
- Identifier toutes les utilisations de `exec`
- Remplacer par `secureExec` ou `execa`

### 2. `monitoring.js` (ligne 8)
```javascript
import { exec } from 'child_process'; // ⚠️ À remplacer
```

**Même approche:**
- Utiliser `secure-exec.js` helper
- Passer arguments en array

---

## ✅ CHECKLIST DE VÉRIFICATION

Après corrections, vérifier:

```bash
# 1. Aucun exec() non sécurisé restant
cd /opt/vps-devops-agent/backend
grep -rn "exec\(" services/ routes/ | grep -v "execAsync\|execFile\|backup"

# 2. Imports corrigés
grep -rn "import.*exec.*from.*child_process" services/ | grep -v "execFile"

# 3. Tests
npm test  # Si tests disponibles
pm2 restart vps-devops-agent
curl http://localhost:3001/api/health
```

---

## 📝 VALIDATION POST-CORRECTION

### Test 1: Tentative d'Injection
```bash
# Tester avec payload malicieux (doit échouer proprement)
curl -X POST http://localhost:3001/api/capabilities/find \
  -H "Content-Type: application/json" \
  -d '{"path": "/opt"; rm -rf /", "pattern": "test"}'

# Résultat attendu: Erreur de validation, pas d'exécution
```

### Test 2: Fonctionnalité Normale
```bash
# Tester fonction normale
curl -X POST http://localhost:3001/api/capabilities/find \
  -H "Content-Type: application/json" \
  -d '{"path": "/opt", "pattern": "test"}'

# Résultat attendu: Recherche normale fonctionne
```

---

## 🚨 TEMPORAIRE: MITIGATION EN ATTENDANT

**En attendant la correction complète, ajouter validation stricte:**

```javascript
// Début de findInFiles()
function validatePath(path) {
  // Interdire caractères dangereux
  if (/[;&|`$()]/.test(path)) {
    throw new Error('Invalid characters in path');
  }
  
  // Limiter aux chemins absolus sûrs
  if (!path.startsWith('/opt/') && !path.startsWith('/home/')) {
    throw new Error('Path not allowed');
  }
  
  return path;
}

// Utiliser avant exec
safePath = validatePath(safePath);
```

---

## 📊 IMPACT & PRIORITÉ

**Sévérité:** 🔴 CRITIQUE (10/10)  
**Exploitabilité:** Haute (requiert auth, mais RCE possible)  
**Impact:** RCE (Remote Code Execution)  
**Priorité:** P0 - À corriger immédiatement

**Recommandation:** Corriger dans les 24-48h maximum.

---

**Fichiers créés:**
- ✅ `/opt/vps-devops-agent/backend/services/secure-exec.js` (helper sécurisé)
- ✅ `/opt/vps-devops-agent/backend/services/capabilities.js.backup-command-injection-26nov` (backup)
- ✅ `/opt/vps-devops-agent/docs/CORRECTIONS-COMMAND-INJECTION.md` (ce guide)

**Statut:** 🟡 PARTIEL - Helper créé, intégration manuelle requise

