#!/bin/zsh
# 雙擊開本機預覽並開瀏覽器；已經在跑就直接開頁面。關掉這個終端機視窗即停止。
cd "${0:A:h}" || exit 1
export PORT=4311   # 避開自動測試用的 4310
URL="http://127.0.0.1:$PORT"

if lsof -nP -iTCP:$PORT -sTCP:LISTEN >/dev/null 2>&1; then
  open "$URL"
  exit 0
fi

( for i in {1..60}; do curl -s -o /dev/null "$URL" && { open "$URL"; break; }; sleep 1; done ) &
exec node tests/serve.mjs
