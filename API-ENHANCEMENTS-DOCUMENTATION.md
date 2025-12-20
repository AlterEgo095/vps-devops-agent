# 🚀 API ENHANCEMENTS - Documentation Complète
## VPS DevOps Agent v2.0 - Enhanced Capabilities

**Date**: 2025-11-23  
**Base URL**: `https://devops.aenews.net/api/enhancements`  
**Version**: 2.0.0

---

## 📊 Vue d'ensemble

**13 nouveaux endpoints** exposant les capacités avancées de l'agent :

| Catégorie | Endpoints | Description |
|-----------|-----------|-------------|
| **Sandbox** | 3 | Exécution sécurisée Docker |
| **Git** | 6 | Gestion version complète |
| **Web** | 3 | Recherche et scraping |
| **Média** | 2 | Génération IA (OpenAI) |

---

## 🔒 Authentification

**Status actuel** : Authentification désactivée (pour développement)

Pour activer l'authentification, décommenter dans `backend/routes/enhancements.js` :
\`\`\`javascript
router.use(authenticateToken);
\`\`\`

**Header requis** (quand activé) :
\`\`\`
Authorization: Bearer <your-jwt-token>
\`\`\`

---

## 📡 ENDPOINTS SANDBOX & EXECUTION

### 1. Exécuter Commande Sandbox

**POST** `/api/enhancements/sandbox/execute`

Exécute une commande dans un conteneur Docker isolé.

**Request Body**:
\`\`\`json
{
  "command": "echo Hello && node --version",
  "options": {
    "image": "node:20-alpine",
    "timeout": 300000,
    "memoryLimit": 536870912,
    "cpuQuota": 100000
  }
}
\`\`\`

**Response**:
\`\`\`json
{
  "success": true,
  "output": {
    "stdout": "Hello\\nv20.19.5",
    "stderr": "",
    "exitCode": 0
  },
  "execution": {
    "image": "node:20-alpine",
    "timeout": 300000,
    "memoryLimit": "512MB"
  }
}
\`\`\`

**Exemple curl**:
\`\`\`bash
curl -X POST https://devops.aenews.net/api/enhancements/sandbox/execute \\
  -H "Content-Type: application/json" \\
  -d '{"command": "echo Test && node --version"}'
\`\`\`

---

### 2. Exécuter avec Montage Filesystem

**POST** `/api/enhancements/sandbox/execute-with-mount`

Exécute une commande avec accès à un répertoire local.

**Request Body**:
\`\`\`json
{
  "command": "ls -la /workspace && cat /workspace/README.md",
  "localPath": "/opt/agent-projects/my-project",
  "options": {
    "image": "node:20-alpine"
  }
}
\`\`\`

**Response**:
\`\`\`json
{
  "success": true,
  "output": {
    "stdout": "total 12\\ndrwxr-xr-x...",
    "stderr": "",
    "exitCode": 0
  },
  "mount": {
    "localPath": "/opt/agent-projects/my-project",
    "containerPath": "/workspace"
  }
}
\`\`\`

---

### 3. Assurer Image Docker

**POST** `/api/enhancements/sandbox/ensure-image`

Vérifie et télécharge une image Docker si nécessaire.

**Request Body**:
\`\`\`json
{
  "imageName": "python:3.11-slim"
}
\`\`\`

**Response**:
\`\`\`json
{
  "success": true,
  "image": "python:3.11-slim",
  "message": "Image already available"
}
\`\`\`

---

## 🔄 ENDPOINTS GIT

### 4. Initialiser Dépôt

**POST** `/api/enhancements/git/init`

Initialise un nouveau dépôt Git.

**Request Body**:
\`\`\`json
{
  "repoPath": "/opt/agent-projects/my-repo"
}
\`\`\`

**Response**:
\`\`\`json
{
  "success": true,
  "path": "/opt/agent-projects/my-repo",
  "message": "Repository initialized"
}
\`\`\`

**Note**: Le répertoire doit exister avant l'appel.

---

### 5. Cloner Dépôt

**POST** `/api/enhancements/git/clone`

Clone un dépôt Git distant.

**Request Body**:
\`\`\`json
{
  "repoUrl": "https://github.com/user/repo.git",
  "destPath": "/opt/agent-projects/cloned-repo",
  "options": {
    "branch": "main",
    "depth": 1
  }
}
\`\`\`

**Response**:
\`\`\`json
{
  "success": true,
  "path": "/opt/agent-projects/cloned-repo",
  "message": "Repository cloned successfully"
}
\`\`\`

---

### 6. Commit Modifications

**POST** `/api/enhancements/git/commit`

Crée un commit avec les modifications.

**Request Body**:
\`\`\`json
{
  "repoPath": "/opt/agent-projects/my-repo",
  "message": "feat: Add new feature",
  "options": {
    "addAll": true
  }
}
\`\`\`

**Response**:
\`\`\`json
{
  "success": true,
  "commit": "a1b2c3d",
  "message": "feat: Add new feature"
}
\`\`\`

---

### 7. Push vers Remote

**POST** `/api/enhancements/git/push`

Pousse les commits vers le dépôt distant.

**Request Body**:
\`\`\`json
{
  "repoPath": "/opt/agent-projects/my-repo",
  "options": {
    "remote": "origin",
    "branch": "main"
  }
}
\`\`\`

---

### 8. Statut Dépôt

**GET** `/api/enhancements/git/status?repoPath=/opt/agent-projects/my-repo`

Récupère le statut du dépôt Git.

**Response**:
\`\`\`json
{
  "success": true,
  "status": {
    "current": "main",
    "tracking": "origin/main",
    "ahead": 0,
    "behind": 0,
    "files": [],
    "isClean": true
  }
}
\`\`\`

---

### 9. Commit et Push

**POST** `/api/enhancements/git/commit-and-push`

Opération combinée commit + push.

**Request Body**:
\`\`\`json
{
  "repoPath": "/opt/agent-projects/my-repo",
  "message": "Update files",
  "options": {
    "addAll": true,
    "remote": "origin",
    "branch": "main"
  }
}
\`\`\`

---

## 🌐 ENDPOINTS WEB

### 10. Recherche Web

**POST** `/api/enhancements/web/search`

Recherche sur le web via DuckDuckGo.

**Request Body**:
\`\`\`json
{
  "query": "Node.js Docker best practices",
  "options": {
    "maxResults": 10
  }
}
\`\`\`

**Response**:
\`\`\`json
{
  "success": true,
  "query": "Node.js Docker best practices",
  "results": [],
  "count": 0
}
\`\`\`

---

### 11. Récupérer Page Web

**POST** `/api/enhancements/web/fetch-page`

Récupère et parse une page web.

**Request Body**:
\`\`\`json
{
  "url": "https://example.com",
  "options": {
    "extractText": true,
    "extractLinks": true
  }
}
\`\`\`

**Response**:
\`\`\`json
{
  "success": true,
  "url": "https://example.com",
  "title": "Example Domain",
  "text": "This domain is for use in illustrative...",
  "links": ["https://www.iana.org/domains/example"]
}
\`\`\`

---

### 12. Recherche Actualités

**POST** `/api/enhancements/web/search-news`

Recherche d'actualités.

**Request Body**:
\`\`\`json
{
  "query": "intelligence artificielle",
  "language": "fr"
}
\`\`\`

**Response**:
\`\`\`json
{
  "success": true,
  "query": "intelligence artificielle",
  "results": [
    {
      "title": "...",
      "url": "...",
      "snippet": "..."
    }
  ]
}
\`\`\`

---

## 🎨 ENDPOINTS MÉDIA (OpenAI)

### 13. Générer Image

**POST** `/api/enhancements/media/generate-image`

Génère une image via DALL-E.

**⚠️ Nécessite**: `OPENAI_API_KEY` configuré dans `.env`

**Request Body**:
\`\`\`json
{
  "prompt": "A futuristic city at sunset",
  "options": {
    "model": "dall-e-3",
    "size": "1024x1024",
    "quality": "standard"
  }
}
\`\`\`

**Response**:
\`\`\`json
{
  "success": true,
  "url": "https://oaidalleapiprodscus.blob.core.windows.net/...",
  "revisedPrompt": "..."
}
\`\`\`

---

### 14. Générer Audio

**POST** `/api/enhancements/media/generate-audio`

Génère un fichier audio via TTS.

**⚠️ Nécessite**: `OPENAI_API_KEY` configuré dans `.env`

**Request Body**:
\`\`\`json
{
  "text": "Bonjour, ceci est un test de synthèse vocale",
  "options": {
    "voice": "alloy",
    "model": "tts-1",
    "speed": 1.0
  }
}
\`\`\`

**Response**:
\`\`\`json
{
  "success": true,
  "audioBase64": "base64_encoded_audio_data...",
  "format": "mp3"
}
\`\`\`

**Voix disponibles**: alloy, echo, fable, onyx, nova, shimmer

---

## 📊 ENDPOINT INFO

### GET /api/enhancements/info

Récupère les informations sur les endpoints disponibles.

**Response**:
\`\`\`json
{
  "success": true,
  "version": "2.0.0",
  "enhancements": {
    "sandbox": { ... },
    "git": { ... },
    "web": { ... },
    "media": { ... }
  },
  "totalEndpoints": 13
}
\`\`\`

---

## 🚨 Codes d'Erreur

| Code | Description |
|------|-------------|
| 200 | Succès |
| 400 | Paramètres manquants ou invalides |
| 401 | Token d'authentification manquant |
| 403 | Token invalide |
| 500 | Erreur serveur interne |
| 503 | Service non disponible (ex: OPENAI_API_KEY manquant) |

**Format erreur**:
\`\`\`json
{
  "success": false,
  "error": "Description de l'erreur",
  "message": "Message détaillé (optionnel)"
}
\`\`\`

---

## 🔐 Configuration OpenAI

Pour utiliser les endpoints média, configurer dans `/opt/vps-devops-agent/backend/.env` :

\`\`\`bash
OPENAI_API_KEY=sk-...
\`\`\`

Puis redémarrer :
\`\`\`bash
pm2 restart vps-devops-agent
\`\`\`

---

## 📝 Exemples d'Utilisation

### Exemple 1: CI/CD Pipeline

\`\`\`bash
# 1. Cloner le projet
curl -X POST https://devops.aenews.net/api/enhancements/git/clone \\
  -H "Content-Type: application/json" \\
  -d '{
    "repoUrl": "https://github.com/user/project.git",
    "destPath": "/opt/agent-projects/ci-build"
  }'

# 2. Build dans sandbox
curl -X POST https://devops.aenews.net/api/enhancements/sandbox/execute-with-mount \\
  -H "Content-Type: application/json" \\
  -d '{
    "command": "npm install && npm run build",
    "localPath": "/opt/agent-projects/ci-build"
  }'

# 3. Tests
curl -X POST https://devops.aenews.net/api/enhancements/sandbox/execute-with-mount \\
  -H "Content-Type: application/json" \\
  -d '{
    "command": "npm test",
    "localPath": "/opt/agent-projects/ci-build"
  }'
\`\`\`

### Exemple 2: Veille Technologique

\`\`\`bash
# Recherche actualités
curl -X POST https://devops.aenews.net/api/enhancements/web/search-news \\
  -H "Content-Type: application/json" \\
  -d '{
    "query": "Docker Kubernetes",
    "language": "fr"
  }'

# Récupération page
curl -X POST https://devops.aenews.net/api/enhancements/web/fetch-page \\
  -H "Content-Type: application/json" \\
  -d '{
    "url": "https://docs.docker.com",
    "options": {"extractText": true}
  }'
\`\`\`

---

## 📞 Support

- **Documentation complète**: `/opt/vps-devops-agent/RAPPORT-TESTS-FINAL.md`
- **Tests backend**: `/opt/vps-devops-agent/test-capabilities.js`
- **Logs**: `pm2 logs vps-devops-agent`

---

**Documentation générée le**: 2025-11-23 20:03 WAT  
**Version**: 2.0.0  
**Status**: ✅ Production Ready
