# DIAGNOSTIC - API IA EN PANNE

**Date**: 26 Novembre 2025, 08:00  
**Statut**: 🚨 CRITIQUE - API IA NON FONCTIONNELLE

---

## RÉSUMÉ EXÉCUTIF

L'agent IA du VPS DevOps Agent **ne répond pas correctement** car l'API IA backend () est **complètement en panne**.

### Symptômes observés par l'utilisateur
- Les messages de l'utilisateur sont envoyés correctement
- L'interface affiche un indicateur de chargement "..."
- **Aucune réponse n'arrive** (ou timeouts après 60 secondes)
- Les anciennes réponses sont affichées, mais pas les nouvelles

---

## DIAGNOSTIC TECHNIQUE

### 1. Configuration actuelle
```
OPENAI_BASE_URL = https://ai.aenews.net
OPENAI_MODEL = gpt-4
OPENAI_MAX_TOKENS = 2000
OPENAI_TIMEOUT = 60000ms
```

### 2. État de l'API IA

**Endpoint health** : `https://ai.aenews.net/api/health`
```json
{
  "status": "degraded",
  "services": {
    "ollama": "healthy",
    "vector_store": "unhealthy: ChromaDB temporairement désactivé (API v1 dépréciée)",
    "cache": "healthy"
  }
}
```

**Endpoint chat** : `https://ai.aenews.net/api/chat`
```json
{
  "error": "Internal Server Error",
  "message": "Une erreur interne s'est produite"
}
```

### 3. Tests effectués

| Modèle | Résultat | Temps |
|--------|----------|-------|
| gpt-4 | ❌ Internal Server Error | 0.088s |
| phi3:mini | ❌ Internal Server Error | 0.079s |
| mistral | ❌ Internal Server Error | 0.075s |

### 4. Logs d'erreurs
```
[OpenAI Provider] API Error: timeout of 60000ms exceeded
❌ Agent chat error: Error: Request timeout. The model took too long to respond.
Error processing message: Error: Request timeout. The model took too long to respond.
```

---

## CAUSE RACINE

✅ **Le problème n'est PAS dans le frontend** (affichage OK)  
✅ **Le problème n'est PAS dans le backend** (route  OK)  
❌ **Le problème EST dans l'API IA externe** : `https://ai.aenews.net`

L'API retourne systématiquement une erreur 500 (Internal Server Error) pour toutes les requêtes vers `/api/chat`, quel que soit le modèle demandé.

---

## SOLUTIONS POSSIBLES

### ✅ SOLUTION 1 : Réparer l'API https://ai.aenews.net (RECOMMANDÉ)

**Actions nécessaires** :
1. Accéder au serveur hébergeant `ai.aenews.net`
2. Vérifier les logs de l'API IA :
   ```bash
   pm2 logs ai-api
   # ou
   journalctl -u ai-api -f
   ```
3. Identifier pourquoi l'endpoint `/api/chat` retourne une erreur 500
4. Possibilités :
   - Service Ollama arrêté ou planté
   - Configuration incorrecte
   - Problème de ChromaDB affectant toute l'API
   - Modèles non téléchargés
   - Erreur de connexion interne

5. Redémarrer le service IA :
   ```bash
   pm2 restart ai-api
   # ou
   systemctl restart ollama
   ```

### ✅ SOLUTION 2 : Utiliser une API OpenAI publique (Alternative)

Si `ai.aenews.net` ne peut pas être réparé immédiatement :

1. Obtenir une clé API OpenAI : https://platform.openai.com/api-keys
2. Modifier `/opt/vps-devops-agent/.env` :
   ```env
   OPENAI_BASE_URL=https://api.openai.com/v1
   OPENAI_API_KEY=sk-...votre-clé...
   OPENAI_MODEL=gpt-3.5-turbo
   OPENAI_MAX_TOKENS=500
   ```
3. Redémarrer :
   ```bash
   pm2 restart vps-devops-agent
   ```

**⚠️ Coût** : API OpenAI publique est payante (~$0.002 par requête)

### ✅ SOLUTION 3 : Installer Ollama localement

Si vous voulez un service IA gratuit et local :

1. Installer Ollama sur le serveur :
   ```bash
   curl -fsSL https://ollama.com/install.sh | sh
   ```

2. Télécharger un modèle léger :
   ```bash
   ollama pull phi3:mini
   # ou
   ollama pull mistral:7b
   ```

3. Modifier `/opt/vps-devops-agent/.env` :
   ```env
   OPENAI_BASE_URL=http://localhost:11434/v1
   OPENAI_MODEL=phi3:mini
   OPENAI_MAX_TOKENS=500
   ```

4. Redémarrer :
   ```bash
   pm2 restart vps-devops-agent
   ```

**✅ Avantages** : Gratuit, rapide, pas de limite
**⚠️ Inconvénients** : Consomme ~4GB RAM, modèles moins performants que GPT-4

---

## ACTIONS IMMÉDIATES RECOMMANDÉES

### Priorité HAUTE 🔴
1. **Vérifier l'état du serveur `ai.aenews.net`**
   - Accéder au serveur
   - Consulter les logs : `pm2 logs ai-api` ou `journalctl -u ai-api`
   - Identifier l'erreur 500

2. **Redémarrer le service IA**
   ```bash
   pm2 restart ai-api
   # ou
   systemctl restart ollama
   ```

3. **Tester l'API après redémarrage**
   ```bash
   curl -X POST https://ai.aenews.net/api/chat \
     -H 'Content-Type: application/json' \
     -d '{"model":"phi3:mini","messages":[{"role":"user","content":"test"}]}'
   ```

### Priorité MOYENNE 🟡
4. **Si l'API reste en panne** : Installer Ollama localement (Solution 3)

### Priorité BASSE 🟢
5. **Ajouter un monitoring** pour détecter les pannes d'API automatiquement
6. **Configurer un fallback** vers une API alternative en cas de panne

---

## VALIDATION

Après correction, tester avec :

```bash
cd /opt/vps-devops-agent
bash test-agent.sh
```

**Attendu** :
- ✅ Réponse de l'agent en < 30 secondes
- ✅ Pas de timeout
- ✅ Messages complets et cohérents

---

## CONTACT

- **Serveur API IA** : https://ai.aenews.net
- **Serveur DevOps Agent** : https://devops.aenews.net
- **Dashboard** : https://devops.aenews.net/dashboard.html

