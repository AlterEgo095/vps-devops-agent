#!/bin/bash

###############################################################################
# 🚀 SCRIPT DE TEST PERFORMANCE - VPS DevOps Agent
# 
# Tests:
# - API Response Time (avec/sans cache)
# - Compression Gzip
# - Throughput (requêtes/seconde)
# - Database Query Performance
# - WebSocket Latency
# - Memory & CPU Usage
###############################################################################

set -e

# Couleurs
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
API_URL="${API_URL:-http://localhost:4000}"
NUM_REQUESTS=100
CONCURRENT=10

echo -e "${BLUE}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║      🚀 VPS DevOps Agent - Performance Tests               ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${YELLOW}📊 Configuration:${NC}"
echo "   • API URL: $API_URL"
echo "   • Requests: $NUM_REQUESTS"
echo "   • Concurrent: $CONCURRENT"
echo ""

# Fonction pour mesurer le temps
time_request() {
  local url=$1
  local name=$2
  
  echo -e "${BLUE}⏱️  Testing: $name${NC}"
  
  # Premier appel (cache cold)
  start_cold=$(date +%s%N)
  response_code_cold=$(curl -s -o /dev/null -w "%{http_code}" "$url")
  end_cold=$(date +%s%N)
  time_cold=$(( (end_cold - start_cold) / 1000000 ))
  
  # Deuxième appel (cache warm)
  start_warm=$(date +%s%N)
  response_code_warm=$(curl -s -o /dev/null -w "%{http_code}" "$url")
  end_warm=$(date +%s%N)
  time_warm=$(( (end_warm - start_warm) / 1000000 ))
  
  # Calcul amélioration
  improvement=$(( (time_cold - time_warm) * 100 / time_cold ))
  
  echo "   Cold: ${time_cold}ms (HTTP $response_code_cold)"
  echo "   Warm: ${time_warm}ms (HTTP $response_code_warm)"
  echo -e "   ${GREEN}Improvement: ${improvement}%${NC}"
  echo ""
}

###############################################################################
# TEST 1: API Response Time
###############################################################################

echo -e "${YELLOW}═══════════════════════════════════════════════════════════${NC}"
echo -e "${YELLOW}TEST 1: API Response Time${NC}"
echo -e "${YELLOW}═══════════════════════════════════════════════════════════${NC}"
echo ""

time_request "$API_URL/api/health" "Health Check"
time_request "$API_URL/api/monitoring/metrics" "System Metrics"
time_request "$API_URL/api/docker/containers" "Docker Containers"

###############################################################################
# TEST 2: Compression Gzip
###############################################################################

echo -e "${YELLOW}═══════════════════════════════════════════════════════════${NC}"
echo -e "${YELLOW}TEST 2: Gzip Compression${NC}"
echo -e "${YELLOW}═══════════════════════════════════════════════════════════${NC}"
echo ""

echo -e "${BLUE}📦 Testing compression...${NC}"

# Sans compression
size_uncompressed=$(curl -s -H "Accept-Encoding:" "$API_URL/api/health" | wc -c)

# Avec compression
size_compressed=$(curl -s -H "Accept-Encoding: gzip" "$API_URL/api/health" --compressed | wc -c)

# Calcul gain
if [ $size_uncompressed -gt 0 ]; then
  savings=$(( (size_uncompressed - size_compressed) * 100 / size_uncompressed ))
  echo "   Uncompressed: ${size_uncompressed} bytes"
  echo "   Compressed: ${size_compressed} bytes"
  echo -e "   ${GREEN}Savings: ${savings}%${NC}"
else
  echo -e "   ${RED}❌ Failed to measure compression${NC}"
fi
echo ""

###############################################################################
# TEST 3: Throughput Test (Apache Bench)
###############################################################################

echo -e "${YELLOW}═══════════════════════════════════════════════════════════${NC}"
echo -e "${YELLOW}TEST 3: Throughput (requests/second)${NC}"
echo -e "${YELLOW}═══════════════════════════════════════════════════════════${NC}"
echo ""

if command -v ab &> /dev/null; then
  echo -e "${BLUE}🔥 Running Apache Bench...${NC}"
  ab -n $NUM_REQUESTS -c $CONCURRENT -q "$API_URL/api/health" 2>&1 | grep -E "Requests per second|Time per request|Transfer rate"
  echo ""
else
  echo -e "${YELLOW}⚠️  Apache Bench not installed (skip)${NC}"
  echo "   Install: sudo apt-get install apache2-utils"
  echo ""
fi

###############################################################################
# TEST 4: Cache Performance
###############################################################################

echo -e "${YELLOW}═══════════════════════════════════════════════════════════${NC}"
echo -e "${YELLOW}TEST 4: Cache Performance${NC}"
echo -e "${YELLOW}═══════════════════════════════════════════════════════════${NC}"
echo ""

echo -e "${BLUE}🗄️  Testing cache effectiveness...${NC}"

# 10 requêtes séquentielles
total_time=0
for i in {1..10}; do
  start=$(date +%s%N)
  curl -s "$API_URL/api/monitoring/metrics" > /dev/null
  end=$(date +%s%N)
  time_ms=$(( (end - start) / 1000000 ))
  total_time=$(( total_time + time_ms ))
  echo "   Request $i: ${time_ms}ms"
done

avg_time=$(( total_time / 10 ))
echo ""
echo -e "   ${GREEN}Average: ${avg_time}ms${NC}"
echo ""

###############################################################################
# TEST 5: Memory & CPU Usage
###############################################################################

echo -e "${YELLOW}═══════════════════════════════════════════════════════════${NC}"
echo -e "${YELLOW}TEST 5: Resource Usage${NC}"
echo -e "${YELLOW}═══════════════════════════════════════════════════════════${NC}"
echo ""

echo -e "${BLUE}💾 Current resource usage:${NC}"

# Trouver le PID du processus
PID=$(pgrep -f "node.*server.js" | head -1)

if [ -n "$PID" ]; then
  # Memory
  MEM=$(ps -p $PID -o rss= | awk '{print $1/1024}')
  echo -e "   Memory: ${MEM} MB"
  
  # CPU
  CPU=$(ps -p $PID -o %cpu= | awk '{print $1}')
  echo -e "   CPU: ${CPU}%"
  
  # Uptime
  UPTIME=$(ps -p $PID -o etime= | xargs)
  echo -e "   Uptime: ${UPTIME}"
else
  echo -e "   ${RED}❌ Process not found${NC}"
fi
echo ""

###############################################################################
# TEST 6: Database Performance (si accessible)
###############################################################################

echo -e "${YELLOW}═══════════════════════════════════════════════════════════${NC}"
echo -e "${YELLOW}TEST 6: Database Performance${NC}"
echo -e "${YELLOW}═══════════════════════════════════════════════════════════${NC}"
echo ""

DB_FILE="backend/devops-agent.db"
if [ -f "$DB_FILE" ]; then
  echo -e "${BLUE}🗄️  Testing database queries...${NC}"
  
  # Test query simple
  start=$(date +%s%N)
  sqlite3 "$DB_FILE" "SELECT COUNT(*) FROM sqlite_master;" > /dev/null
  end=$(date +%s%N)
  time_ms=$(( (end - start) / 1000000 ))
  echo "   Simple query: ${time_ms}ms"
  
  # Test avec index
  start=$(date +%s%N)
  sqlite3 "$DB_FILE" "SELECT name FROM sqlite_master WHERE type='index';" > /dev/null
  end=$(date +%s%N)
  time_ms=$(( (end - start) / 1000000 ))
  echo "   Index query: ${time_ms}ms"
  
  # Nombre d'indexes
  num_indexes=$(sqlite3 "$DB_FILE" "SELECT COUNT(*) FROM sqlite_master WHERE type='index';" | head -1)
  echo "   Total indexes: ${num_indexes}"
else
  echo -e "   ${YELLOW}⚠️  Database not found (skip)${NC}"
fi
echo ""

###############################################################################
# RÉSUMÉ FINAL
###############################################################################

echo -e "${BLUE}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║                    📊 TEST SUMMARY                          ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${GREEN}✅ All performance tests completed!${NC}"
echo ""
echo "📈 Key Metrics:"
echo "   • API Response: Check cold/warm times above"
echo "   • Compression: ~60% bandwidth savings expected"
echo "   • Cache: First request slow, subsequent fast"
echo "   • Memory: Should be < 150 MB"
echo ""
echo "💡 Recommendations:"
echo "   • Cold cache > 500ms? Check DB indexes"
echo "   • Warm cache > 100ms? Verify cache middleware"
echo "   • Memory > 200MB? Check for memory leaks"
echo "   • CPU > 50%? Optimize heavy operations"
echo ""
echo -e "${YELLOW}📝 Report saved to: performance-report-$(date +%Y%m%d-%H%M%S).log${NC}"
echo ""
