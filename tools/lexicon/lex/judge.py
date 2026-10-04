"""灰色詞 AI 判斷（LEX-04）：判斷快取、用量估算與上限、分批判斷、可中斷續跑。

灰色詞 = 只有一個詞庫包收錄、或拿不準是不是中國用語的詞。判斷前一律保留在詞庫包裡（C4）；
有了判斷才會動它：D → 刪除（規則 R5），K → 保留。判斷結果存在 tools/lexicon/judgments/judgments.tsv，
每判完一批就存一次，所以隨時可以中斷、之後接著跑。

真正連 AI 的部分（Gemini、Worker）在本檔後半；測試一律用 RecordedProvider 或本機假伺服器，不連真的 AI。
"""
import os
from pathlib import Path

from . import DEFAULT_BATCH, LexError, estimate_tokens
from .parse import MAX_WORD_LEN, is_han

# 提示詞版本：提示詞改了要換版本號；已存的判斷不會因此自動重判，要加 --rejudge 才重問
PROMPT_VERSION = 'lex03-v1'

# 預設模型：Worker 清單裡的第一個（worker/src/models.js）
DEFAULT_MODEL = 'gemini-3.5-flash-lite'

JUDGMENTS_HEADER = '# 好韻器灰色詞 AI 判斷快取：詞<TAB>K|D<TAB>模型<TAB>提示版本；自動產生，可手改 K/D'

# 沒有設定任何 AI 時的說明（結束代碼 2）
NO_PROVIDER_MESSAGE = ('沒有設定 AI：請設定 GEMINI_API_KEY（建議）或 LEX_AI_URL（走 Worker），'
                       '說明見 tools/lexicon/README.md')


class ProviderError(Exception):
    """AI 端的錯誤（訊息要看得懂、而且絕不含金鑰）。"""


class ProviderBusy(ProviderError):
    """AI 一直回 429（太忙或額度用完）。"""


class ProviderAuthError(ProviderError):
    """金鑰無效或模型不可用（HTTP 400／401／403／404）。"""


class RequestCapReached(ProviderError):
    """本次執行的請求數已達 --max-requests，不能再送。"""


def _valid_word(w):
    """判斷快取裡的詞要和詞庫包一樣：2～11 個 BMP 漢字。"""
    return 2 <= len(w) <= MAX_WORD_LEN and all(is_han(c) and ord(c) <= 0xFFFF for c in w)


def load_judgments(path):
    """讀判斷快取：回傳 ({詞: (判斷, 模型, 提示版本)}, 壞行數)。

    # 開頭與空行略過；欄位數不對、判斷不是 K／D、詞不是 2～11 個漢字的行不收，只計數。
    檔案不存在就當空的。同一個詞出現多次，以最後一次為準。
    """
    table = {}
    malformed = 0
    try:
        fh = open(path, encoding='utf-8')
    except OSError:
        return table, 0
    with fh:
        for raw in fh:
            line = raw.rstrip('\r\n')
            if not line.strip() or line.startswith('#'):
                continue
            parts = line.split('\t')
            if len(parts) != 4:
                malformed += 1
                continue
            w, verdict, model, pver = (p.strip() for p in parts)
            if verdict not in ('K', 'D') or not model or not pver or not _valid_word(w):
                malformed += 1
                continue
            table[w] = (verdict, model, pver)
    return table, malformed


def save_judgments(path, table):
    """寫判斷快取：標頭 + 依詞（字碼）排序的行；先寫暫存檔再 os.replace，中途被打斷也不會留下半個檔案。"""
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    lines = [JUDGMENTS_HEADER]
    for w in sorted(table):
        verdict, model, pver = table[w]
        lines.append('%s\t%s\t%s\t%s' % (w, verdict, model, pver))
    data = ('\n'.join(lines) + '\n').encode('utf-8')
    try:
        if path.read_bytes() == data:
            return
    except OSError:
        pass
    tmp = path.with_name(path.name + '.tmp%d' % os.getpid())
    try:
        tmp.write_bytes(data)
        os.replace(tmp, path)
    finally:
        if tmp.exists():
            tmp.unlink()


class RecordedProvider:
    """測試用：只讀事先錄好的判斷表，不連網；表裡沒有的詞回 None（當作沒判斷）。"""
    model = 'recorded'

    def __init__(self, table):
        self.table = {w: (v[0] if isinstance(v, tuple) else v) for w, v in table.items()}
        self.requests = 0
        self.request_cap = None

    @classmethod
    def from_file(cls, path):
        """讀和判斷快取同格式的檔案（詞、K|D、模型、提示版本）。"""
        table, bad = load_judgments(path)
        if not table and bad:
            raise LexError('錄好的判斷檔格式不對：%s' % path)
        return cls(table)

    def judge(self, words):
        self.requests += 1
        return {w: self.table.get(w) for w in words}


def _redact(provider, text):
    fn = getattr(provider, 'redact', None)
    return fn(str(text)) if fn else str(text)


def run_judge(pending, judgments_path, provider, batch_size=DEFAULT_BATCH, max_requests=400,
              max_tokens=1_000_000, force=False, dry_run=False, rejudge=False, out=print, gray_total=None):
    """判斷灰色詞，回傳結束代碼：0 完成（含到達上限而乾淨停止）、2 沒有 AI、3 估算超過 token 上限、4 AI 中斷。

    pending：要判斷的詞（灰色詞，已排除一定保留的詞）；沒加 rejudge 時，快取裡已有判斷的詞不再問（續跑）。
    gray_total：灰色詞總數（只用在印出的那一行，省略就用 len(pending)）。
    每判完一批就把結果併進快取並存檔；請求數到上限、AI 出錯都會停下來，已判斷的不會丟。
    """
    table, _bad = load_judgments(judgments_path)
    words = sorted(set(pending))
    todo = words if rejudge else [w for w in words if w not in table]
    est = estimate_tokens(len(todo), batch_size)
    out('灰色 %d 筆、待判 %d 筆、批次 %d、估計輸入 %d token、輸出 %d token' % (
        len(words) if gray_total is None else gray_total, len(todo), est['requests'],
        est['in_tokens'], est['out_tokens']))
    if est['in_tokens'] + est['out_tokens'] > max_tokens and not force:
        out('估計用量超過 --max-tokens（%d），先不執行；確定要跑請加 --force，或用 --max-tokens 調高上限' % max_tokens)
        return 3
    if dry_run:
        out('只估算，沒有呼叫任何 AI（--dry-run）')
        return 0
    if provider is None:
        out(NO_PROVIDER_MESSAGE)
        return 2
    if not todo:
        out('沒有待判斷的灰色詞')
        return 0
    if hasattr(provider, 'request_cap'):
        provider.request_cap = max_requests
    kept = deleted = 0
    for start in range(0, len(todo), batch_size):
        if provider.requests >= max_requests:
            out('已達本次上限（%d 次請求），已判斷的已存檔，下次執行會接續' % max_requests)
            break
        batch = todo[start:start + batch_size]
        try:
            verdicts = provider.judge(batch)
        except Exception as exc:  # 任何 AI 端的錯誤都停下來，不丟掉已存的判斷
            if isinstance(exc, RequestCapReached):
                out('已達本次上限（%d 次請求），已判斷的已存檔，下次執行會接續' % max_requests)
                break
            out('AI 服務中斷：%s；已判斷的部分已存檔，再跑一次會接續' % _redact(provider, exc))
            return 4
        for w in batch:
            v = verdicts.get(w)
            if v in ('K', 'D'):
                table[w] = (v, provider.model, PROMPT_VERSION)
                if v == 'K':
                    kept += 1
                else:
                    deleted += 1
        save_judgments(judgments_path, table)
    out('本次判斷 %d 筆（保留 %d、刪除 %d）、仍待判 %d 筆' % (kept + deleted, kept, deleted, len(todo) - kept - deleted))
    return 0


def select_provider(name, model, env, recorded=None):
    """依 --provider 與環境變數挑 AI；沒有可用的就回 None（呼叫端停止並說明怎麼設定）。"""
    if name == 'recorded':
        if not recorded:
            raise LexError('--provider recorded 需要用 --recorded 指定判斷檔')
        return RecordedProvider.from_file(recorded)
    if env.get('GEMINI_API_KEY') or env.get('LEX_AI_URL'):
        raise LexError('直接連 Gemini 與 Worker 的功能還沒接上')  # 06-07 任務 2 補上
    return None
