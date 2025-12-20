#!/bin/bash
echo "╔════════════════════════════════════════════════════════════════╗"
echo "║         🧪 TEST AUTOMATIQUE - AGENT AUTONOME                  ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""

# Authentification
echo "🔐 Authentification..."
TOKEN=$(curl -s -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin2025"}' | jq -r '.token')

if [ -z "$TOKEN" ] || [ "$TOKEN" == "null" ]; then
  echo "❌ Échec de l'authentification"
  exit 1
fi

echo "✅ Token obtenu: ${TOKEN:0:20}..."

# Test de l'agent
echo ""
echo "🤖 Test de l'agent: 'Liste les conteneurs Docker actifs'"
echo ""

START_TIME=$(date +%s)

RESPONSE=$(curl -s -X POST http://localhost:3001/api/autonomous/v2/chat \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"message":"Liste les conteneurs Docker actifs","serverId":1}')

END_TIME=$(date +%s)
DURATION=$((END_TIME - START_TIME))

echo "⏱️  Durée: ${DURATION}s"
echo ""
echo "📨 Réponse complète:"
echo "$RESPONSE" | jq '.'

# Vérification du succès
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📊 RÉSULTAT DU TEST"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

COMMAND_GENERATED=$(echo "$RESPONSE" | jq -r '.response.commands[0].command')
SUCCESS=$(echo "$RESPONSE" | jq -r '.response.results[0].success')

echo "📦 Commande générée: $COMMAND_GENERATED"
echo "✓ Succès d'exécution: $SUCCESS"

if echo "$COMMAND_GENERATED" | grep -q "docker"; then
  echo ""
  echo "✅✅✅ TEST RÉUSSI - Commande shell valide générée"
  
  if [ "$SUCCESS" == "true" ]; then
    echo "✅✅✅ TEST RÉUSSI - Commande exécutée avec succès"
    exit 0
  else
    echo "⚠️  Commande générée mais échec d'exécution"
    exit 1
  fi
else
  echo ""
  echo "❌ TEST ÉCHOUÉ - Commande invalide"
  exit 1
fi
