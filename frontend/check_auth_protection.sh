#!/bin/bash

echo "═══════════════════════════════════════════════════════════════"
echo "   ANALYSE PROTECTION AUTHENTIFICATION - FRONTEND"
echo "═══════════════════════════════════════════════════════════════"
echo

pages=(
    "index.html:Login:NO_AUTH"
    "dashboard.html:Dashboard:PROTECTED"
    "admin-panel.html:Admin Panel:PROTECTED"
    "autonomous-agent.html:Autonomous Agent:PROTECTED"
    "projects-manager.html:Projects Manager:PROTECTED"
    "subscription-manager.html:Subscription Manager:PROTECTED"
    "ai-agent-chat.html:AI Chat:PROTECTED"
    "docker-manager.html:Docker Manager:PROTECTED"
    "monitoring.html:Monitoring:PROTECTED"
    "monitoring-advanced.html:Monitoring Advanced:PROTECTED"
    "terminal-ssh.html:Terminal SSH:PROTECTED"
    "agent-devops.html:Agent DevOps:PROTECTED"
    "code-analyzer.html:Code Analyzer:PROTECTED"
    "enhancements.html:Enhancements:PROTECTED"
    "sandbox-playground.html:Sandbox:PROTECTED"
    "cicd.html:CI/CD:PROTECTED"
)

for page_info in "${pages[@]}"; do
    IFS=':' read -r file name expected <<< "$page_info"
    
    if [ ! -f "$file" ]; then
        echo "⚠️  $name ($file) - FILE NOT FOUND"
        continue
    fi
    
    echo "───────────────────────────────────────────────────────────────"
    echo "📄 $name ($file)"
    echo "───────────────────────────────────────────────────────────────"
    
    # Vérifier si c'est la page de login
    if [ "$expected" = "NO_AUTH" ]; then
        # Login page should redirect if already authenticated
        has_redirect=$(grep -c "if.*token.*window.location" "$file" || echo 0)
        if [ $has_redirect -gt 0 ]; then
            echo "✅ CORRECT: Redirects to dashboard if already logged in"
        else
            echo "⚠️  WARNING: No redirect if already authenticated"
        fi
    else
        # Protected pages should check authentication
        
        # Check 1: Does it check for token?
        has_token_check=$(grep -c "localStorage.getItem.*authToken" "$file" || echo 0)
        
        # Check 2: Does it redirect if no token?
        has_redirect=$(grep -c "window.location.*=.*['/']" "$file" || echo 0)
        
        # Check 3: Does it use postMessage for token?
        has_postmessage=$(grep -c "postMessage.*AUTH_TOKEN" "$file" || echo 0)
        
        # Check 4: Does it listen for token from parent?
        has_listener=$(grep -c "addEventListener.*message" "$file" || echo 0)
        
        echo "Token Check:        [$has_token_check occurrences]"
        echo "Redirect if no auth: [$has_redirect occurrences]"
        echo "PostMessage usage:   [$has_postmessage occurrences]"
        echo "Message listener:    [$has_listener occurrences]"
        
        # Determine protection status
        if [ $has_token_check -gt 0 ] && [ $has_listener -gt 0 ]; then
            echo "🔒 STATUS: PROTECTED (iframe child page)"
        elif [ $has_token_check -gt 0 ] && [ $has_redirect -gt 0 ]; then
            echo "🔒 STATUS: PROTECTED (standalone with redirect)"
        elif [ $has_token_check -gt 0 ]; then
            echo "⚠️  STATUS: PARTIAL (checks token but no redirect)"
        else
            echo "❌ STATUS: NOT PROTECTED"
        fi
    fi
    echo
done

echo "═══════════════════════════════════════════════════════════════"
echo "   RECOMMANDATIONS"
echo "═══════════════════════════════════════════════════════════════"
echo
echo "✅ Pages iframe (chargées dans dashboard):"
echo "   - Doivent écouter postMessage pour recevoir le token"
echo "   - Doivent stocker le token dans localStorage"
echo "   - N'ont PAS besoin de redirect (dashboard le fait)"
echo
echo "✅ Pages standalone (dashboard):"
echo "   - Doivent vérifier le token au chargement"
echo "   - Doivent rediriger vers / si pas de token"
echo
echo "✅ Page login (index.html):"
echo "   - Doit rediriger vers dashboard si token existe"
echo
