#!/usr/bin/env python3
"""
🔐 Script de Correction Automatique - Protection Authentification
Ajoute le module AuthGuard à toutes les pages non protégées
"""

import os
import re
import shutil
from datetime import datetime

# Configuration
FRONTEND_DIR = "/opt/vps-devops-agent/frontend"
BACKUP_SUFFIX = datetime.now().strftime(".backup-%Y%m%d-%H%M%S")

# Pages à corriger avec leur type
PAGES_TO_FIX = {
    "index.html": "login",
    "monitoring.html": "standalone",
    "monitoring-advanced.html": "standalone",
    "code-analyzer.html": "standalone",
    "enhancements.html": "standalone",
    "sandbox-playground.html": "standalone",
    "cicd.html": "standalone"
}

# Templates d'injection
AUTH_GUARD_SCRIPT = '    <script src="/auth-guard.js"></script>\n'

LOGIN_PROTECTION = '''        // 🔐 Protection: Redirect if already authenticated
        AuthGuard.protectPage({ requireAuth: false, redirectIfAuth: true });
'''

STANDALONE_PROTECTION = '''        // 🔐 Protection: Require authentication
        AuthGuard.protectPage({
            requireAuth: true,
            onSuccess: () => console.log("✅ Page access granted"),
            onFail: () => console.log("⛔ Access denied - redirecting...")
        });
        
        // Create API interceptor
        const apiCall = AuthGuard.createApiInterceptor();
'''

def backup_file(filepath):
    """Créer un backup du fichier"""
    backup_path = filepath + BACKUP_SUFFIX
    shutil.copy2(filepath, backup_path)
    return backup_path

def inject_auth_script(content):
    """Injecter le script auth-guard.js dans le <head>"""
    # Chercher si le script est déjà présent
    if 'auth-guard.js' in content:
        return content, False
    
    # Injecter après <head>
    pattern = r'(<head[^>]*>)'
    replacement = r'\1\n' + AUTH_GUARD_SCRIPT
    new_content = re.sub(pattern, replacement, content, count=1)
    
    return new_content, True

def inject_auth_protection(content, page_type):
    """Injecter la protection d'authentification"""
    # Choisir le bon template
    protection = LOGIN_PROTECTION if page_type == "login" else STANDALONE_PROTECTION
    
    # Trouver le premier <script> après <body>
    # On cherche <script> qui n'est pas dans le <head>
    lines = content.split('\n')
    new_lines = []
    injected = False
    in_body = False
    
    for i, line in enumerate(lines):
        new_lines.append(line)
        
        # Détecter quand on entre dans <body>
        if '<body' in line.lower():
            in_body = True
        
        # Injecter après le premier <script> dans le body
        if in_body and not injected and '<script' in line.lower():
            # Ajouter la protection juste après l'ouverture du script
            new_lines.append(protection)
            injected = True
    
    return '\n'.join(new_lines), injected

def fix_page(filepath, page_type):
    """Corriger une page HTML"""
    print(f"\n📄 Processing: {os.path.basename(filepath)} (type: {page_type})")
    
    # Lire le contenu
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            content = f.read()
    except Exception as e:
        print(f"   ❌ Error reading file: {e}")
        return False
    
    # Backup
    try:
        backup_path = backup_file(filepath)
        print(f"   ✅ Backup created: {os.path.basename(backup_path)}")
    except Exception as e:
        print(f"   ⚠️  Warning: Couldn't create backup: {e}")
    
    # Injecter le script auth-guard.js
    content, script_injected = inject_auth_script(content)
    if script_injected:
        print("   ✅ auth-guard.js script added")
    else:
        print("   ℹ️  auth-guard.js already present")
    
    # Injecter la protection
    content, protection_injected = inject_auth_protection(content, page_type)
    if protection_injected:
        print("   ✅ Auth protection added")
    else:
        print("   ⚠️  Could not inject protection (manual fix may be needed)")
    
    # Écrire le fichier modifié
    try:
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(content)
        print("   ✅ File saved successfully")
        return True
    except Exception as e:
        print(f"   ❌ Error writing file: {e}")
        return False

def main():
    print("═" * 63)
    print("   🔐 CORRECTION AUTOMATIQUE - PROTECTION AUTHENTIFICATION")
    print("═" * 63)
    print()
    
    os.chdir(FRONTEND_DIR)
    
    success_count = 0
    fail_count = 0
    
    for filename, page_type in PAGES_TO_FIX.items():
        filepath = os.path.join(FRONTEND_DIR, filename)
        
        if not os.path.exists(filepath):
            print(f"\n⚠️  {filename} - FILE NOT FOUND")
            fail_count += 1
            continue
        
        if fix_page(filepath, page_type):
            success_count += 1
        else:
            fail_count += 1
    
    print()
    print("═" * 63)
    print("   ✅ CORRECTIONS TERMINÉES")
    print("═" * 63)
    print()
    print(f"✅ Succès: {success_count} pages")
    print(f"❌ Échec: {fail_count} pages")
    print()
    print("📁 Backups: *.backup-YYYYMMDD-HHMMSS")
    print()
    print("🔄 Pour restaurer un backup:")
    print("   mv filename.html.backup-YYYYMMDD-HHMMSS filename.html")
    print()

if __name__ == "__main__":
    main()
