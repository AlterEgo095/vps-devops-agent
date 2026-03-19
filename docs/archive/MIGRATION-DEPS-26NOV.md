# Migration Dépendances Critiques - 26 Novembre 2024

## Statut: ⚠️ DOCUMENTÉ MAIS NON APPLIQUÉ

Les mises à jour majeures suivantes nécessitent des tests et potentiellement des changements de code :

### 1. OpenAI: 4.104.0 → 6.9.1 (MAJEUR)
**Breaking Changes:**
- API restructurée
- Nouvelles méthodes de streaming
- Changements dans les types TypeScript

**Action requise:**
```bash
npm install openai@latest
# Tester tous les appels OpenAI
# Vérifier services/openai-provider.js
```

**Risques:** 🔴 ÉLEVÉ - Peut casser l'agent AI
**Temps estimé:** 2-3h de tests

---

### 2. Express: 4.21.2 → 5.1.0 (MAJEUR)
**Breaking Changes:**
- Middleware signature changée
- Router behavior modifié
- Promesses nativement supportées

**Action requise:**
```bash
npm install express@5
# Tester toutes les routes
# Vérifier tous les middleware
```

**Risques:** 🔴 ÉLEVÉ - Framework principal
**Temps estimé:** 3-4h de tests

---

### 3. UUID: 9.0.1 → 13.0.0 (MAJEUR)
**Breaking Changes:**
- API stable, peu de risques
- Performance améliorée

**Action requise:**
```bash
npm install uuid@latest
# Tests rapides
```

**Risques:** 🟡 MOYEN - API stable
**Temps estimé:** 30min

---

### 4. bcryptjs: 2.4.3 → 3.0.3 (MAJEUR)
**Breaking Changes:**
- Migration vers bcrypt natif recommandée
- bcryptjs en maintenance mode

**Action requise:**
```bash
npm install bcrypt@latest
# Remplacer import bcryptjs par bcrypt
# Tester auth endpoints
```

**Risques:** 🟡 MOYEN
**Temps estimé:** 1h

---

## Recommandations

### ✅ Appliquées Maintenant (Safe)
- nodemailer: 7.0.10 → 7.0.11 ✅
- dotenv: 16.6.1 → 17.2.3 ✅
- @types/node: 20.19.25 → 24.10.1 ✅

### ⏳ À Tester en Développement
1. uuid (30min)
2. bcryptjs → bcrypt (1h)

### 🔴 Critique - Nécessite Planification
1. OpenAI 4 → 6 (2-3h)
2. Express 4 → 5 (3-4h)

**Total temps:** ~8h de migration + tests

---

## Plan d'Action Recommandé

### Phase 1: Immédiat (Aujourd'hui) ✅
- Mises à jour mineures appliquées
- Documentation créée

### Phase 2: Cette Semaine
1. Créer environnement de test
2. Migrer UUID (low risk)
3. Migrer bcrypt (medium risk)

### Phase 3: Semaine Prochaine
4. Planifier migration OpenAI (tests complets)
5. Planifier migration Express (tests complets)

---

## Notes Techniques

### Commandes de Test
```bash
# Après chaque mise à jour:
npm test
pm2 restart vps-devops-agent
curl http://localhost:3001/api/health
curl -X POST http://localhost:3001/api/auth/login -H "Content-Type: application/json" -d '{"username":"admin","password":"test"}'
```

### Rollback Rapide
```bash
cd /opt/vps-devops-agent
cp package.json.backup-deps-26nov package.json
npm install
pm2 restart vps-devops-agent
```
