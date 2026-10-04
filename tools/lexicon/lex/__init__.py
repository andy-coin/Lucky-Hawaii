"""好韻器詞庫清洗工具（Phase 6）：只用 Python 標準函式庫，語法相容 3.9。

所有指令都要用 `python3 -B` 執行（這個分支沒有 .gitignore，不能讓 __pycache__ 寫進專案）。
"""
import os
from pathlib import Path

# 專案根目錄：lex/__init__.py → lex → lexicon → tools → 專案
REPO = Path(__file__).resolve().parents[3]

# 清洗規則版本：規則改了就加一，所有詞庫包的版本字串會跟著變
RULES_VERSION = '2'

# 每個分片檔的行數（最後一片可以比較短）
CHUNK_SIZE = 24000

# 允許進詞庫包的授權（SPDX 單項）。授權不在這裡面，工具直接拒絕（A1）
SPDX_ALLOW = {'LGPL-2.1-or-later', 'MIT', 'BSD-3-Clause', 'MulanPSL-2.0'}


# AI 判斷灰色詞的用量估算模型（RESEARCH）：每個詞約 7 個輸入 token、3 個輸出 token，
# 每次請求另有約 600 個固定的輸入 token（說明與範例）。報告（06-06）與 AI 判斷（06-07）共用。
PER_WORD_IN = 7
PER_WORD_OUT = 3
PER_REQUEST_IN = 600
DEFAULT_BATCH = 150


def estimate_tokens(n_words, batch_size=DEFAULT_BATCH):
    """估算判斷 n_words 個詞要幾次請求、多少 token：{requests, in_tokens, out_tokens}。"""
    if n_words <= 0:
        return {'requests': 0, 'in_tokens': 0, 'out_tokens': 0}
    requests = -(-n_words // batch_size)
    return {'requests': requests,
            'in_tokens': n_words * PER_WORD_IN + requests * PER_REQUEST_IN,
            'out_tokens': n_words * PER_WORD_OUT}


class LexError(Exception):
    """可預期的失敗（授權、雜湊、路徑）；build.py 印出訊息並以代碼 2 結束。"""


def cache_dir():
    """原始下載的快取位置：環境變數 LEX_CACHE_DIR，否則 ~/.cache/lucky-hawaii/lexicon。

    快取絕對不能放在專案裡面，否則原始檔會被誤 commit（A3、OD-4）。
    這裡只算路徑、不建資料夾，所以被拒絕時不會留下任何東西。
    """
    raw = os.environ.get('LEX_CACHE_DIR') or '~/.cache/lucky-hawaii/lexicon'
    path = Path(os.path.expanduser(raw)).resolve()
    repo = REPO.resolve()
    if path == repo or repo in path.parents:
        raise LexError('快取資料夾不可放在專案裡面（會被誤 commit）：' + str(path))
    return path
