#!/bin/bash

echo "═══════════════════════════════════════════════════════════════"
echo "   🔐 CORRECTION AUTOMATIQUE - PROTECTION AUTHENTIFICATION"
echo "═══════════════════════════════════════════════════════════════"
echo

# Créer le répertoire de backup
BACKUP_DIR="/opt/vps-devops-agent/frontend/.backups-auth-fix-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$BACKUP_DIR"
echo "📦 Backup directory: $BACKUP_DIR"
echo

# Liste des pages à corriger avec leur type
declare -A pages
pages["index.html"]="login"
pages["monitoring.html"]="standalone"
pages["monitoring-advanced.html"]="standalone"
pages["code-analyzer.html"]="standalone"
pages["enhancements.html"]="standalone"
pages["sandbox-playground.html"]="standalone"
pages["cicd.html"]="standalone"

cd /opt/vps-devops-agent/frontend

for file in "${!pages[@]}"; do
    type="${pages[$file]}"
    
    if [ ! -f "$file" ]; then
        echo "⚠️  $file - FILE NOT FOUND"
        continue
    fi
    
    echo "───────────────────────────────────────────────────────────────"
    echo "📄 Processing: $file (type: $type)"
    
    # Backup original
    cp "$file" "$BACKUP_DIR/$file"
    echo "   ✅ Backup created"
    
    # Créer le fichier temporaire
    TEMP_FILE="${file}.tmp"
    
    if [ "$type" = "login" ]; then
        # Pour index.html (page login)
        awk '
        /<head>/ { print; print "    <script src=\"/auth-guard.js\"></script>"; next }
        /<script>/ && !done { 
            print
            print "        // 🔐 Protection: Redirect if already authenticated"
            print "        AuthGuard.protectPage({ requireAuth: false, redirectIfAuth: true });"
            print ""
            done=1
            next
        }
        { print }
        ' "$file" > "$TEMP_FILE"
        
    else
        # Pour pages standalone
        awk '
        /<head>/ { print; print "    <script src=\"/auth-guard.js\"></script>"; next }
        /<script>/ && !done { 
            print
            print "        // 🔐 Protection: Require authentication"
            print "        AuthGuard.protectPage({"
            print "            requireAuth: true,"
            print "            onSuccess: () => console.log(\"✅ Page access granted\"),"
            print "            onFail: () => console.log(\"⛔ Access denied - redirecting...\")"
            print "        });"
            print ""
            print "        // Create API interceptor"
            print "        const apiCall = AuthGuard.createApiInterceptor();"
            print ""
            done=1
            next
        }
        { print }
        ' "$file" > "$TEMP_FILE"
    fi
    
    # Remplacer l'original
    mv "$TEMP_FILE" "$file"
    echo "   ✅ Auth protection added"
    
done

echo
echo "═══════════════════════════════════════════════════════════════"
echo "   ✅ CORRECTIONS APPLIQUÉES"
echo "═══════════════════════════════════════════════════════════════"
echo
echo "📁 Backups sauvegardés dans: $BACKUP_DIR"
echo
echo "Pages corrigées:"
for file in "${!pages[@]}"; do
    echo "  ✓ $file"
done
echo
echo "🔄 Pour restaurer les backups si besoin:"
echo "   cp $BACKUP_DIR/*.html /opt/vps-devops-agent/frontend/"
echo

