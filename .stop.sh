#!/bin/bash
# 停止開發容器
# 用法：./.stop.sh

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
COMPOSE_FILE="$SCRIPT_DIR/.devcontainer/docker-compose.yml"

if ! docker info >/dev/null 2>&1; then
    echo -e "${RED}⚠️  Docker 未運行，請先開啟 Docker Desktop${NC}"
    exit 1
fi

if [ ! -f "$COMPOSE_FILE" ]; then
    echo -e "${RED}⚠️  .devcontainer/docker-compose.yml 不存在${NC}"
    exit 1
fi

echo -e "${YELLOW}⏸️  停止開發容器...${NC}"
docker compose -f "$COMPOSE_FILE" down

echo -e "${GREEN}✅ 容器已停止${NC}"
