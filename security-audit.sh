#!/bin/bash

################################################################################
# 🔍 SCRIPT D'AUDIT DE SÉCURITÉ - VPS DEVOPS AGENT
# Version: 1.0
# Date: 2025-11-24
# Description: Audit automatisé de sécurité pour identifier les vulnérabilités
################################################################################

set -e

# Couleurs
RED='\033[0;31m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
PROJECT_DIR="/opt/vps-devops-agent"
BACKEND_DIR="$PROJECT_DIR/backend"
FRONTEND_DIR="$PROJECT_DIR/frontend"
DB_PATH="$PROJECT_DIR/data/devops-agent.db"
REPORT_FILE="$PROJECT_DIR/SECURITY_AUDIT_$(date +%Y%m%d-%H%M%S).txt"

# Compteurs
CRITICAL_ISSUES=0
HIGH_ISSUES=0
MEDIUM_ISSUES=0
LOW_ISSUES=0
INFO_ISSUES=0

################################################################################
# FONCTIONS UTILITAIRES
################################################################################

log_header() {
    echo -e "\n${BLUE}═══════════════════════════════════════════════════════════════${NC}"
    echo -e "${BLUE}   $1${NC}"
    echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}\n"
}

log_critical() {
    echo -e "${RED}🔴 CRITIQUE:${NC} $1"
    ((CRITICAL_ISSUES++))
}

log_high() {
    echo -e "${RED}🟠 HAUTE:${NC} $1"
    ((HIGH_ISSUES++))
}

log_medium() {
    echo -e "${YELLOW}🟡 MOYENNE:${NC} $1"
    ((MEDIUM_ISSUES++))
}

log_low() {
    echo -e "${YELLOW}🔵 BASSE:${NC} $1"
    ((LOW_ISSUES++))
}

log_info() {
    echo -e "${GREEN}ℹ️  INFO:${NC} $1"
    ((INFO_ISSUES++))
}

log_ok() {
    echo -e "${GREEN}✅ OK:${NC} $1"
}

################################################################################
# VÉRIFICATIONS DE SÉCURITÉ
################################################################################

audit_jwt_configuration() {
    log_header "1. AUDIT JWT & SECRETS"
    
    # Vérifier JWT_SECRET dans variables d'environnement
    if [ -f "$BACKEND_DIR/.env" ]; then
        if grep -q "JWT_SECRET" "$BACKEND_DIR/.env"; then
            SECRET=$(grep "JWT_SECRET" "$BACKEND_DIR/.env" | cut -d'=' -f2 | tr -d '"' | tr -d "'")
            SECRET_LENGTH=${#SECRET}
            
            if [ $SECRET_LENGTH -lt 32 ]; then
                log_critical "JWT_SECRET trop court ($SECRET_LENGTH caractères, minimum 32)"
                echo "  → Risque: Token JWT facile à brute-forcer"
                echo "  → Solution: Générer secret de 64+ caractères"
            elif [ $SECRET_LENGTH -lt 64 ]; then
                log_medium "JWT_SECRET acceptable mais court ($SECRET_LENGTH caractères, recommandé 64+)"
            else
                log_ok "JWT_SECRET longueur suffisante ($SECRET_LENGTH caractères)"
            fi
            
            # Vérifier si le secret est trivial
            if echo "$SECRET" | grep -qE "^(secret|password|123|test|admin)"; then
                log_critical "JWT_SECRET semble trivial ou prévisible"
                echo "  → Risque: Compromission facile"
                echo "  → Solution: Utiliser crypto.randomBytes(64).toString('hex')"
            fi
        else
            log_critical "JWT_SECRET non défini dans .env"
            echo "  → Risque: Utilisation d'un secret par défaut"
        fi
    else
        log_high ".env non trouvé, secrets possiblement en dur dans le code"
    fi
    
    # Vérifier expiration des tokens
    if [ -f "$BACKEND_DIR/middleware/auth.js" ]; then
        if grep -q "expiresIn.*7d" "$BACKEND_DIR/middleware/auth.js"; then
            log_ok "Token expiration: 7 jours (raisonnable)"
        elif grep -q "expiresIn.*30d\|expiresIn.*90d" "$BACKEND_DIR/middleware/auth.js"; then
            log_medium "Token expiration trop longue (30-90 jours)"
            echo "  → Risque: Token compromis valide longtemps"
            echo "  → Recommandation: 7 jours max + refresh tokens"
        elif grep -q "expiresIn.*24h\|expiresIn.*1d" "$BACKEND_DIR/middleware/auth.js"; then
            log_info "Token expiration courte (24h) - bonne pratique"
        fi
    fi
    
    # Vérifier algorithme JWT
    if [ -f "$BACKEND_DIR/middleware/auth.js" ]; then
        if grep -q "algorithm.*RS256\|algorithm.*ES256" "$BACKEND_DIR/middleware/auth.js"; then
            log_ok "Algorithme JWT asymétrique (RS256/ES256)"
        elif grep -q "algorithm.*HS256" "$BACKEND_DIR/middleware/auth.js"; then
            log_medium "Algorithme JWT symétrique (HS256)"
            echo "  → Recommandation: Utiliser RS256 pour production"
        elif grep -q "algorithm.*none" "$BACKEND_DIR/middleware/auth.js"; then
            log_critical "Algorithme JWT 'none' détecté - VULNÉRABILITÉ MAJEURE"
        fi
    fi
}

audit_authentication() {
    log_header "2. AUDIT AUTHENTIFICATION"
    
    # Vérifier 2FA
    if [ -f "$BACKEND_DIR/routes/auth.js" ]; then
        if grep -q "two_factor\|2fa\|totp" "$BACKEND_DIR/routes/auth.js"; then
            log_ok "2FA implémenté"
        else
            log_critical "2FA non implémenté"
            echo "  → Risque: Compromission si mot de passe volé"
            echo "  → Solution: Implémenter TOTP (speakeasy)"
        fi
    fi
    
    # Vérifier rate limiting
    if [ -f "$BACKEND_DIR/routes/auth.js" ]; then
        if grep -q "rateLimit\|express-rate-limit" "$BACKEND_DIR/routes/auth.js"; then
            log_ok "Rate limiting détecté"
        else
            log_critical "Rate limiting non implémenté sur /login"
            echo "  → Risque: Attaques brute-force possibles"
            echo "  → Solution: express-rate-limit (max 5 tentatives/15min)"
        fi
    fi
    
    # Vérifier hashing des mots de passe
    if [ -f "$BACKEND_DIR/routes/auth.js" ]; then
        if grep -q "argon2" "$BACKEND_DIR/routes/auth.js"; then
            log_ok "Hashing Argon2 utilisé (excellent)"
        elif grep -q "bcrypt" "$BACKEND_DIR/routes/auth.js"; then
            log_medium "Hashing bcrypt utilisé (acceptable)"
            echo "  → Recommandation: Migrer vers argon2 (plus sécurisé)"
            
            # Vérifier le cost factor de bcrypt
            if grep -q "bcrypt.hash.*10\|bcrypt.hash.*12" "$BACKEND_DIR/routes/auth.js"; then
                log_ok "bcrypt cost factor ≥ 10"
            elif grep -q "bcrypt.hash" "$BACKEND_DIR/routes/auth.js"; then
                log_medium "bcrypt cost factor non visible - vérifier manuellement"
            fi
        else
            log_critical "Algorithme de hashing non identifié"
            echo "  → Risque: Mots de passe possiblement en clair ou hashage faible"
        fi
    fi
    
    # Vérifier révocation de tokens
    if [ -f "$BACKEND_DIR/routes/auth.js" ]; then
        if grep -q "token_blacklist\|blacklist" "$BACKEND_DIR/routes/auth.js"; then
            log_ok "Système de révocation de tokens implémenté"
        else
            log_high "Tokens non révocables après logout"
            echo "  → Risque: Token valide même après déconnexion"
            echo "  → Solution: Implémenter blacklist JWT"
        fi
    fi
}

audit_input_validation() {
    log_header "3. AUDIT VALIDATION DES ENTRÉES"
    
    # Vérifier utilisation de Joi ou validator
    if grep -rq "joi\|validator\|express-validator" "$BACKEND_DIR/routes/" 2>/dev/null; then
        log_ok "Bibliothèque de validation détectée"
    else
        log_critical "Aucune bibliothèque de validation trouvée"
        echo "  → Risque: Injections SQL, XSS, command injection"
        echo "  → Solution: Utiliser Joi pour valider toutes les entrées"
    fi
    
    # Vérifier sanitization HTML
    if grep -rq "dompurify\|sanitize-html\|xss" "$BACKEND_DIR/" 2>/dev/null; then
        log_ok "Sanitization HTML détectée"
    else
        log_high "Pas de sanitization HTML détectée"
        echo "  → Risque: Attaques XSS possibles"
        echo "  → Solution: Utiliser DOMPurify"
    fi
    
    # Vérifier utilisation de prepared statements
    if grep -rq "\.prepare(" "$BACKEND_DIR/routes/" 2>/dev/null; then
        log_ok "Prepared statements utilisés (protection SQL injection)"
    else
        if grep -rq "\.exec(\|\.run(" "$BACKEND_DIR/routes/" 2>/dev/null; then
            log_high "Requêtes SQL potentiellement non préparées"
            echo "  → Risque: Injection SQL possible"
            echo "  → Solution: Utiliser db.prepare() partout"
        fi
    fi
    
    # Chercher des concaténations SQL dangereuses
    if grep -rq "SELECT.*+\|INSERT.*+\|UPDATE.*+\|DELETE.*+" "$BACKEND_DIR/routes/" 2>/dev/null; then
        log_critical "Concaténation SQL détectée - INJECTION SQL POSSIBLE"
        echo "  → Fichiers concernés:"
        grep -rn "SELECT.*+\|INSERT.*+\|UPDATE.*+\|DELETE.*+" "$BACKEND_DIR/routes/" 2>/dev/null | head -5
    fi
}

audit_csrf_protection() {
    log_header "4. AUDIT PROTECTION CSRF"
    
    if [ -f "$BACKEND_DIR/middleware/csrf.js" ]; then
        log_ok "Middleware CSRF trouvé"
    elif grep -rq "csrf\|csurf" "$BACKEND_DIR/" 2>/dev/null; then
        log_ok "Protection CSRF détectée"
    else
        log_critical "Protection CSRF non implémentée"
        echo "  → Risque: Attaques cross-site request forgery"
        echo "  → Solution: Implémenter tokens CSRF"
    fi
    
    # Vérifier dans le frontend
    if [ -f "$FRONTEND_DIR/auth-guard.js" ]; then
        if grep -q "csrf\|x-csrf-token" "$FRONTEND_DIR/auth-guard.js"; then
            log_ok "Frontend envoie tokens CSRF"
        else
            log_high "Frontend ne semble pas gérer les tokens CSRF"
        fi
    fi
}

audit_cors_configuration() {
    log_header "5. AUDIT CONFIGURATION CORS"
    
    if [ -f "$BACKEND_DIR/index.js" ]; then
        # Vérifier si CORS est trop permissif
        if grep -q "origin.*\*\|origin.*true" "$BACKEND_DIR/index.js"; then
            log_critical "CORS trop permissif (origin: '*' ou true)"
            echo "  → Risque: N'importe quel site peut appeler votre API"
            echo "  → Solution: Whitelist des domaines autorisés"
        elif grep -q "cors()" "$BACKEND_DIR/index.js"; then
            log_medium "CORS activé sans configuration visible"
            echo "  → Vérifier manuellement la configuration"
        else
            log_ok "CORS semble configuré de manière restrictive"
        fi
        
        # Vérifier credentials
        if grep -q "credentials.*true" "$BACKEND_DIR/index.js"; then
            log_ok "CORS credentials activés (cookies/auth)"
        fi
    fi
}

audit_security_headers() {
    log_header "6. AUDIT HEADERS DE SÉCURITÉ"
    
    if [ -f "$BACKEND_DIR/index.js" ]; then
        # Vérifier helmet.js
        if grep -q "helmet" "$BACKEND_DIR/index.js"; then
            log_ok "Helmet.js utilisé (headers de sécurité)"
        else
            log_high "Helmet.js non utilisé"
            echo "  → Risque: Headers de sécurité manquants (CSP, HSTS, etc.)"
            echo "  → Solution: npm install helmet"
        fi
        
        # Vérifier headers manuels
        if grep -q "X-Frame-Options\|X-Content-Type-Options\|Strict-Transport-Security" "$BACKEND_DIR/index.js"; then
            log_ok "Headers de sécurité configurés manuellement"
        fi
    fi
}

audit_database_security() {
    log_header "7. AUDIT SÉCURITÉ BASE DE DONNÉES"
    
    if [ -f "$DB_PATH" ]; then
        log_ok "Base de données trouvée: $DB_PATH"
        
        # Vérifier permissions
        DB_PERMS=$(stat -c "%a" "$DB_PATH" 2>/dev/null || stat -f "%Lp" "$DB_PATH" 2>/dev/null)
        if [ "$DB_PERMS" = "600" ] || [ "$DB_PERMS" = "640" ]; then
            log_ok "Permissions DB correctes ($DB_PERMS)"
        else
            log_medium "Permissions DB trop permissives ($DB_PERMS)"
            echo "  → Recommandation: chmod 600 $DB_PATH"
        fi
        
        # Vérifier si la DB est chiffrée
        if file "$DB_PATH" | grep -q "encrypted"; then
            log_ok "Base de données chiffrée"
        else
            log_high "Base de données non chiffrée"
            echo "  → Risque: Données lisibles si serveur compromis"
            echo "  → Recommandation: SQLCipher pour chiffrement"
        fi
        
        # Vérifier backups
        if ls "$PROJECT_DIR/data/"*.backup* 1> /dev/null 2>&1; then
            log_ok "Backups DB trouvés"
            
            # Vérifier si backups sont chiffrés
            BACKUP_FILE=$(ls -t "$PROJECT_DIR/data/"*.backup* | head -1)
            if file "$BACKUP_FILE" | grep -q "encrypted\|gpg\|aes"; then
                log_ok "Backups chiffrés"
            else
                log_medium "Backups non chiffrés"
                echo "  → Recommandation: Chiffrer backups avec gpg"
            fi
        else
            log_medium "Aucun backup DB trouvé"
        fi
    else
        log_critical "Base de données non trouvée: $DB_PATH"
    fi
}

audit_logging_monitoring() {
    log_header "8. AUDIT LOGGING & MONITORING"
    
    # Vérifier logs d'audit
    if [ -f "$BACKEND_DIR/routes/auth.js" ]; then
        if grep -q "audit.*log\|logger" "$BACKEND_DIR/routes/auth.js"; then
            log_ok "Logging détecté dans authentification"
        else
            log_medium "Pas de logging d'audit visible"
            echo "  → Risque: Impossible de tracer les intrusions"
            echo "  → Solution: Implémenter audit_logs table"
        fi
    fi
    
    # Vérifier winston ou bunyan
    if grep -rq "winston\|bunyan\|pino" "$BACKEND_DIR/" 2>/dev/null; then
        log_ok "Logger structuré utilisé"
    else
        log_low "Pas de logger structuré (winston/bunyan)"
    fi
    
    # Vérifier table audit_logs
    if [ -f "$DB_PATH" ]; then
        if sqlite3 "$DB_PATH" ".tables" | grep -q "audit_logs"; then
            log_ok "Table audit_logs existe"
            
            # Vérifier nombre d'entrées
            AUDIT_COUNT=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM audit_logs" 2>/dev/null || echo "0")
            if [ "$AUDIT_COUNT" -gt 0 ]; then
                log_ok "Audit logs actifs ($AUDIT_COUNT entrées)"
            else
                log_medium "Table audit_logs vide - pas encore utilisée"
            fi
        else
            log_high "Table audit_logs n'existe pas"
            echo "  → Recommandation: Créer table pour traçabilité"
        fi
    fi
}

audit_frontend_security() {
    log_header "9. AUDIT SÉCURITÉ FRONTEND"
    
    if [ -f "$FRONTEND_DIR/auth-guard.js" ]; then
        log_ok "AuthGuard trouvé"
        
        # Vérifier debug mode
        if grep -q "debugMode.*true" "$FRONTEND_DIR/auth-guard.js"; then
            log_medium "Debug mode activé en production"
            echo "  → Risque: Informations sensibles dans console"
            echo "  → Solution: debugMode: false en production"
        fi
        
        # Vérifier stockage token
        if grep -q "localStorage" "$FRONTEND_DIR/auth-guard.js"; then
            log_medium "Token stocké en localStorage (vulnérable XSS)"
            echo "  → Risque: Token volable via XSS"
            echo "  → Alternative: httpOnly cookies"
        fi
        
        # Vérifier validation expiration
        if grep -q "isTokenExpired\|tokenExpiry" "$FRONTEND_DIR/auth-guard.js"; then
            log_ok "Validation expiration token côté client"
        fi
    fi
    
    # Vérifier Content Security Policy
    if grep -rq "Content-Security-Policy" "$FRONTEND_DIR/" 2>/dev/null; then
        log_ok "Content Security Policy détecté"
    else
        log_high "Content Security Policy manquant"
        echo "  → Risque: Attaques XSS facilitées"
        echo "  → Solution: Ajouter CSP via Helmet"
    fi
}

audit_dependencies() {
    log_header "10. AUDIT DÉPENDANCES & PACKAGES"
    
    if [ -f "$BACKEND_DIR/package.json" ]; then
        log_ok "package.json trouvé"
        
        # Vérifier npm audit
        if command -v npm &> /dev/null; then
            cd "$BACKEND_DIR"
            NPM_AUDIT=$(npm audit --json 2>/dev/null || echo '{"metadata":{"vulnerabilities":{"total":0}}}')
            
            CRITICAL_VULN=$(echo "$NPM_AUDIT" | grep -o '"critical":[0-9]*' | cut -d: -f2 || echo "0")
            HIGH_VULN=$(echo "$NPM_AUDIT" | grep -o '"high":[0-9]*' | cut -d: -f2 || echo "0")
            MODERATE_VULN=$(echo "$NPM_AUDIT" | grep -o '"moderate":[0-9]*' | cut -d: -f2 || echo "0")
            
            if [ "$CRITICAL_VULN" -gt 0 ]; then
                log_critical "$CRITICAL_VULN vulnérabilités CRITIQUES dans les dépendances"
                echo "  → Solution: npm audit fix --force"
            elif [ "$HIGH_VULN" -gt 0 ]; then
                log_high "$HIGH_VULN vulnérabilités HAUTES dans les dépendances"
                echo "  → Solution: npm audit fix"
            elif [ "$MODERATE_VULN" -gt 0 ]; then
                log_medium "$MODERATE_VULN vulnérabilités MODÉRÉES dans les dépendances"
            else
                log_ok "Aucune vulnérabilité critique dans les dépendances"
            fi
        fi
    fi
}

audit_configuration_files() {
    log_header "11. AUDIT FICHIERS DE CONFIGURATION"
    
    # Vérifier .env non commité
    if [ -f "$PROJECT_DIR/.gitignore" ]; then
        if grep -q "\.env" "$PROJECT_DIR/.gitignore"; then
            log_ok ".env dans .gitignore"
        else
            log_critical ".env absent de .gitignore"
            echo "  → Risque: Secrets commitées dans git"
        fi
    fi
    
    # Vérifier si .env existe
    if [ -f "$BACKEND_DIR/.env" ]; then
        log_ok ".env existe"
        
        # Vérifier permissions
        ENV_PERMS=$(stat -c "%a" "$BACKEND_DIR/.env" 2>/dev/null || stat -f "%Lp" "$BACKEND_DIR/.env" 2>/dev/null)
        if [ "$ENV_PERMS" = "600" ]; then
            log_ok "Permissions .env correctes (600)"
        else
            log_medium "Permissions .env trop permissives ($ENV_PERMS)"
            echo "  → Solution: chmod 600 $BACKEND_DIR/.env"
        fi
    else
        log_high ".env non trouvé - secrets possiblement en dur"
    fi
    
    # Vérifier node_modules pas commité
    if [ -f "$PROJECT_DIR/.gitignore" ]; then
        if grep -q "node_modules" "$PROJECT_DIR/.gitignore"; then
            log_ok "node_modules dans .gitignore"
        else
            log_low "node_modules absent de .gitignore"
        fi
    fi
}

audit_ssl_https() {
    log_header "12. AUDIT SSL/HTTPS"
    
    # Vérifier configuration Nginx
    if [ -f "/etc/nginx/sites-available/devops.aenews.net" ] || [ -f "/etc/nginx/conf.d/devops.aenews.net.conf" ]; then
        log_ok "Configuration Nginx trouvée"
        
        NGINX_CONF=$(cat /etc/nginx/sites-available/devops.aenews.net 2>/dev/null || cat /etc/nginx/conf.d/devops.aenews.net.conf 2>/dev/null || echo "")
        
        if echo "$NGINX_CONF" | grep -q "ssl_certificate"; then
            log_ok "SSL activé"
            
            # Vérifier redirection HTTP -> HTTPS
            if echo "$NGINX_CONF" | grep -q "return 301 https"; then
                log_ok "Redirection HTTP -> HTTPS active"
            else
                log_medium "Redirection HTTP -> HTTPS manquante"
            fi
            
            # Vérifier TLS 1.2+
            if echo "$NGINX_CONF" | grep -q "TLSv1.2\|TLSv1.3"; then
                log_ok "TLS 1.2+ configuré"
            fi
            
            # Vérifier HSTS
            if echo "$NGINX_CONF" | grep -q "Strict-Transport-Security"; then
                log_ok "HSTS activé"
            else
                log_medium "HSTS non configuré"
                echo "  → Recommandation: add_header Strict-Transport-Security"
            fi
        fi
    else
        log_info "Configuration Nginx non trouvée (peut-être autre reverse proxy)"
    fi
}

################################################################################
# GÉNÉRATION DU RAPPORT
################################################################################

generate_report() {
    log_header "📊 GÉNÉRATION DU RAPPORT"
    
    {
        echo "═══════════════════════════════════════════════════════════════"
        echo "   🔍 RAPPORT D'AUDIT DE SÉCURITÉ - VPS DEVOPS AGENT"
        echo "═══════════════════════════════════════════════════════════════"
        echo ""
        echo "Date: $(date '+%Y-%m-%d %H:%M:%S')"
        echo "Projet: $PROJECT_DIR"
        echo ""
        echo "═══════════════════════════════════════════════════════════════"
        echo "   📊 RÉSUMÉ DES VULNÉRABILITÉS"
        echo "═══════════════════════════════════════════════════════════════"
        echo ""
        echo "🔴 Critiques:  $CRITICAL_ISSUES"
        echo "🟠 Hautes:     $HIGH_ISSUES"
        echo "🟡 Moyennes:   $MEDIUM_ISSUES"
        echo "🔵 Basses:     $LOW_ISSUES"
        echo "ℹ️  Info:       $INFO_ISSUES"
        echo ""
        
        # Calcul du score
        TOTAL_ISSUES=$((CRITICAL_ISSUES + HIGH_ISSUES + MEDIUM_ISSUES + LOW_ISSUES))
        SCORE=100
        SCORE=$((SCORE - CRITICAL_ISSUES * 20))
        SCORE=$((SCORE - HIGH_ISSUES * 10))
        SCORE=$((SCORE - MEDIUM_ISSUES * 5))
        SCORE=$((SCORE - LOW_ISSUES * 2))
        
        if [ $SCORE -lt 0 ]; then
            SCORE=0
        fi
        
        echo "═══════════════════════════════════════════════════════════════"
        echo "   🎯 SCORE DE SÉCURITÉ: $SCORE/100"
        echo "═══════════════════════════════════════════════════════════════"
        echo ""
        
        if [ $SCORE -ge 80 ]; then
            echo "✅ Niveau: EXCELLENT"
        elif [ $SCORE -ge 60 ]; then
            echo "🟡 Niveau: BON (améliorations recommandées)"
        elif [ $SCORE -ge 40 ]; then
            echo "🟠 Niveau: MOYEN (corrections nécessaires)"
        else
            echo "🔴 Niveau: FAIBLE (corrections URGENTES)"
        fi
        echo ""
        
        echo "═══════════════════════════════════════════════════════════════"
        echo "   🎯 ACTIONS PRIORITAIRES"
        echo "═══════════════════════════════════════════════════════════════"
        echo ""
        
        if [ $CRITICAL_ISSUES -gt 0 ]; then
            echo "🚨 URGENT: $CRITICAL_ISSUES vulnérabilités CRITIQUES à corriger immédiatement"
        fi
        
        if [ $HIGH_ISSUES -gt 0 ]; then
            echo "⚠️  IMPORTANT: $HIGH_ISSUES vulnérabilités HAUTES à corriger rapidement"
        fi
        
        if [ $MEDIUM_ISSUES -gt 0 ]; then
            echo "📋 À PLANIFIER: $MEDIUM_ISSUES vulnérabilités MOYENNES à corriger"
        fi
        
        echo ""
        echo "═══════════════════════════════════════════════════════════════"
        echo "   📚 RECOMMANDATIONS GÉNÉRALES"
        echo "═══════════════════════════════════════════════════════════════"
        echo ""
        echo "1. Implémenter rate limiting (express-rate-limit)"
        echo "2. Activer authentification 2FA (speakeasy)"
        echo "3. Ajouter protection CSRF"
        echo "4. Valider toutes les entrées (Joi)"
        echo "5. Utiliser Argon2 pour hashing"
        echo "6. Implémenter révocation de tokens"
        echo "7. Ajouter audit logging complet"
        echo "8. Configurer Helmet.js pour headers"
        echo "9. Activer détection d'intrusion"
        echo "10. Chiffrer backups DB"
        echo ""
        echo "═══════════════════════════════════════════════════════════════"
        echo "   📖 RESSOURCES"
        echo "═══════════════════════════════════════════════════════════════"
        echo ""
        echo "• OWASP Top 10: https://owasp.org/www-project-top-ten/"
        echo "• Node.js Security: https://nodejs.org/en/docs/guides/security/"
        echo "• JWT Best Practices: https://tools.ietf.org/html/rfc8725"
        echo ""
        echo "═══════════════════════════════════════════════════════════════"
        echo "Rapport généré le $(date '+%Y-%m-%d à %H:%M:%S')"
        echo "═══════════════════════════════════════════════════════════════"
    } > "$REPORT_FILE"
    
    echo -e "${GREEN}✅ Rapport sauvegardé: $REPORT_FILE${NC}"
}

################################################################################
# EXÉCUTION PRINCIPALE
################################################################################

main() {
    echo -e "${BLUE}"
    echo "═══════════════════════════════════════════════════════════════"
    echo "   🔍 AUDIT DE SÉCURITÉ - VPS DEVOPS AGENT"
    echo "   Version 1.0 - $(date '+%Y-%m-%d')"
    echo "═══════════════════════════════════════════════════════════════"
    echo -e "${NC}"
    
    # Vérifier que le projet existe
    if [ ! -d "$PROJECT_DIR" ]; then
        echo -e "${RED}❌ ERREUR: Projet non trouvé: $PROJECT_DIR${NC}"
        echo "Modifiez la variable PROJECT_DIR au début du script."
        exit 1
    fi
    
    # Exécuter tous les audits
    audit_jwt_configuration
    audit_authentication
    audit_input_validation
    audit_csrf_protection
    audit_cors_configuration
    audit_security_headers
    audit_database_security
    audit_logging_monitoring
    audit_frontend_security
    audit_dependencies
    audit_configuration_files
    audit_ssl_https
    
    # Générer le rapport
    generate_report
    
    # Résumé final
    echo ""
    log_header "✅ AUDIT TERMINÉ"
    echo ""
    echo "📊 Résumé:"
    echo "  🔴 Critiques:  $CRITICAL_ISSUES"
    echo "  🟠 Hautes:     $HIGH_ISSUES"
    echo "  🟡 Moyennes:   $MEDIUM_ISSUES"
    echo "  🔵 Basses:     $LOW_ISSUES"
    echo ""
    echo "📄 Rapport complet: $REPORT_FILE"
    echo ""
    
    # Code de sortie
    if [ $CRITICAL_ISSUES -gt 0 ]; then
        exit 2
    elif [ $HIGH_ISSUES -gt 0 ]; then
        exit 1
    else
        exit 0
    fi
}

# Lancer l'audit
main "$@"
