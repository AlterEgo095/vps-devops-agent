# 🔍 Guide d'Audit de Sécurité - VPS DevOps Agent

**Date**: 2025-11-24  
**Version**: 1.0  
**Durée estimée**: 2-4 heures

---

## 📋 Vue d'Ensemble

Ce guide vous accompagne dans l'audit complet de la sécurité de votre plateforme VPS DevOps Agent. Il combine **3 outils complémentaires** :

1. **🤖 Script Bash automatisé** (`security-audit.sh`) - Audit général
2. **🐍 Scanner Python** (`vulnerability-scanner.py`) - Détection patterns vulnérables
3. **📝 Checklist manuelle** (`MANUAL_AUDIT_CHECKLIST.md`) - Vérifications humaines

---

## 🎯 Objectifs de l'Audit

- ✅ Identifier toutes les vulnérabilités critiques
- ✅ Évaluer la posture de sécurité globale
- ✅ Générer un score de sécurité (0-100%)
- ✅ Produire un rapport actionnable
- ✅ Prioriser les corrections

---

## 🚀 Préparation

### 1. Transférer les Outils sur Votre VPS

```bash
# Sur votre machine locale
scp security-audit.sh root@devops.aenews.net:/opt/vps-devops-agent/
scp vulnerability-scanner.py root@devops.aenews.net:/opt/vps-devops-agent/
scp MANUAL_AUDIT_CHECKLIST.md root@devops.aenews.net:/opt/vps-devops-agent/
scp SECURITY_IMPROVEMENTS_PLAN.md root@devops.aenews.net:/opt/vps-devops-agent/

# Ou avec wget/curl si fichiers hébergés
ssh root@devops.aenews.net
cd /opt/vps-devops-agent
wget https://your-server.com/security-audit.sh
wget https://your-server.com/vulnerability-scanner.py
```

### 2. Rendre les Scripts Exécutables

```bash
cd /opt/vps-devops-agent
chmod +x security-audit.sh
chmod +x vulnerability-scanner.py
```

### 3. Installer Python (si nécessaire)

```bash
# Vérifier Python
python3 --version

# Si absent, installer
apt update && apt install -y python3 python3-pip
```

---

## 📊 Phase 1 : Audit Automatisé Bash (30 min)

### Exécution

```bash
cd /opt/vps-devops-agent
./security-audit.sh
```

### Ce que le Script Vérifie

✅ **12 catégories de sécurité** :

1. JWT & Secrets (longueur, algorithme, expiration)
2. Authentification (2FA, rate limiting, hashing)
3. Validation des entrées (Joi, sanitization)
4. Protection CSRF
5. Configuration CORS
6. Headers de sécurité (Helmet)
7. Sécurité base de données (permissions, chiffrement, backups)
8. Logging & monitoring (audit_logs)
9. Sécurité frontend (AuthGuard, CSP)
10. Dépendances (npm audit)
11. Fichiers de configuration (.env, .gitignore)
12. SSL/HTTPS (Nginx, HSTS, TLS)

### Sortie Attendue

```
═══════════════════════════════════════════════════════════════
   🔍 AUDIT DE SÉCURITÉ - VPS DEVOPS AGENT
═══════════════════════════════════════════════════════════════

1. AUDIT JWT & SECRETS
✅ OK: JWT_SECRET longueur suffisante (64 caractères)
🔴 CRITIQUE: Rate limiting non implémenté sur /login
   → Risque: Attaques brute-force possibles
   → Solution: express-rate-limit (max 5 tentatives/15min)

2. AUDIT AUTHENTIFICATION
🔴 CRITIQUE: 2FA non implémenté
   → Risque: Compromission si mot de passe volé
   → Solution: Implémenter TOTP (speakeasy)

[... suite de l'audit ...]

═══════════════════════════════════════════════════════════════
   ✅ AUDIT TERMINÉ
═══════════════════════════════════════════════════════════════

📊 Résumé:
  🔴 Critiques:  5
  🟠 Hautes:     8
  🟡 Moyennes:   12
  🔵 Basses:     3

📄 Rapport complet: /opt/vps-devops-agent/SECURITY_AUDIT_20251124-143022.txt
```

### Analyser le Rapport

```bash
# Lire le rapport complet
cat /opt/vps-devops-agent/SECURITY_AUDIT_*.txt

# Extraire uniquement les vulnérabilités critiques
grep -A 3 "🔴 CRITIQUE" /opt/vps-devops-agent/SECURITY_AUDIT_*.txt

# Compter par sévérité
grep "🔴 CRITIQUE" /opt/vps-devops-agent/SECURITY_AUDIT_*.txt | wc -l
```

### Codes de Sortie

- **0** : Aucune vulnérabilité critique/haute
- **1** : Vulnérabilités hautes détectées
- **2** : Vulnérabilités CRITIQUES détectées

---

## 🐍 Phase 2 : Scanner de Vulnérabilités Python (45 min)

### Exécution

```bash
cd /opt/vps-devops-agent
python3 vulnerability-scanner.py
```

### Ce que le Scanner Détecte

🔍 **9 catégories de patterns vulnérables** :

1. **SQL Injection** : `SELECT ... +`, template literals
2. **XSS** : `innerHTML`, `eval()`, `document.write()`
3. **Command Injection** : `exec()`, `spawn()` avec concaténation
4. **Path Traversal** : `../`, `readFile()` avec input user
5. **Cryptographie Faible** : MD5, SHA1, `Math.random()`
6. **Secrets en Dur** : passwords, API keys dans le code
7. **Authentification** : Token expiration, algorithme JWT
8. **CORS** : Wildcard `*`, credentials
9. **Info Disclosure** : Logs de passwords/tokens

### Sortie Attendue

```
🔍 Scanner de Vulnérabilités - VPS DevOps Agent
======================================================================
📂 Scan du projet: /opt/vps-devops-agent

🔍 Scan configuration JWT...
🔍 Scan sécurité base de données...
🔍 Scan package.json...
🔍 Scan fichier .env...
🔍 Scan frontend...
🔍 Scan fichiers backend...
🔍 Scan fichiers frontend...

📊 Génération du rapport...

======================================================================
   🔍 RÉSUMÉ DU SCAN DE VULNÉRABILITÉS
======================================================================

📊 Vulnérabilités détectées: 23
   🔴 Critiques: 4
   🟠 Hautes:    7
   🟡 Moyennes:  10
   🔵 Basses:    2

🎯 Score de sécurité: 62/100
   🟡 Niveau: BON

📄 Rapport détaillé: /opt/vps-devops-agent/VULNERABILITY_SCAN_20251124-143522.json
======================================================================
```

### Analyser le Rapport JSON

```bash
# Voir le rapport complet
cat /opt/vps-devops-agent/VULNERABILITY_SCAN_*.json | jq .

# Extraire uniquement les vulnérabilités critiques
cat /opt/vps-devops-agent/VULNERABILITY_SCAN_*.json | jq '.vulnerabilities.critical[]'

# Lister fichiers les plus vulnérables
cat /opt/vps-devops-agent/VULNERABILITY_SCAN_*.json | \
  jq -r '.vulnerabilities[][] | .file' | sort | uniq -c | sort -rn | head -10

# Obtenir le score
cat /opt/vps-devops-agent/VULNERABILITY_SCAN_*.json | jq '.summary.security_score'
```

### Exemple de Vulnérabilité Détectée

```json
{
  "title": "SQL Injection Potentielle",
  "description": "Concaténation SQL dangereuse",
  "severity": "critical",
  "file": "/opt/vps-devops-agent/backend/routes/servers.js",
  "line": 42,
  "code": "db.exec(`SELECT * FROM servers WHERE id = ${req.params.id}`)",
  "remediation": "Utiliser db.prepare() avec paramètres bindés",
  "timestamp": "2025-11-24T14:35:22.123Z"
}
```

---

## 📝 Phase 3 : Checklist Manuelle (1-2h)

### Pourquoi une Checklist Manuelle ?

Certains aspects de sécurité nécessitent une **vérification humaine** :

- 🧪 Tests d'intrusion (essayer réellement exploiter vulnérabilités)
- 🔐 Vérifier qualité du JWT_SECRET (pas juste longueur)
- 🧭 Tester flows complets (login → 2FA → logout → token révoqué)
- 🎨 Vérifier UX des messages d'erreur (pas trop verbeux)
- 📊 Analyser logs d'audit manuellement

### Exécution

```bash
# Ouvrir la checklist
nano /opt/vps-devops-agent/MANUAL_AUDIT_CHECKLIST.md

# Ou imprimer pour cocher physiquement
cat /opt/vps-devops-agent/MANUAL_AUDIT_CHECKLIST.md
```

### Sections à Compléter (150+ points)

1. **Authentification & Sessions** (40 points)
   - JWT configuration
   - 2FA
   - Gestion mots de passe
   - Révocation tokens

2. **Protection contre Attaques** (30 points)
   - Rate limiting
   - CSRF
   - Validation entrées
   - XSS
   - SQL injection

3. **Configuration Serveur** (20 points)
   - Headers sécurité
   - CORS
   - SSL/TLS

4. **Sécurité Base de Données** (15 points)
   - Permissions
   - Chiffrement
   - Backups
   - Audit logs

5. **Sécurité Frontend** (15 points)
   - AuthGuard
   - Stockage sécurisé
   - CSP

6. **Gestion Dépendances** (10 points)
   - npm audit
   - Mises à jour

7. **Détection d'Intrusion** (10 points)
   - Monitoring
   - Alertes

8. **Conformité & Documentation** (10 points)

### Exemple de Test Manuel

```bash
# TEST 1.4.4 - Logout révoque token

# 1. Login
TOKEN=$(curl -s -X POST https://devops.aenews.net/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"Admin123!"}' | jq -r '.token')

echo "Token obtenu: $TOKEN"

# 2. Utiliser token (devrait marcher)
curl -s https://devops.aenews.net/api/servers \
  -H "Authorization: Bearer $TOKEN" | jq .
# ✅ Devrait retourner liste des serveurs

# 3. Logout
curl -s -X POST https://devops.aenews.net/api/auth/logout \
  -H "Authorization: Bearer $TOKEN"

# 4. Réutiliser token (devrait être rejeté)
curl -s https://devops.aenews.net/api/servers \
  -H "Authorization: Bearer $TOKEN" | jq .
# ❌ Devrait retourner 403 Forbidden

# ✅ Si 403 → Test PASSÉ
# ❌ Si 200 → VULNÉRABILITÉ: tokens non révocables
```

---

## 📊 Phase 4 : Synthèse et Priorisation (30 min)

### Consolider les Résultats

```bash
cd /opt/vps-devops-agent

# Créer dossier pour rapports
mkdir -p audit-reports
mv SECURITY_AUDIT_*.txt audit-reports/
mv VULNERABILITY_SCAN_*.json audit-reports/

# Créer résumé consolidé
cat > audit-reports/SUMMARY.md << 'EOF'
# 📊 Résumé Audit de Sécurité

## Date
2025-11-24

## Outils Utilisés
- ✅ security-audit.sh (Bash)
- ✅ vulnerability-scanner.py (Python)
- ✅ MANUAL_AUDIT_CHECKLIST.md (Manuel)

## Scores
- Script Bash: ____ /100
- Scanner Python: ____ /100
- Checklist Manuelle: ____ /150

## Vulnérabilités par Sévérité
- 🔴 Critiques: ____
- 🟠 Hautes: ____
- 🟡 Moyennes: ____
- 🔵 Basses: ____

## Top 5 Vulnérabilités Critiques

1. ___________________________________
2. ___________________________________
3. ___________________________________
4. ___________________________________
5. ___________________________________

## Actions Immédiates (Cette Semaine)

- [ ] ___________________________________
- [ ] ___________________________________
- [ ] ___________________________________

## Actions Importantes (Ce Mois)

- [ ] ___________________________________
- [ ] ___________________________________
- [ ] ___________________________________

## Score Global de Sécurité

____ /100

## Niveau

- [ ] Excellent (90-100%)
- [ ] Bon (75-89%)
- [ ] Moyen (60-74%)
- [ ] Faible (40-59%)
- [ ] Critique (0-39%)
EOF

nano audit-reports/SUMMARY.md
```

### Créer Plan d'Action Priorisé

```bash
# Extraire toutes les vulnérabilités critiques
echo "# 🔴 VULNÉRABILITÉS CRITIQUES À CORRIGER IMMÉDIATEMENT" > audit-reports/ACTION_PLAN.md
echo "" >> audit-reports/ACTION_PLAN.md

# Depuis Bash audit
grep -A 5 "🔴 CRITIQUE" audit-reports/SECURITY_AUDIT_*.txt >> audit-reports/ACTION_PLAN.md

echo "" >> audit-reports/ACTION_PLAN.md
echo "---" >> audit-reports/ACTION_PLAN.md
echo "" >> audit-reports/ACTION_PLAN.md

# Depuis Python scanner
cat audit-reports/VULNERABILITY_SCAN_*.json | \
  jq -r '.vulnerabilities.critical[] | "## \(.title)\n\n**Fichier**: \(.file):\(.line)\n\n**Code**:\n```\n\(.code)\n```\n\n**Solution**: \(.remediation)\n\n---\n"' \
  >> audit-reports/ACTION_PLAN.md

echo "Plan d'action généré: audit-reports/ACTION_PLAN.md"
```

---

## 🎯 Interprétation des Résultats

### Matrice de Risque

| Score | Niveau | Interprétation | Action |
|-------|--------|----------------|--------|
| 90-100% | ✅ Excellent | Sécurité entreprise | Maintenance régulière |
| 75-89% | 🟢 Bon | Quelques améliorations | Corriger moyennes/basses |
| 60-74% | 🟡 Moyen | Corrections nécessaires | Corriger hautes en priorité |
| 40-59% | 🟠 Faible | Corrections URGENTES | Corriger critiques immédiatement |
| 0-39% | 🔴 Critique | Refonte complète | Arrêter production si possible |

### Priorisation des Corrections

#### 🚨 URGENT (Corriger dans les 24-48h)

**Si présentes, corriger IMMÉDIATEMENT** :

- ❌ SQL Injection active
- ❌ Secrets (passwords, API keys) en dur dans le code
- ❌ JWT algorithm 'none'
- ❌ CORS wildcard en production (`origin: '*'`)
- ❌ Mots de passe en clair dans DB
- ❌ Aucun rate limiting sur /login

**Impact si non corrigé** : Compromission complète en quelques heures

#### ⚠️ IMPORTANT (Corriger cette semaine)

- ⚠️ Pas de 2FA
- ⚠️ Pas de révocation de tokens
- ⚠️ Validation des entrées manquante
- ⚠️ Protection CSRF absente
- ⚠️ Aucun audit logging

**Impact si non corrigé** : Vulnérable aux attaques sophistiquées

#### 📋 À PLANIFIER (Corriger ce mois)

- 📋 Headers de sécurité manquants
- 📋 DB non chiffrée
- 📋 Backups non chiffrés
- 📋 Debug mode activé en production

**Impact si non corrigé** : Risque si serveur compromis

---

## 🔄 Automatisation Future

### Intégrer dans CI/CD

```bash
# .github/workflows/security-audit.yml
name: Security Audit

on:
  push:
    branches: [ main ]
  schedule:
    - cron: '0 2 * * 1'  # Tous les lundis à 2h

jobs:
  security:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Run Security Audit
        run: |
          chmod +x security-audit.sh
          ./security-audit.sh
      
      - name: Run Vulnerability Scanner
        run: |
          python3 vulnerability-scanner.py
      
      - name: Upload Reports
        uses: actions/upload-artifact@v3
        with:
          name: security-reports
          path: |
            SECURITY_AUDIT_*.txt
            VULNERABILITY_SCAN_*.json
      
      - name: Fail if Critical
        run: |
          if [ $? -eq 2 ]; then
            echo "❌ Critical vulnerabilities found"
            exit 1
          fi
```

### Cronjob Hebdomadaire

```bash
# Ajouter dans crontab
crontab -e

# Audit tous les lundis à 3h du matin
0 3 * * 1 /opt/vps-devops-agent/security-audit.sh > /opt/vps-devops-agent/audit-reports/weekly-$(date +\%Y\%m\%d).txt 2>&1
```

---

## 📚 Ressources Complémentaires

### Outils Externes Recommandés

1. **OWASP ZAP** - Test de pénétration automatisé
   ```bash
   docker run -t owasp/zap2docker-stable zap-baseline.py -t https://devops.aenews.net
   ```

2. **SSL Labs** - Test SSL/TLS
   https://www.ssllabs.com/ssltest/analyze.html?d=devops.aenews.net

3. **Security Headers** - Test headers HTTP
   https://securityheaders.com/?q=https://devops.aenews.net

4. **npm audit** - Vulnérabilités dépendances
   ```bash
   cd backend && npm audit
   ```

5. **Snyk** - Scan vulnérabilités code + dépendances
   ```bash
   npm install -g snyk
   snyk test
   ```

### Documentation

- **OWASP Top 10** : https://owasp.org/www-project-top-ten/
- **Node.js Security** : https://nodejs.org/en/docs/guides/security/
- **JWT Best Practices** : https://tools.ietf.org/html/rfc8725
- **CWE (Common Weakness Enumeration)** : https://cwe.mitre.org/

---

## ✅ Checklist Post-Audit

Après avoir complété l'audit, vérifiez :

- [ ] Les 3 outils ont été exécutés (Bash, Python, Manuel)
- [ ] Les rapports ont été sauvegardés dans `audit-reports/`
- [ ] Un résumé consolidé a été créé
- [ ] Les vulnérabilités critiques ont été identifiées
- [ ] Un plan d'action priorisé a été établi
- [ ] Les responsables ont été notifiés
- [ ] Un délai de correction a été fixé
- [ ] Un prochain audit est planifié (3 mois)

---

## 🆘 Support

Si vous avez besoin d'aide pour :

- Interpréter les résultats
- Corriger une vulnérabilité spécifique
- Implémenter une protection
- Valider les corrections

**Contactez** : [Votre contact sécurité]

---

**Rappel** : La sécurité est un **processus continu**, pas un état. Effectuez des audits réguliers (tous les 3 mois minimum) et après chaque modification majeure.

**Date de création** : 2025-11-24  
**Prochaine révision** : 2026-02-24
