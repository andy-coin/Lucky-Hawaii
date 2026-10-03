#!/bin/bash
# 進入開發容器
# 用法：./.enter.sh

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
COMPOSE_FILE="$SCRIPT_DIR/.devcontainer/docker-compose.yml"
START_SCRIPT="$SCRIPT_DIR/.start.sh"

if ! docker info >/dev/null 2>&1; then
    echo -e "${RED}⚠️  Docker 未運行，請先開啟 Docker Desktop${NC}"
    exit 1
fi

if [ ! -f "$COMPOSE_FILE" ]; then
    echo -e "${RED}⚠️  .devcontainer/docker-compose.yml 不存在${NC}"
    exit 1
fi

if ! docker compose -f "$COMPOSE_FILE" ps | grep -q "Up"; then
    echo -e "${YELLOW}⚠️  容器尚未啟動，先自動執行 .start.sh${NC}"
    if [ -x "$START_SCRIPT" ]; then
        bash "$START_SCRIPT"
    else
        bash "$START_SCRIPT"
    fi
fi

if ! docker compose -f "$COMPOSE_FILE" ps | grep -q "Up"; then
    echo -e "${RED}⚠️  容器未正常啟動${NC}"
    echo "docker compose -f \"$COMPOSE_FILE\" logs dev"
    exit 1
fi

echo -e "${BLUE}🐳 進入開發容器...${NC}"
docker compose -f "$COMPOSE_FILE" exec -it dev bash
