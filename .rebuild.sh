#!/bin/bash
# 🔁 重建開發容器
# 用法：./.rebuild.sh

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

echo -e "${BLUE}🐳 重建開發容器...${NC}"
docker compose -f "$COMPOSE_FILE" down

echo -e "${YELLOW}⏳ 重新建置映像並啟動容器...${NC}"
docker compose -f "$COMPOSE_FILE" up -d --build

sleep 3

if ! docker compose -f "$COMPOSE_FILE" ps | grep -q "Up"; then
    echo -e "${RED}⚠️  容器未正常啟動${NC}"
    echo "docker compose -f \"$COMPOSE_FILE\" logs dev"
    exit 1
fi

echo ""
echo -e "${GREEN}✅ 容器已重建！${NC}"
echo ""
echo -e "📋 ${YELLOW}可用指令：${NC}"
echo ""
echo -e "  ${GREEN}進入容器：${NC}    ./.enter.sh"
echo -e "  ${GREEN}查看日誌：${NC}    ./.log.sh"
echo -e "  ${GREEN}說明：${NC}        ./.help.sh"
echo -e "  ${GREEN}停止容器：${NC}     ./.stop.sh"
echo ""
echo -e "${YELLOW}💡 Pi Agent 在容器內已設定好，預設連本地 ToshLLM${NC}"
