# 🐳 AI Development Container Template
# 可複用模板 - 基於 microsoft/devcontainers/javascript-node:22
# 使用方式：複製到專案的 .devcontainer/ 目錄

# 基礎映像：Node.js 22 + Python 3.13（開發環境標準配備）
FROM mcr.microsoft.com/devcontainers/javascript-node:22

# 安裝 Python 3.13 和 pip
RUN apt-get update && apt-get install -y \
    python3.13 \
    python3.13-venv \
    python3-pip \
    curl \
    git \
    && rm -rf /var/lib/apt/lists/*

# 設定 Python 3.13 為預設版本
RUN ln -sf /usr/bin/python3.13 /usr/local/bin/python3
RUN ln -sf /usr/bin/python3.13 /usr/local/bin/python

# 🐱 安裝 Pi Coding Agent（讓容器內也能用聰明 Pi Agent）
# 使用 latest 確保最新版，--ignore-scripts 避免 native addon 編譯問題
RUN npm install -g --ignore-scripts @earendil-works/pi-coding-agent

# 設定工作目錄
WORKDIR /workspace

# 預設命令：保持容器運行
CMD ["sleep", "infinity"]
