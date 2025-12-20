#!/bin/bash

# Script de test complet pour VPS DevOps Agent
# Usage: ./test-complet.sh

echo "╔════════════════════════════════════════════════════════════════╗"
echo "║        VPS DEVOPS AGENT - SUITE DE TESTS COMPLÈTE              ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""

# Couleurs
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Compteurs
TESTS_TOTAL=0
TESTS_SUCCESS=0
TESTS_FAILED=0

# Fonction de test
test_check() {
  TESTS_TOTAL=$((TESTS_TOTAL + 1))
  if [ $1 -eq 0 ]; then
    echo -e "${GREEN}✅ $2${NC}"
    TESTS_SUCCESS=$((TESTS_SUCCESS + 1))
    return 0
  else
    echo -e "${RED}❌ $2${NC}"
    TESTS_FAILED=$((TESTS_FAILED + 1))
    return 1
  fi
}

# 1. Test service PM2
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}1️⃣  TEST SERVICE PM2${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
pm2 list | grep -q "vps-devops-agent.*online"
test_check $? "Service PM2 vps-devops-agent en ligne"
echo ""

# 2. Test configuration
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}2️⃣  TEST CONFIGURATION${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
grep -q "OPENAI_TIMEOUT=60000" /opt/vps-devops-agent/backend/.env
test_check $? "Timeout configuré à 60s"
grep -q "OPENAI_MAX_TOKENS=150" /opt/vps-devops-agent/backend/.env
test_check $? "Max tokens configuré à 150"
grep -q "OPENAI_MODEL=phi3:mini" /opt/vps-devops-agent/backend/.env
test_check $? "Modèle phi3:mini configuré"
echo ""

# 3. Test API Health
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}3️⃣  TEST API HEALTH${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
HEALTH=$(curl -s http://localhost:3001/api/health)
echo "$HEALTH" | jq -e '.status == "ok"' > /dev/null 2>&1
test_check $? "API Health endpoint répond OK"
echo "$HEALTH" | jq -e '.features.aiAgent == true' > /dev/null 2>&1
test_check $? "Feature AI Agent activée"
echo ""

# 4. Test authentification
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}4️⃣  TEST AUTHENTIFICATION${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
AUTH_RESPONSE=$(curl -s -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin2025"}')
  
echo "$AUTH_RESPONSE" | jq -e '.success == true' > /dev/null 2>&1
test_check $? "Login admin/admin2025 réussi"

TOKEN=$(echo "$AUTH_RESPONSE" | jq -r '.token' 2>/dev/null)
[ ! -z "$TOKEN" ] && [ "$TOKEN" != "null" ]
test_check $? "Token JWT généré"
echo ""

# 5. Test Agent Autonome
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}5️⃣  TEST AGENT AUTONOME${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

if [ ! -z "$TOKEN" ] && [ "$TOKEN" != "null" ]; then
  echo -n "   Test commande: 'Liste les conteneurs Docker actifs' ... "
  START_TIME=$(date +%s)
  
  AGENT_RESPONSE=$(curl -s -X POST http://localhost:3001/api/autonomous/v2/chat \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $TOKEN" \
    -d '{"message":"Liste les conteneurs Docker actifs","serverId":1}')
  
  END_TIME=$(date +%s)
  DURATION=$((END_TIME - START_TIME))
  
  echo "$AGENT_RESPONSE" | jq -e '.success == true' > /dev/null 2>&1
  if [ $? -eq 0 ]; then
    COMMAND=$(echo "$AGENT_RESPONSE" | jq -r '.response.commands[0].command' 2>/dev/null)
    echo -e "${GREEN}✅ (${DURATION}s)${NC}"
    echo -e "   ${GREEN}Commande générée: $COMMAND${NC}"
    TESTS_SUCCESS=$((TESTS_SUCCESS + 1))
  else
    echo -e "${RED}❌ (${DURATION}s)${NC}"
    TESTS_FAILED=$((TESTS_FAILED + 1))
  fi
  TESTS_TOTAL=$((TESTS_TOTAL + 1))
else
  echo -e "${RED}❌ Impossible de tester - pas de token${NC}"
  TESTS_FAILED=$((TESTS_FAILED + 1))
  TESTS_TOTAL=$((TESTS_TOTAL + 1))
fi
echo ""

# 6. Test Base de données
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}6️⃣  TEST BASE DE DONNÉES${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
SERVER_COUNT=$(sqlite3 /opt/vps-devops-agent/data/devops-agent.db "SELECT COUNT(*) FROM servers" 2>/dev/null)
[ "$SERVER_COUNT" -ge 1 ]
test_check $? "Base de données accessible ($SERVER_COUNT serveurs)"
USER_COUNT=$(sqlite3 /opt/vps-devops-agent/data/devops-agent.db "SELECT COUNT(*) FROM users" 2>/dev/null)
[ "$USER_COUNT" -ge 1 ]
test_check $? "Utilisateurs configurés ($USER_COUNT users)"
echo ""

# 7. Analyse des erreurs
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}7️⃣  ANALYSE DES LOGS${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
ERROR_COUNT=$(pm2 logs vps-devops-agent --nostream --lines 100 | grep -icE "error|exception|failed" 2>/dev/null || echo "0")
echo -e "   Erreurs récentes dans logs: ${YELLOW}$ERROR_COUNT${NC}"
if [ "$ERROR_COUNT" -le 10 ]; then
  echo -e "   ${GREEN}✅ Niveau d'erreur acceptable${NC}"
else
  echo -e "   ${YELLOW}⚠️  Niveau d'erreur élevé${NC}"
fi
echo ""

# Résumé final
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}📊 RÉSUMÉ FINAL${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo -e "   Total tests:   ${TESTS_TOTAL}"
echo -e "   ${GREEN}✅ Réussis:     ${TESTS_SUCCESS}${NC}"
echo -e "   ${RED}❌ Échoués:     ${TESTS_FAILED}${NC}"
echo ""

# Calcul du score
if [ $TESTS_TOTAL -gt 0 ]; then
  SCORE=$((TESTS_SUCCESS * 100 / TESTS_TOTAL))
  
  if [ $SCORE -ge 90 ]; then
    echo -e "   ${GREEN}🎉 SCORE: ${SCORE}% - EXCELLENT${NC}"
    echo -e "   ${GREEN}✅ Plateforme production-ready${NC}"
  elif [ $SCORE -ge 70 ]; then
    echo -e "   ${YELLOW}⚠️  SCORE: ${SCORE}% - BON${NC}"
    echo -e "   ${YELLOW}⚠️  Quelques améliorations recommandées${NC}"
  else
    echo -e "   ${RED}❌ SCORE: ${SCORE}% - INSUFFISANT${NC}"
    echo -e "   ${RED}❌ Corrections nécessaires${NC}"
  fi
else
  echo -e "   ${RED}❌ Aucun test exécuté${NC}"
fi

echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# Code de sortie
if [ $TESTS_FAILED -eq 0 ]; then
  exit 0
else
  exit 1
fi
