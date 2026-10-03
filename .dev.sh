#!/bin/bash
# 開發容器管理工具
# 用法：
#   .dev.sh logs     - 查看容器日誌（follow 模式）
#   .dev.sh help     - 顯示說明
#
# 其他指令請直接用獨立腳本：
#   .rebuild.sh  - 重建容器
#   .enter.sh    - 進入容器
#   .stop.sh     - 停止容器
#   .start.sh    - 啟動容器

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

# 取得 script 所在目錄的絕對路徑
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
COMPOSE_FILE="$SCRIPT_DIR/.devcontainer/docker-compose.yml"

show_help() {
    echo -e "${BLUE}🐳 開發容器管理工具${NC}"
    echo ""
    echo -e "  ${GREEN}.dev.sh logs${NC}      查看容器日誌（follow）"
    echo -e "  ${GREEN}.dev.sh help${NC}      顯示說明"
    echo ""
    echo -e "  ${YELLOW}獨立腳本：${NC}"
    echo -e "  .rebuild.sh  重建容器"
    echo -e "  .enter.sh    進入容器"
    echo -e "  .stop.sh     停止容器"
    echo -e "  .start.sh    啟動容器"
    echo ""
}

if [ ! -f "$COMPOSE_FILE" ]; then
    echo -e "${RED}⚠️  .devcontainer/docker-compose.yml 不存在${NC}"
    exit 1
fi

case "${1:-help}" in
    logs)
        docker compose -f "$COMPOSE_FILE" logs -f dev
        ;;
    help|*)
        show_help
        ;;
esac
