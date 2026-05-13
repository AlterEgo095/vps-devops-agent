#!/bin/bash
# ============================================================
# Launch ChromaDB for RAG Knowledge Base
# ============================================================
# This script launches a ChromaDB instance using Docker for
# the VPS DevOps Agent RAG module.
#
# Prerequisites:
#   - Docker must be installed and running
#   - Port 8000 must be available
#
# Environment Variables:
#   CHROMADB_PORT    - Port to expose ChromaDB (default: 8000)
#   CHROMADB_DATA    - Docker volume name for persistence (default: chromadb-data)
#   CHROMADB_VERSION - ChromaDB image tag (default: latest)
# ============================================================

set -e

CHROMADB_PORT="${CHROMADB_PORT:-8000}"
CHROMADB_DATA="${CHROMADB_DATA:-chromadb-data}"
CHROMADB_VERSION="${CHROMADB_VERSION:-latest}"
CONTAINER_NAME="vps-agent-chromadb"

echo "🚀 Setting up ChromaDB for VPS DevOps Agent RAG Module"
echo "   Port:        ${CHROMADB_PORT}"
echo "   Data Volume: ${CHROMADB_DATA}"
echo "   Version:     ${CHROMADB_VERSION}"
echo ""

# Check if Docker is available
if ! command -v docker &> /dev/null; then
    echo "❌ Error: Docker is not installed or not in PATH"
    echo "   Please install Docker: https://docs.docker.com/get-docker/"
    exit 1
fi

# Check if Docker daemon is running
if ! docker info &> /dev/null; then
    echo "❌ Error: Docker daemon is not running"
    echo "   Please start Docker and try again"
    exit 1
fi

# Check if container already exists
if docker ps -a --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
    echo "⚠️  Container '${CONTAINER_NAME}' already exists"
    
    # Check if it's running
    if docker ps --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
        echo "✅ ChromaDB is already running on http://localhost:${CHROMADB_PORT}"
        exit 0
    else
        echo "   Starting existing container..."
        docker start "${CONTAINER_NAME}"
        echo "✅ ChromaDB started on http://localhost:${CHROMADB_PORT}"
        exit 0
    fi
fi

# Check if port is available
if lsof -i :${CHROMADB_PORT} &> /dev/null || ss -tlnp | grep -q ":${CHROMADB_PORT}"; then
    echo "⚠️  Warning: Port ${CHROMADB_PORT} is already in use"
    echo "   Trying to use it anyway..."
fi

# Launch ChromaDB
echo "📦 Pulling ChromaDB image (chromadb/chroma:${CHROMADB_VERSION})..."
docker pull chromadb/chroma:${CHROMADB_VERSION} 2>/dev/null || {
    echo "⚠️  Could not pull latest image, using local cache if available"
}

echo "🏃 Starting ChromaDB container..."
docker run -d \
    --name "${CONTAINER_NAME}" \
    -p ${CHROMADB_PORT}:8000 \
    -v ${CHROMADB_DATA}:/chroma/chroma \
    --restart unless-stopped \
    chromadb/chroma:${CHROMADB_VERSION}

# Wait for ChromaDB to be ready
echo "⏳ Waiting for ChromaDB to be ready..."
MAX_RETRIES=30
RETRY_COUNT=0

while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
    if curl -s "http://localhost:${CHROMADB_PORT}/api/v2/heartbeat" > /dev/null 2>&1; then
        echo ""
        echo "✅ ChromaDB is running on http://localhost:${CHROMADB_PORT}"
        echo ""
        echo "📋 Configuration:"
        echo "   URL:           http://localhost:${CHROMADB_PORT}"
        echo "   Container:     ${CONTAINER_NAME}"
        echo "   Data Volume:   ${CHROMADB_DATA}"
        echo ""
        echo "🔧 Add to your .env file:"
        echo "   CHROMADB_URL=http://localhost:${CHROMADB_PORT}"
        echo ""
        echo "🛠️  Management commands:"
        echo "   View logs:   docker logs ${CONTAINER_NAME} -f"
        echo "   Stop:        docker stop ${CONTAINER_NAME}"
        echo "   Restart:     docker restart ${CONTAINER_NAME}"
        echo "   Remove:      docker rm -f ${CONTAINER_NAME}"
        echo ""
        exit 0
    fi
    
    RETRY_COUNT=$((RETRY_COUNT + 1))
    echo -n "."
    sleep 1
done

echo ""
echo "⚠️  ChromaDB container started but not responding yet"
echo "   Check logs with: docker logs ${CONTAINER_NAME}"
echo "   The service may need more time to initialize"
exit 1
