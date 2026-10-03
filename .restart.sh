#!/bin/bash
# 🔄 重啟開發容器
# 用法：./.restart.sh

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
STOP_SCRIPT="$SCRIPT_DIR/.stop.sh"
ENTER_SCRIPT="$SCRIPT_DIR/.enter.sh"

if ! docker info >/dev/null 2>&1; then
    echo -e "${RED}⚠️  Docker 未運行，請先開啟 Docker Desktop${NC}"
    exit 1
fi

if [ ! -f "$STOP_SCRIPT" ]; then
    echo -e "${RED}⚠️  .stop.sh 不存在${NC}"
    exit 1
fi

if [ ! -f "$ENTER_SCRIPT" ]; then
    echo -e "${RED}⚠️  .enter.sh 不存在${NC}"
    exit 1
fi

echo -e "${BLUE}🐳 重啟開發容器...${NC}"
bash "$STOP_SCRIPT"

echo -e "${YELLOW}⏳ 重新進入容器...${NC}"
bash "$ENTER_SCRIPT"
