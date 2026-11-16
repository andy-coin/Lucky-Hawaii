# 🏝️ Lucky Hawaii Dev Container 設定檔

## 好韻器 - 中文歌詞押韻工具

**開發環境容器** - 包含 Python 3.13 + Node.js 22 + Claude Code

## 快速開始

### 1. 用 VS Code 開啟

```
在 VS Code 中打開 Lucky Hawaii 資料夾
按 Cmd+Shift+P → "Dev Containers: Reopen in Container"
```

### 2. 首次啟動（約 1-2 分鐘）

容器會自動：
- ✅ 安裝 Python 3.13 + Node.js 22
- ✅ 安裝 Claude Code
- ✅ 安裝 VS Code 擴充套件

### 3. 本地預覽

```bash
# 啟動本地 HTTP server（PWA 需要 HTTP context）
python3 -m http.server 8080

# 然後瀏覽器開啟 http://localhost:8080
```

### 4. 使用 Claude Code 開發

```bash
# 在容器終端執行
claude
```

## 開發功能

### 更新詞庫
```bash
# 重新下載並合併詞庫
cd scripts
python3 build_wordlist.py
```

### 本地測試
```bash
# PWA 需要 HTTP context（不能直接用 file:// 開啟）
python3 -m http.server 8080
# 開啟 http://localhost:8080
```

## 環境資訊

| 項目 | 版本 |
|------|------|
| Python | 3.13 |
| Node.js | 22.x |
| Claude Code | 最新版 |

## 環境變數

建立 `.env` 在專案根目錄：

```bash
GEMINI_API_KEY=your-gemini-key-here
```

## 部署

```bash
# 直接推送到 GitHub Pages
# （設定見 .github/workflows/ 如果有的話）
```

## macOS Volume Mount 效能提示

- 使用 `consistency=cached` 優化 macOS 檔案同步
- 避免在容器內編輯過大檔案

## 進入容器終端

```
Cmd+Shift+P → "Dev Containers: Open Running Container"
```

或直接使用 VS Code 內建終端（已自動進入容器）。
