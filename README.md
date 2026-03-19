# VPS DevOps Agent

**Plateforme professionnelle de gestion d'infrastructure VPS depuis le navigateur.**
Intelligence artificielle + outils DevOps modernes pour automatiser et securiser la gestion de vos serveurs.

## Fonctionnalites

| Module | Description | Status |
|--------|-------------|--------|
| **Dashboard** | Vue d'ensemble de tous vos serveurs | OK |
| **Terminal SSH** | Terminal interactif WebSocket (xterm.js) | OK |
| **Docker Manager** | Gestion conteneurs/images/compose via GUI | OK |
| **Monitoring** | Metriques temps reel CPU/RAM/Disk/Network | OK |
| **CI/CD Pipeline** | Webhooks GitHub/GitLab, auto-deploiement, rollback | OK |
| **Agent IA** | Assistant conversationnel DevOps (OpenAI/DeepSeek) | OK |
| **Multi-serveurs** | Execution de commandes sur N serveurs en parallele | OK |
| **Securite** | JWT, AES-256-CBC, CommandGuard, Rate Limiting, Helmet | OK |

## Installation rapide (VPS Contabo / Ubuntu)

```bash
# One-liner (root requis)
curl -sSL https://raw.githubusercontent.com/AlterEgo095/vps-devops-agent/main/deploy/install.sh | bash
```

### Installation manuelle

```bash
# 1. Cloner
git clone https://github.com/AlterEgo095/vps-devops-agent.git
cd vps-devops-agent

# 2. Installer les dependances
npm install

# 3. Configurer
cp .env.example .env
nano .env  # Remplir JWT_SECRET et ADMIN_PASSWORD

# 4. Initialiser la DB
npm run db:migrate

# 5. Demarrer
pm2 start ecosystem.config.cjs
pm2 save
```

## Architecture

```
VPS DevOps Agent v2.0 — Architecture securisee
================================================

[Navigateur] ──HTTPS──> [Nginx] ──proxy──> [Node.js :4000]
                           │                      │
                    Rate Limiting          ┌───────┼──────────┐
                    SSL/TLS               │       │          │
                    Fail2ban          [Express]  [WebSocket] [Cron]
                                         │        │          │
                                    [JWT Auth] [SSH2]    [Monitoring]
                                         │        │          │
                                    [SQLite3]  [VPS]    [Alertes]
                                         │     distant      │
                                    [AES-256]            [Email]
                                    [CommandGuard]       [Telegram]
```

## Securite

### Corrections appliquees (Audit 2026-03-19)

| Priorite | Correction | Fichier |
|----------|-----------|---------|
| **P0** | Auth JWT reelle sur routes Docker (etait bypassee) | `routes/docker.js` |
| **P0** | Suppression fichiers de test/debug exposes en prod | `frontend/*.html` |
| **P1** | Chiffrement AES-256-CBC centralise (remplace Base64) | `services/crypto-manager.js` |
| **P1** | CommandGuard — blocage commandes destructrices | `services/command-guard.js` |
| **P1** | Token JWT reduit a 1h (etait 7j) | `middleware/auth.js` |
| **P2** | Configuration Nginx production avec SSL | `deploy/nginx/` |
| **P2** | Script installation automatique Contabo | `deploy/install.sh` |
| **P3** | Nettoyage 65+ fichiers de rapport superflus | racine + docs/ |

### CommandGuard — Pare-feu de commandes

Le module `command-guard.js` bloque automatiquement :

- **BLACKLIST** : `rm -rf /`, `mkfs`, `dd if=`, `shutdown`, `poweroff`, fork bombs
- **INJECTION** : `; rm`, `| bash`, backticks, `$(...)`, `&&` + commande destructrice
- **GRAYLIST** : `reboot`, `systemctl stop`, `docker rm` (confirmation requise)

### CryptoManager — Chiffrement unifie

Tous les mots de passe serveur sont chiffres en **AES-256-CBC** via `crypto-manager.js` :
- Cle derivee du JWT_SECRET via `scrypt` (resistant brute-force)
- IV aleatoire par operation (pas de pattern repetable)
- Retrocompatibilite Base64 pour migration transparente

## API Endpoints

### Authentification
```
POST /api/auth/login          # Connexion
POST /api/auth/refresh        # Rafraichir token
GET  /api/auth/user           # Infos utilisateur
```

### Docker
```
GET    /api/docker/containers        # Lister conteneurs
POST   /api/docker/containers        # Creer conteneur
POST   /api/docker/containers/:id/start
POST   /api/docker/containers/:id/stop
POST   /api/docker/containers/:id/restart
DELETE /api/docker/containers/:id
GET    /api/docker/images            # Lister images
POST   /api/docker/images/pull       # Pull image
```

### Monitoring
```
GET  /api/monitoring/metrics          # Metriques temps reel
GET  /api/monitoring/metrics/history  # Historique
POST /api/monitoring/remote           # Metriques serveur distant
POST /api/monitoring/alerts/config    # Configuration alertes
```

### Agent / Execution
```
POST /api/agent/execute              # Executer sur N serveurs
POST /api/agent/servers              # Ajouter serveur
POST /api/agent/servers/:id/test     # Tester connexion
GET  /api/agent/history              # Historique commandes
```

### CI/CD
```
GET  /api/cicd/pipelines             # Lister pipelines
POST /api/cicd/pipelines             # Creer pipeline
POST /api/cicd/webhook/github        # Webhook GitHub
POST /api/cicd/webhook/gitlab        # Webhook GitLab
POST /api/cicd/deployments/:id/rollback
```

### WebSocket
```
ws://host:4000/api/terminal/ws       # Terminal SSH interactif
```

## Structure du projet

```
vps-devops-agent/
├── backend/
│   ├── routes/              # API endpoints (15+ routes)
│   ├── services/            # Logique metier
│   │   ├── crypto-manager.js    # [NEW] Chiffrement AES centralise
│   │   ├── command-guard.js     # [NEW] Pare-feu de commandes
│   │   ├── agent-executor.js    # Execution SSH
│   │   ├── docker-manager.js    # API Docker
│   │   ├── system-monitor.js    # Metriques systeme
│   │   └── ssh-terminal.js      # Terminal WebSocket
│   ├── middleware/           # Auth, cache, validation, rate-limit
│   ├── config/               # Logger, Swagger, plans
│   ├── __tests__/            # Tests unitaires
│   └── server.js             # Point d'entree
├── frontend/                 # Interface web (Vanilla JS + TailwindCSS)
├── deploy/
│   ├── install.sh            # Script installation Contabo
│   └── nginx/                # Config Nginx production
├── migrations/               # Schemas SQL
├── ecosystem.config.cjs      # PM2 config (production)
├── .env.example              # Template configuration
└── package.json
```

## Configuration

| Variable | Obligatoire | Description |
|----------|:-----------:|-------------|
| `JWT_SECRET` | oui | Min 32 chars, genere par `openssl rand -hex 48` |
| `ADMIN_USERNAME` | oui | Nom d'utilisateur admin |
| `ADMIN_PASSWORD` | oui | Min 8 chars, pas de valeur par defaut |
| `PORT` | non | Port du serveur (defaut: 4000) |
| `TOKEN_EXPIRY` | non | Duree token JWT (defaut: 1h) |
| `OPENAI_API_KEY` | non | Cle API OpenAI pour l'agent IA |
| `AI_PROVIDER` | non | `openai` ou `deepseek` |

## Tests

```bash
# Tests unitaires
npm test

# Tests avec couverture
npm run test:coverage
```

## Deploiement

Le script `deploy/install.sh` installe automatiquement sur un VPS Contabo :
- Node.js 20, PM2, Docker, Nginx, SQLite3
- Firewall UFW, fail2ban
- SSL Let's Encrypt (si domaine fourni)
- Configuration production complete

## Licence

MIT - Voir [LICENSE](LICENSE)
