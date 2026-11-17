#!/bin/zsh
# 雙擊：在這個終端機視窗開本地伺服器 → 用 VS Code 打開專案 → 開本地網站測試。
# 本地網站有開發者功能（齒輪調參、黑洞改官方刪除名單）；關掉這個終端機視窗＝伺服器停止。
cd "${0:A:h}" || exit 1
export PORT=4311   # 避開自動測試用的 4310
URL="http://127.0.0.1:$PORT"

open -a "Visual Studio Code" "${0:A:h}"   # VS Code 打開專案資料夾
printf %s "$URL" | pbcopy                  # 網址放進剪貼簿：VS Code 裡 ⌘⇧P →「Simple Browser: Show」→ 貼上，就能在 VS Code 裡看

if lsof -nP -iTCP:$PORT -sTCP:LISTEN >/dev/null 2>&1; then
  echo "伺服器已經在跑：$URL"
  open "$URL"
  exit 0
fi

echo "開本地伺服器：$URL（關掉這個視窗就停止）"
( for i in {1..60}; do curl -s -o /dev/null "$URL" && { open "$URL"; break; }; sleep 1; done ) &
exec node tests/serve.mjs
