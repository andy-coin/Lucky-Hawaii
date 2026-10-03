#!/bin/bash
# 啟動開發容器（不重新 build）
# 用法：./.start.sh

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

if ! docker info >/dev/null 2>&1; then
    echo -e "${RED}⚠️  Docker 未運行，請先開啟 Docker Desktop${NC}"
    exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
COMPOSE_FILE="$SCRIPT_DIR/.devcontainer/docker-compose.yml"

if [ ! -f "$COMPOSE_FILE" ]; then
    echo -e "${RED}⚠️  .devcontainer/docker-compose.yml 不存在${NC}"
    exit 1
fi

echo -e "${BLUE}🐳 啟動開發容器...${NC}"
docker compose -f "$COMPOSE_FILE" up -d

sleep 3

if ! docker compose -f "$COMPOSE_FILE" ps | grep -q "Up"; then
    echo -e "${RED}⚠️  容器未正常啟動${NC}"
    echo "docker compose -f \"$COMPOSE_FILE\" logs dev"
    exit 1
fi

echo -e "${GREEN}✅ 容器已啟動！${NC}"
