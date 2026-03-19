#!/bin/bash
# ============================================================
# VPS DevOps Agent — Script d'installation pour VPS Contabo
# ============================================================
#
# COMPATIBILITÉ: Ubuntu 22.04/24.04, Debian 11/12
# PRÉREQUIS: Accès root sur un VPS Contabo fraîchement provisionné
#
# UTILISATION:
#   curl -sSL https://raw.githubusercontent.com/AlterEgo095/vps-devops-agent/main/deploy/install.sh | bash
#   # OU
#   chmod +x deploy/install.sh && sudo ./deploy/install.sh
#
# CE SCRIPT INSTALLE:
#   - Node.js 20 LTS (via NodeSource)
#   - PM2 (process manager)
#   - Nginx (reverse proxy)
#   - Certbot (SSL Let's Encrypt)
#   - Docker + Docker Compose
#   - SQLite3
#   - fail2ban (protection brute-force)
#   - UFW firewall
#   - VPS DevOps Agent (le projet)
#
# ============================================================

set -euo pipefail

# ============================================================
# COULEURS ET HELPERS
# ============================================================
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

log()    { echo -e "${GREEN}[✓]${NC} $1"; }
warn()   { echo -e "${YELLOW}[⚠]${NC} $1"; }
error()  { echo -e "${RED}[✗]${NC} $1"; }
info()   { echo -e "${BLUE}[i]${NC} $1"; }
header() { echo -e "\n${CYAN}═══════════════════════════════════════════════════${NC}"; echo -e "${CYAN}  $1${NC}"; echo -e "${CYAN}═══════════════════════════════════════════════════${NC}\n"; }

# ============================================================
# VÉRIFICATIONS PRÉLIMINAIRES
# ============================================================
header "VPS DevOps Agent — Installation Contabo"

if [[ $EUID -ne 0 ]]; then
   error "Ce script doit être exécuté en tant que root (sudo)"
   exit 1
fi

# Détecter l'OS
if ! grep -qiE 'ubuntu|debian' /etc/os-release 2>/dev/null; then
    error "OS non supporté. Ubuntu 22.04+ ou Debian 11+ requis."
    exit 1
fi

OS_VERSION=$(grep VERSION_ID /etc/os-release | cut -d'"' -f2)
log "OS détecté: $(grep PRETTY_NAME /etc/os-release | cut -d'"' -f2)"

# ============================================================
# VARIABLES DE CONFIGURATION
# ============================================================
APP_DIR="/opt/vps-devops-agent"
APP_USER="devops-agent"
DOMAIN=""
ADMIN_USER="admin"

echo ""
read -p "$(echo -e ${YELLOW})[?]$(echo -e ${NC}) Entrez votre nom de domaine (ex: admin.monvps.fr) [laisser vide pour IP seule]: " DOMAIN
read -p "$(echo -e ${YELLOW})[?]$(echo -e ${NC}) Nom d'utilisateur admin [admin]: " ADMIN_INPUT
ADMIN_USER="${ADMIN_INPUT:-admin}"

# Générer des secrets sécurisés
JWT_SECRET=$(openssl rand -hex 48)
ADMIN_PASSWORD=$(openssl rand -base64 16 | tr -d '=/+' | head -c 16)

echo ""
info "Configuration:"
info "  Domaine:        ${DOMAIN:-'(accès par IP)'}"
info "  Admin user:     $ADMIN_USER"
info "  Admin password: $ADMIN_PASSWORD"
info "  Répertoire:     $APP_DIR"
warn "NOTEZ VOTRE MOT DE PASSE ADMIN: $ADMIN_PASSWORD"
echo ""
read -p "Continuer l'installation ? (o/N) " -n 1 -r
echo ""
if [[ ! $REPLY =~ ^[oOyY]$ ]]; then
    error "Installation annulée."
    exit 1
fi

# ============================================================
# 1. MISE À JOUR SYSTÈME
# ============================================================
header "1/9 — Mise à jour du système"

export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get upgrade -y -qq
apt-get install -y -qq curl wget git build-essential software-properties-common \
    apt-transport-https ca-certificates gnupg lsb-release sqlite3 jq
log "Système mis à jour"

# ============================================================
# 2. NODE.JS 20 LTS
# ============================================================
header "2/9 — Installation Node.js 20 LTS"

if ! command -v node &>/dev/null || [[ $(node -v | cut -d'.' -f1 | tr -d 'v') -lt 20 ]]; then
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt-get install -y -qq nodejs
    log "Node.js $(node -v) installé"
else
    log "Node.js $(node -v) déjà installé"
fi

# PM2
if ! command -v pm2 &>/dev/null; then
    npm install -g pm2
    log "PM2 installé"
else
    log "PM2 déjà installé"
fi

# ============================================================
# 3. DOCKER + DOCKER COMPOSE
# ============================================================
header "3/9 — Installation Docker"

if ! command -v docker &>/dev/null; then
    curl -fsSL https://get.docker.com | sh
    systemctl enable docker
    systemctl start docker
    log "Docker $(docker -v | awk '{print $3}') installé"
else
    log "Docker déjà installé"
fi

# ============================================================
# 4. NGINX
# ============================================================
header "4/9 — Installation Nginx"

if ! command -v nginx &>/dev/null; then
    apt-get install -y -qq nginx
    systemctl enable nginx
    log "Nginx installé"
else
    log "Nginx déjà installé"
fi

# ============================================================
# 5. FIREWALL (UFW)
# ============================================================
header "5/9 — Configuration Firewall"

ufw --force reset >/dev/null 2>&1
ufw default deny incoming
ufw default allow outgoing
ufw allow ssh
ufw allow http
ufw allow https
ufw --force enable
log "Firewall UFW configuré (SSH, HTTP, HTTPS)"

# ============================================================
# 6. FAIL2BAN
# ============================================================
header "6/9 — Installation fail2ban"

if ! command -v fail2ban-client &>/dev/null; then
    apt-get install -y -qq fail2ban
fi

cat > /etc/fail2ban/jail.local << 'EOF'
[DEFAULT]
bantime  = 3600
findtime = 600
maxretry = 5
backend  = systemd

[sshd]
enabled  = true
port     = ssh
filter   = sshd
maxretry = 3

[nginx-limit-req]
enabled  = true
port     = http,https
filter   = nginx-limit-req
logpath  = /var/log/nginx/*.log
maxretry = 10
EOF

systemctl enable fail2ban
systemctl restart fail2ban
log "fail2ban configuré (SSH + Nginx)"

# ============================================================
# 7. CLONER ET INSTALLER LE PROJET
# ============================================================
header "7/9 — Installation VPS DevOps Agent"

# Créer l'utilisateur système (non-interactif)
if ! id "$APP_USER" &>/dev/null; then
    useradd -r -m -s /bin/bash -d /home/$APP_USER $APP_USER
    usermod -aG docker $APP_USER
    log "Utilisateur $APP_USER créé"
fi

# Cloner le repo
if [ -d "$APP_DIR" ]; then
    warn "Répertoire $APP_DIR existant — mise à jour..."
    cd "$APP_DIR"
    git pull origin main || true
else
    git clone https://github.com/AlterEgo095/vps-devops-agent.git "$APP_DIR"
    cd "$APP_DIR"
fi

# Installer les dépendances
npm ci --omit=dev
log "Dépendances installées"

# Créer les répertoires nécessaires
mkdir -p "$APP_DIR/logs" "$APP_DIR/data" "$APP_DIR/backups"
mkdir -p /opt/agent-projects

# ============================================================
# 8. CONFIGURATION
# ============================================================
header "8/9 — Configuration"

# Créer le fichier .env
cat > "$APP_DIR/.env" << EOF
# ============================================================
# VPS DevOps Agent — Production Configuration
# Généré automatiquement le $(date -Iseconds)
# ============================================================

# Serveur
PORT=4000
NODE_ENV=production

# Sécurité
JWT_SECRET=$JWT_SECRET
ADMIN_USERNAME=$ADMIN_USER
ADMIN_PASSWORD=$ADMIN_PASSWORD
TOKEN_EXPIRY=1h
REFRESH_EXPIRY=7d

# IA (configurer votre provider)
# OPENAI_API_KEY=sk-...
# DEEPSEEK_API_KEY=sk-...
AI_PROVIDER=openai

# Docker
AGENT_WORKSPACE=/opt/agent-projects
ALLOWED_DOCKER_NETWORKS=agent-network

# Sécurité avancée
ENABLE_DRY_RUN=false
REQUIRE_APPROVAL=true
ALLOWED_COMMANDS=docker,npm,node,git,mkdir,chmod,systemctl,apt,curl,wget,pm2,nginx

# Alertes (optionnel)
# SMTP_HOST=smtp.gmail.com
# SMTP_PORT=587
# SMTP_USER=
# SMTP_PASS=
# TELEGRAM_BOT_TOKEN=
# TELEGRAM_CHAT_ID=
EOF

chmod 600 "$APP_DIR/.env"
log "Fichier .env créé (permissions 600)"

# Initialiser la base de données
cd "$APP_DIR"
npm run db:migrate 2>/dev/null || true
log "Base de données initialisée"

# Permissions
chown -R $APP_USER:$APP_USER "$APP_DIR"
chown -R $APP_USER:$APP_USER /opt/agent-projects
log "Permissions configurées"

# Configurer PM2
su - $APP_USER -c "cd $APP_DIR && pm2 start ecosystem.config.cjs"
su - $APP_USER -c "pm2 save"
env PATH=$PATH:/usr/bin pm2 startup systemd -u $APP_USER --hp /home/$APP_USER
log "PM2 configuré et démarré"

# ============================================================
# 9. CONFIGURATION NGINX + SSL
# ============================================================
header "9/9 — Configuration Nginx + SSL"

if [ -n "$DOMAIN" ]; then
    # Copier la config Nginx
    sed "s/YOUR_DOMAIN/$DOMAIN/g" "$APP_DIR/deploy/nginx/vps-devops-agent.conf" \
        > /etc/nginx/sites-available/vps-devops-agent.conf
    
    # Activer le site
    rm -f /etc/nginx/sites-enabled/default
    ln -sf /etc/nginx/sites-available/vps-devops-agent.conf /etc/nginx/sites-enabled/
    
    # Installer Certbot et obtenir le certificat SSL
    apt-get install -y -qq certbot python3-certbot-nginx
    mkdir -p /var/www/certbot
    
    # D'abord démarrer Nginx en mode HTTP only pour la validation
    # Créer une config temporaire pour Let's Encrypt
    cat > /etc/nginx/sites-available/vps-devops-agent-temp.conf << TMPEOF
server {
    listen 80;
    server_name $DOMAIN;
    
    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }
    
    location / {
        proxy_pass http://127.0.0.1:4000;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
    }
}
TMPEOF
    
    ln -sf /etc/nginx/sites-available/vps-devops-agent-temp.conf /etc/nginx/sites-enabled/vps-devops-agent.conf
    nginx -t && systemctl reload nginx
    
    # Obtenir le certificat
    certbot certonly --webroot -w /var/www/certbot -d "$DOMAIN" --non-interactive --agree-tos -m "admin@$DOMAIN" || {
        warn "Échec Certbot. Vérifiez que le DNS de $DOMAIN pointe vers cette IP."
        warn "Vous pourrez relancer: sudo certbot certonly --nginx -d $DOMAIN"
    }
    
    # Remettre la config finale
    if [ -f "/etc/letsencrypt/live/$DOMAIN/fullchain.pem" ]; then
        sed "s/YOUR_DOMAIN/$DOMAIN/g" "$APP_DIR/deploy/nginx/vps-devops-agent.conf" \
            > /etc/nginx/sites-available/vps-devops-agent.conf
        ln -sf /etc/nginx/sites-available/vps-devops-agent.conf /etc/nginx/sites-enabled/
        rm -f /etc/nginx/sites-available/vps-devops-agent-temp.conf
        nginx -t && systemctl reload nginx
        log "SSL Let's Encrypt configuré pour $DOMAIN"
        
        # Renouvellement automatique
        echo "0 3 * * * certbot renew --quiet --post-hook 'systemctl reload nginx'" | crontab -
        log "Renouvellement SSL automatique configuré"
    fi
else
    # Mode IP seule (pas de SSL)
    cat > /etc/nginx/sites-available/vps-devops-agent.conf << 'NOSSL'
server {
    listen 80;
    server_name _;

    client_max_body_size 50M;
    
    location /api/terminal/ws {
        proxy_pass http://127.0.0.1:4000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_read_timeout 600s;
    }

    location / {
        proxy_pass http://127.0.0.1:4000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 300s;
    }
}
NOSSL
    
    rm -f /etc/nginx/sites-enabled/default
    ln -sf /etc/nginx/sites-available/vps-devops-agent.conf /etc/nginx/sites-enabled/
    nginx -t && systemctl reload nginx
    log "Nginx configuré (mode HTTP/IP)"
fi

# ============================================================
# RÉSUMÉ FINAL
# ============================================================
SERVER_IP=$(curl -s ifconfig.me 2>/dev/null || hostname -I | awk '{print $1}')

echo ""
echo -e "${GREEN}╔══════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║        INSTALLATION TERMINÉE AVEC SUCCÈS !              ║${NC}"
echo -e "${GREEN}╠══════════════════════════════════════════════════════════╣${NC}"
echo -e "${GREEN}║                                                          ║${NC}"
if [ -n "$DOMAIN" ]; then
echo -e "${GREEN}║  URL:       https://$DOMAIN$(printf '%*s' $((35 - ${#DOMAIN})) '')║${NC}"
else
echo -e "${GREEN}║  URL:       http://$SERVER_IP$(printf '%*s' $((37 - ${#SERVER_IP})) '')║${NC}"
fi
echo -e "${GREEN}║  Admin:     $ADMIN_USER$(printf '%*s' $((43 - ${#ADMIN_USER})) '')║${NC}"
echo -e "${GREEN}║  Password:  $ADMIN_PASSWORD$(printf '%*s' $((43 - ${#ADMIN_PASSWORD})) '')║${NC}"
echo -e "${GREEN}║                                                          ║${NC}"
echo -e "${GREEN}║  Répertoire: $APP_DIR$(printf '%*s' $((42 - ${#APP_DIR})) '')║${NC}"
echo -e "${GREEN}║  PM2:        pm2 status / pm2 logs                      ║${NC}"
echo -e "${GREEN}║  .env:       $APP_DIR/.env$(printf '%*s' $((37 - ${#APP_DIR})) '')║${NC}"
echo -e "${GREEN}║                                                          ║${NC}"
echo -e "${GREEN}║  NOTEZ CE MOT DE PASSE — il ne sera plus affiché !      ║${NC}"
echo -e "${GREEN}║                                                          ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════════════════════╝${NC}"
echo ""
info "Prochaines étapes :"
info "  1. Configurez votre clé API IA dans $APP_DIR/.env"
info "  2. Redémarrez: su - $APP_USER -c 'cd $APP_DIR && pm2 restart all'"
info "  3. Accédez au dashboard et connectez vos serveurs"
echo ""
