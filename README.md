# VPS DevOps Agent

Plateforme DevOps web complète pour administrer un ou plusieurs VPS depuis un navigateur, avec le meme niveau de controle qu'un acces SSH direct. Integre un assistant IA, la gestion Docker, le monitoring temps reel, les pipelines CI/CD, et un terminal SSH WebSocket — le tout securise par JWT, rate limiting, chiffrement AES-256-CBC, et un pare-feu de commandes.

## Sommaire

- [Fonctionnalites](#fonctionnalites)
- [Architecture](#architecture)
- [Installation rapide (VPS Contabo)](#installation-rapide-vps-contabo)
- [Installation manuelle](#installation-manuelle)
- [Configuration (.env)](#configuration-env)
- [API — Points d'entree](#api--points-dentree)
- [Securite](#securite)
- [Structure du projet](#structure-du-projet)
- [Tests](#tests)
- [Deploiement Docker](#deploiement-docker)
- [Roadmap](#roadmap)

---

## Fonctionnalites

### Implementees

| Module | Description | Etat |
|--------|-------------|------|
| **Dashboard** | Vue d'ensemble systeme (CPU, RAM, disque, reseau) | OK |
| **Terminal SSH** | Terminal xterm.js via WebSocket — comme un vrai SSH | OK |
| **Docker Manager** | Conteneurs, images, logs, stats, creation, Dockerfile generator | OK |
| **Monitoring** | Metriques temps reel + historique (30j) + alertes email/Telegram | OK |
| **CI/CD Pipelines** | Webhooks GitHub/GitLab, build/deploy automatise | OK |
| **Assistant IA** | Agent autonome (OpenAI/DeepSeek) pour diagnostics et execution | OK |
| **Gestion multi-serveurs** | Ajouter N serveurs, executer des commandes sur tous | OK |
| **CommandGuard** | Pare-feu de commandes (blacklist/graylist/injection detection) | OK |
| **Auth JWT** | Token 1h, refresh 7j, rate limiting, bcrypt | OK |
| **Chiffrement AES-256-CBC** | Tous les mots de passe serveur chiffres (scrypt + AES) | OK |
| **Nginx reverse proxy** | HTTPS/TLS, WebSocket proxy, rate limiting, headers securite | OK |
| **Script d'installation Contabo** | Installation one-shot avec SSL automatique | OK |

### Non implementees (Roadmap)

- Frontend Vue.js/React SPA (actuellement HTML multi-pages)
- Prometheus + Grafana pour monitoring avance
- Multi-tenant (plusieurs equipes/organisations)
- Support Kubernetes
- RBAC granulaire (roles/permissions par ressource)
- Audit trail complet avec export

---

## Architecture

```
Client (navigateur)
    |
    | HTTPS (443)
    v
+-------------------+
|   Nginx           |   Rate limiting, SSL/TLS, WebSocket proxy
|   reverse proxy   |   Headers securite (HSTS, CSP, X-Frame)
+-------------------+
    |
    | HTTP (127.0.0.1:4000)
    v
+-------------------+
|   Express.js      |   Node.js 20 — backend principal
|   + Hono-style    |   Helmet, compression, CORS, validation
|   middleware       |   JWT auth, rate limiting, security logger
+-------------------+
    |
    +--- WebSocket (ws) -----> SSH (ssh2) ----> VPS cibles
    |
    +--- REST API ------------> Docker (dockerode)
    |                           SQLite (better-sqlite3)
    |                           OpenAI / DeepSeek
    |
    +--- Static files --------> Frontend HTML/TailwindCSS/Chart.js
    |
    +--- PM2 -----------------> Process manager (auto-restart)
```

**Stack technique :**
- **Backend** : Node.js 20, Express, better-sqlite3, ws, ssh2, dockerode, jsonwebtoken, bcrypt
- **Frontend** : HTML5, TailwindCSS (CDN), Chart.js, xterm.js, Vanilla JS
- **Process** : PM2 (fork mode, auto-restart, memory limit 500MB)
- **Reverse proxy** : Nginx (SSL Let's Encrypt, rate limiting, WebSocket)
- **Base de donnees** : SQLite3 (local, zero config)

---

## Installation rapide (VPS Contabo)

### Prerequis

- VPS Contabo Ubuntu 22.04/24.04 ou Debian 11/12
- Acces root (SSH)
- (Optionnel) Nom de domaine pointe vers l'IP du VPS

### Installation en une commande

```bash
# Telecharger et executer le script d'installation
curl -sSL https://raw.githubusercontent.com/AlterEgo095/vps-devops-agent/main/deploy/install.sh | sudo bash
```

Le script installe automatiquement :
- Node.js 20 LTS + PM2
- Docker + Docker Compose
- Nginx + Certbot (SSL Let's Encrypt)
- UFW firewall + fail2ban
- Le projet VPS DevOps Agent
- Configuration .env avec secrets generes automatiquement

A la fin, l'installateur affiche :
- L'URL d'acces (HTTPS si domaine, HTTP si IP seule)
- Le nom d'utilisateur admin
- Le mot de passe admin genere (a noter immediatement)

---

## Installation manuelle

```bash
# 1. Cloner le repo
git clone https://github.com/AlterEgo095/vps-devops-agent.git
cd vps-devops-agent

# 2. Installer les dependances
npm install

# 3. Configurer l'environnement
cp .env.example .env
nano .env   # Remplir TOUTES les valeurs obligatoires

# 4. Migrer la base de donnees
npm run db:migrate

# 5. Demarrer avec PM2
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup   # Pour auto-start au boot

# 6. (Production) Configurer Nginx
sudo cp deploy/nginx/vps-devops-agent.conf /etc/nginx/sites-available/
sudo ln -s /etc/nginx/sites-available/vps-devops-agent.conf /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

---

## Configuration (.env)

| Variable | Obligatoire | Description |
|----------|:-----------:|-------------|
| `PORT` | oui | Port du serveur (defaut: 4000) |
| `NODE_ENV` | oui | `production` ou `development` |
| `JWT_SECRET` | **oui** | Minimum 32 caracteres aleatoires. `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"` |
| `ADMIN_USERNAME` | **oui** | Nom d'utilisateur admin |
| `ADMIN_PASSWORD` | **oui** | Minimum 8 caracteres, pas de valeur par defaut |
| `TOKEN_EXPIRY` | non | Duree token JWT (defaut: `1h`) |
| `REFRESH_EXPIRY` | non | Duree refresh token (defaut: `7d`) |
| `AI_PROVIDER` | non | `openai` ou `deepseek` |
| `OPENAI_API_KEY` | non | Cle API OpenAI |
| `DEEPSEEK_API_KEY` | non | Cle API DeepSeek |
| `AGENT_WORKSPACE` | non | Repertoire projets (defaut: `/opt/agent-projects`) |
| `ALLOWED_DOCKER_NETWORKS` | non | Reseaux Docker autorises |
| `ALLOWED_COMMANDS` | non | Commandes supplementaires autorisees |
| `ENABLE_DRY_RUN` | non | Mode simulation (defaut: `false`) |
| `REQUIRE_APPROVAL` | non | Confirmation avant execution (defaut: `true`) |
| `ALLOWED_ORIGINS` | non | Origines CORS (virgule, ex: `https://admin.monvps.fr`) |
| `SMTP_HOST/PORT/USER/PASS` | non | Alertes email |
| `TELEGRAM_BOT_TOKEN/CHAT_ID` | non | Alertes Telegram |

> **IMPORTANT** : Le serveur **refuse de demarrer** si `JWT_SECRET` < 32 chars ou si `ADMIN_PASSWORD` est absent/trop court/valeur par defaut.

---

## API — Points d'entree

Toutes les routes API sont sous `/api/` et necessitent un token JWT (`Authorization: Bearer <token>`) sauf indication contraire.

### Authentification

| Methode | URI | Auth | Description |
|---------|-----|:----:|-------------|
| `POST` | `/api/auth/login` | non | Connexion (rate-limited: 10/15min) |
| `POST` | `/api/auth/register` | non | Inscription (rate-limited: 5/h) |
| `POST` | `/api/auth/change-password` | oui | Changer mot de passe |
| `GET` | `/api/health` | non | Health check du serveur |

### Gestion des serveurs

| Methode | URI | Description |
|---------|-----|-------------|
| `GET` | `/api/agent/servers` | Lister mes serveurs |
| `POST` | `/api/agent/servers` | Ajouter un serveur (chiffrement AES-256-CBC auto) |
| `PUT` | `/api/agent/servers/:id` | Modifier un serveur |
| `DELETE` | `/api/agent/servers/:id` | Supprimer un serveur |
| `POST` | `/api/agent/servers/:id/test` | Tester la connexion SSH |
| `GET` | `/api/agent/servers/:id/metrics` | Metriques d'un serveur distant |

### Execution de commandes

| Methode | URI | Description |
|---------|-----|-------------|
| `POST` | `/api/agent/execute` | Executer sur plusieurs serveurs (CommandGuard actif) |
| `POST` | `/api/ai/agent/execute-command` | Executer sur un serveur (CommandGuard actif) |
| `GET` | `/api/agent/history` | Historique des commandes |
| `GET` | `/api/agent/stats` | Statistiques d'execution |

### Docker

| Methode | URI | Description |
|---------|-----|-------------|
| `GET` | `/api/docker/containers` | Lister les conteneurs |
| `GET` | `/api/docker/containers/:id` | Details d'un conteneur |
| `GET` | `/api/docker/containers/:id/stats` | Stats CPU/RAM/reseau |
| `GET` | `/api/docker/containers/:id/logs` | Logs (tail configurable) |
| `POST` | `/api/docker/containers` | Creer un conteneur |
| `POST` | `/api/docker/containers/:id/start` | Demarrer |
| `POST` | `/api/docker/containers/:id/stop` | Arreter |
| `POST` | `/api/docker/containers/:id/restart` | Redemarrer |
| `DELETE` | `/api/docker/containers/:id` | Supprimer |
| `GET` | `/api/docker/images` | Lister les images |
| `POST` | `/api/docker/images/pull` | Telecharger une image |
| `DELETE` | `/api/docker/images/:id` | Supprimer une image |
| `POST` | `/api/docker/generate/dockerfile` | Generer un Dockerfile |
| `POST` | `/api/docker/generate/compose` | Generer docker-compose.yml |
| `GET` | `/api/docker/health` | Sante Docker |

### Monitoring

| Methode | URI | Description |
|---------|-----|-------------|
| `GET` | `/api/monitoring/metrics` | Metriques systeme (cache 10s) |
| `GET` | `/api/monitoring/metrics/history` | Historique (24h/7d/30d) |
| `POST` | `/api/monitoring/remote` | Metriques d'un serveur distant via SSH |
| `GET/POST` | `/api/monitoring/alerts/config` | Configuration alertes |
| `POST` | `/api/monitoring/alerts/test/email` | Test email |
| `POST` | `/api/monitoring/alerts/test/telegram` | Test Telegram |

### Terminal SSH (WebSocket)

| Type | URI | Description |
|------|-----|-------------|
| `WS` | `/api/terminal/ws` | Terminal SSH via WebSocket (auth JWT) |
| `GET` | `/api/terminal/sessions` | Sessions actives (auth JWT) |

**Protocole WebSocket :**
1. Connecter a `wss://votre-domaine/api/terminal/ws`
2. Envoyer `{ type: 'auth', token: 'votre-jwt-token' }`
3. Envoyer `{ type: 'connect', serverId: 123 }` ou `{ type: 'connect', serverConfig: {...} }`
4. Envoyer `{ type: 'data', data: 'ls -la\n' }` pour executer
5. Envoyer `{ type: 'resize', cols: 120, rows: 40 }` pour redimensionner
6. Envoyer `{ type: 'disconnect' }` pour fermer

### CI/CD

| Methode | URI | Auth | Description |
|---------|-----|:----:|-------------|
| `POST` | `/api/cicd/webhooks/github` | HMAC | Webhook GitHub (signature SHA-256) |
| `POST` | `/api/cicd/webhooks/gitlab` | HMAC | Webhook GitLab (X-Gitlab-Token) |
| `GET` | `/api/cicd/*` | JWT | Gestion des pipelines |

### Assistant IA

| Methode | URI | Description |
|---------|-----|-------------|
| `POST` | `/api/ai/agent/*` | Agent IA autonome (analyse, execution, diagnostic) |
| `POST` | `/api/autonomous/*` | Mode autonome (plans d'action IA) |

---

## Securite

### Couches de protection

| Couche | Composant | Details |
|--------|-----------|---------|
| **1. Reseau** | UFW Firewall | SSH + HTTP + HTTPS seulement |
| **2. Brute-force** | fail2ban | Ban 1h apres 3 echecs SSH, 10 echecs Nginx |
| **3. TLS** | Let's Encrypt | TLS 1.2/1.3, HSTS preload, stapling OCSP |
| **4. Headers** | Helmet + Nginx | CSP, X-Frame, X-Content-Type, Referrer-Policy |
| **5. Rate Limit** | express-rate-limit + Nginx | API: 100/min, Auth: 10/15min, WS: 10/s |
| **6. Auth** | JWT + bcrypt | Token 1h, refresh 7j, mot de passe hashe |
| **7. Validation** | Joi + express-validator | Schemas stricts sur tous les inputs |
| **8. CORS** | Restrictif | Origines explicites en production |
| **9. Chiffrement** | AES-256-CBC + scrypt | Mots de passe serveur chiffres (cle derivee de JWT_SECRET) |
| **10. Commandes** | CommandGuard | Blacklist absolue, detection d'injection, graylist confirmation |

### CommandGuard — Pare-feu de commandes

```
BLACKLIST (BLOQUE) :
  rm -rf /, mkfs, dd, shutdown, poweroff, halt, fork bomb,
  docker system prune -a --volumes, grub-install, ufw disable...

INJECTION (BLOQUE) :
  ; rm, | rm, `rm`, $(rm), && shutdown, curl|bash, eval, >/etc/passwd...

GRAYLIST (CONFIRMATION REQUISE) :
  reboot, systemctl stop, apt remove, docker stop/rm, kill -9,
  iptables, DROP TABLE, pm2 delete all, nginx stop...

AUTORISE :
  ls, cat, grep, docker ps, git status, npm list, pm2 list, curl -s...
```

---

## Structure du projet

```
vps-devops-agent/
|-- backend/
|   |-- __tests__/              # Tests unitaires (Jest)
|   |   |-- command-guard.test.js
|   |   |-- crypto-manager.test.js
|   |   |-- security-api.test.js
|   |   |-- validation.test.js
|   |-- config/                 # Configuration (logger Winston, Swagger, etc.)
|   |-- database/               # Schemas SQL + init
|   |-- middleware/              # Auth JWT, rate-limit, validation, cache, RBAC
|   |-- migrations/             # Migrations SQLite
|   |-- routes/                 # Routes Express (auth, agent, docker, monitoring, terminal, cicd)
|   |-- scripts/                # Scripts utilitaires (create-admin, init-db)
|   |-- services/               # Logique metier
|   |   |-- command-guard.js    # [NOUVEAU] Pare-feu de commandes
|   |   |-- crypto-manager.js   # [NOUVEAU] Chiffrement AES-256-CBC centralise
|   |   |-- agent-executor.js   # Execution SSH + analyse IA
|   |   |-- ai-agent.js         # Integration OpenAI/DeepSeek
|   |   |-- docker-manager.js   # Gestion Docker via dockerode
|   |   |-- ssh-executor.js     # Client SSH (ssh2)
|   |   |-- ssh-terminal.js     # Terminal SSH interactif
|   |   |-- system-monitor.js   # Metriques systeme (systeminformation)
|   |   |-- alert-manager.js    # Alertes email/Telegram
|   |   |-- ...
|   |-- server.js               # Point d'entree Express
|-- frontend/                   # Interface web (HTML + TailwindCSS + JS)
|   |-- index.html              # Page d'accueil / login
|   |-- dashboard.html          # Dashboard principal
|   |-- terminal-ssh.html       # Terminal SSH (xterm.js)
|   |-- docker-manager.html     # Gestion Docker
|   |-- monitoring.html         # Monitoring temps reel
|   |-- cicd.html               # Pipelines CI/CD
|   |-- agent-devops.html       # Agent DevOps IA
|   |-- ...
|-- deploy/
|   |-- install.sh              # Script installation Contabo (one-shot)
|   |-- nginx/
|   |   |-- vps-devops-agent.conf  # Config Nginx production
|   |-- systemd/                # (optionnel) Service systemd
|-- docs/
|   |-- archive/                # Anciens documents d'audit et rapports
|-- migrations/                 # Migrations SQL racine
|-- ecosystem.config.cjs        # Configuration PM2 production
|-- .env.example                # Template de configuration
|-- .gitignore                  # Fichiers ignores
|-- package.json                # Dependances et scripts
```

---

## Tests

```bash
# Tests unitaires
npm test

# Avec couverture
npm run test:coverage

# Tests d'integration
npm run test:integration

# Tests end-to-end
npm run test:e2e
```

Les tests couvrent :
- **CommandGuard** : blacklist, injection, graylist, edge cases
- **CryptoManager** : chiffrement AES, dechiffrement, retrocompatibilite Base64, migration
- **API Security** : validation inputs, headers
- **Validation schemas** : schemas Joi sur tous les endpoints

---

## Deploiement Docker

```bash
# Build
docker build -t vps-devops-agent .

# Run
docker run -d \
  --name vps-devops-agent \
  -p 4000:4000 \
  -v $(pwd)/data:/opt/vps-devops-agent/data \
  -v $(pwd)/logs:/opt/vps-devops-agent/logs \
  -v /var/run/docker.sock:/var/run/docker.sock \
  --env-file .env \
  --restart unless-stopped \
  vps-devops-agent

# Docker Compose
docker-compose up -d
```

---

## Guide d'utilisation

1. **Premiere connexion** : Accedez a `https://votre-domaine` (ou `http://IP:4000`), connectez-vous avec les identifiants admin
2. **Ajouter un serveur** : Dashboard > Serveurs > Ajouter (host, port SSH, username, mot de passe — chiffre automatiquement)
3. **Terminal SSH** : Cliquez sur un serveur > Terminal — vous obtenez un vrai terminal SSH dans le navigateur
4. **Docker** : Docker Manager > visualisez/gerez vos conteneurs, images, stats
5. **Monitoring** : Monitoring > metriques temps reel, configurez les alertes email/Telegram
6. **IA** : Agent DevOps > posez une question, l'IA analyse et propose un plan d'action
7. **CI/CD** : Configurez les webhooks GitHub/GitLab pour des deployements automatiques

---

## Roadmap

- [ ] Frontend Vue.js/React SPA (remplacement des pages HTML)
- [ ] Prometheus + Grafana pour monitoring avance
- [ ] Multi-tenant (equipes/organisations)
- [ ] Support Kubernetes (clusters)
- [ ] RBAC granulaire par ressource
- [ ] Audit trail complet avec export CSV/JSON
- [ ] Backup automatique des configurations
- [ ] Marketplace de templates de deploiement

---

## Licence

MIT - Voir le fichier [LICENSE](LICENSE)

## Support

- **Issues** : [GitHub Issues](https://github.com/AlterEgo095/vps-devops-agent/issues)
- **Discussions** : [GitHub Discussions](https://github.com/AlterEgo095/vps-devops-agent/discussions)
