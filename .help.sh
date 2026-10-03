#!/bin/bash
# 顯示開發容器管理說明
# 用法：./.help.sh

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}🐳 Misc 開發容器管理工具${NC}"
echo ""
echo -e "  ${GREEN}./.start.sh${NC}     啟動開發容器（不重新 build）"
echo -e "  ${GREEN}./.enter.sh${NC}     進入容器 bash"
echo -e "  ${GREEN}./.stop.sh${NC}      停止容器"
echo -e "  ${GREEN}./.rebuild.sh${NC}   重新建置並啟動容器"
echo -e "  ${GREEN}./.log.sh${NC}       查看容器日誌"
echo -e "  ${GREEN}./.help.sh${NC}      顯示此說明"
echo ""
echo -e "${YELLOW}Compose 位置：${NC}.devcontainer/docker-compose.yml"
echo -e "${YELLOW}容器內工作目錄：${NC}/workspace"
echo ""
echo -e "${YELLOW}Pi Agent 設定：${NC}會掛載 ~/.pi 與 ~/.config/mcp"
