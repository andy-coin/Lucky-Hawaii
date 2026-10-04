"""內容規則（R1 簡體、R2 罕用字、R3 中國用語、K0 保留清單、G 灰色）與規則輸入的載入。

規則順序固定（對應 C2）：
    K0 保留清單（格式合格才算）→ R0 格式 → R1 簡體字 → R2 罕用字 → R3 中國用語（r3-gray 清單內的改成灰色）
    → G 灰色 → K1 通過

鐵則：
- 只有「規則」能刪詞；只有一個來源收錄的詞最多變灰色（保留、待 AI 判斷），絕不因此被刪。
- 不確定時偏向保留或灰色，不要刪（Andy 的決定）。
"""
import json
import unicodedata
from pathlib import Path

from . import LexError
from .parse import R0_REASONS, SKIP_SINGLE, normalise

# 中國用語（R3）只在「本來源詞頻」低於這個值時才刪：
# OpenCC 的 TWPhrases 是「轉換表」不是「中國專用詞表」，支持、設備、用戶、文件這類
# 台灣天天在用的詞也在裡面（Pitfall 1），所以一定要有詞頻守門。
CHINA_FREQ_MIN = 100

# 預期的字數（來源被換掉或 Python 版本不同時要停下來，T-06-17）
BIG5_L1_COUNT = 5401
BIG5_L2_COUNT = 7650
MOE_COMMON_COUNT = 4808
MOE_SECONDARY_RANGE = (6300, 6400)

# 規則 id → 繁體中文原因（R0 的在 parse.R0_REASONS）；{c} = 字、{tw} = 台灣說法
RULE_REASONS = {
    'R1-simplified': '含簡體字「{c}」',
    'R2-rare-char': '含罕用字「{c}」（不在教育部常用／次常用字與 Big5 內）',
    'R3-china-term': '中國用語（台灣多作「{tw}」）',
    'R5-ai-incomprehensible': 'AI 判斷：一般讀者難以理解（{m}）',
}

# 漢字範圍：擴充 A、基本區（BMP）；教育部字表另含相容區與擴充 B 以後（只用來收集）
_CJK_UNIFIED = ((0x3400, 0x4DBF), (0x4E00, 0x9FFF))
_CJK_ALL = _CJK_UNIFIED + ((0xF900, 0xFAFF), (0x20000, 0x2FA1F), (0x30000, 0x3134F))
_BIG5_L1 = (0xA440, 0xC67E)
_BIG5_L2 = (0xC940, 0xF9D5)

GRAY_POLICIES = ('p1', 'p2')


def _is_cjk(ch, ranges=_CJK_ALL):
    cp = ord(ch)
    return any(lo <= cp <= hi for lo, hi in ranges)


def big5_levels():
    """用 Python 內建的 Big5 編碼，算出第一級與第二級的漢字集合（只看擴充 A、基本區的統一漢字）。

    不含相容區（U+F900–FAFF）：Python 把 Big5 的 0xC94A（兀）、0xDDFC（嗀）對到相容字
    U+FA0C、U+FA0D，算進去第二級會是 7,652；這兩個相容字經 NFC 正規化後就變回一般字，
    詞裡不會出現，而 嗀 本來就在教育部次常用字表裡，所以不影響結果。
    """
    l1, l2 = set(), set()
    for lo, hi in _CJK_UNIFIED:
        for cp in range(lo, hi + 1):
            ch = chr(cp)
            try:
                b = ch.encode('big5')
            except UnicodeEncodeError:
                continue
            if len(b) != 2:
                continue
            code = (b[0] << 8) | b[1]
            if _BIG5_L1[0] <= code <= _BIG5_L1[1]:
                l1.add(ch)
            elif _BIG5_L2[0] <= code <= _BIG5_L2[1]:
                l2.add(ch)
    return l1, l2


def check_big5(l1, l2):
    """Big5 字表自我檢查：第一級 5,401、第二級 7,650；不符就停下來（編碼表不同會誤刪詞）。"""
    if len(l1) != BIG5_L1_COUNT or len(l2) != BIG5_L2_COUNT:
        raise LexError('Python 的 Big5 字表與預期不同（第一級 %d、第二級 %d）' % (len(l1), len(l2)))


def load_char_list(path):
    """教育部字表：略過 # 開頭的行，其餘每個漢字都收（※ 等標記不是漢字，自然略過）。"""
    chars = set()
    with open(path, encoding='utf-8') as fh:
        for raw in fh:
            line = raw.rstrip('\r\n')
            if line.startswith('#'):
                continue
            for ch in unicodedata.normalize('NFC', line):
                if _is_cjk(ch):
                    chars.add(ch)
    return chars


def load_opencc_keys(path):
    """OpenCC 單字轉換表（STCharacters／TSCharacters）的「鍵」：只收單一漢字的鍵。"""
    keys = set()
    with open(path, encoding='utf-8') as fh:
        for raw in fh:
            line = raw.rstrip('\r\n')
            if not line or line.startswith('#'):
                continue
            key = line.split('\t', 1)[0]
            if len(key) == 1 and _is_cjk(key):
                keys.add(key)
    return keys


def _read_pairs(path):
    """讀「大陸詞<TAB>台灣詞…」格式（多個台灣詞以空格分開，取第一個）。"""
    out = {}
    with open(path, encoding='utf-8') as fh:
        for raw in fh:
            line = raw.rstrip('\r\n')
            if not line.strip() or line.startswith('#'):
                continue
            parts = line.split('\t')
            if len(parts) < 2:
                continue
            key = parts[0].strip()
            value = parts[1].strip().split(' ')[0] if parts[1].strip() else ''
            if len(key) >= 2 and value and key != value:
                out.setdefault(key, value)
    return out


def load_twphrases(path):
    """TWPhrases：{大陸詞: 台灣詞}，只收長度 ≥ 2 且兩邊不同的鍵（只做完全吻合，不用包含比對）。"""
    return _read_pairs(path)


def load_china_extra(path):
    """tools/lexicon/rules/china-terms-extra.txt：Andy 手動補的「大陸詞<TAB>台灣詞」。"""
    return _read_pairs(path)


def load_char_allow(path):
    """char-allow.txt：每行「字<TAB>原因」，# 開頭是註解；回傳 {字: 原因}。"""
    out = {}
    with open(path, encoding='utf-8') as fh:
        for raw in fh:
            line = raw.rstrip('\r\n')
            if not line.strip() or line.startswith('#'):
                continue
            parts = line.split('\t', 1)
            ch = unicodedata.normalize('NFC', parts[0].strip())
            if len(ch) != 1:
                raise LexError('char-allow.txt 每行必須是「一個字、TAB、原因」：%r' % line)
            out[ch] = parts[1].strip() if len(parts) > 1 else ''
    return out


def load_r3_gray(path):
    """r3-gray.json：R3 命中時「不刪、改標灰色（待 AI 判斷）」的詞清單。

    這些是「可能是中國用語，但我們拿不準」的電腦／技術詞（創建、兼容、運行…）。
    C2/C3：拿不準就灰色，之後交給 AI 判斷；放進 keep.json 等於永久保留、AI 不會再看它，
    所以只有「明確是台灣日常用語」的詞才放 keep.json。
    """
    with open(path, encoding='utf-8') as fh:
        data = json.load(fh)
    if not isinstance(data, list):
        raise LexError('r3-gray.json 必須是詞的清單')
    return {unicodedata.normalize('NFC', w) for w in data if isinstance(w, str) and w}


def load_keep_allow(keep_path=None, overrides_path=None):
    """救回清單：keep.json（字串清單）∪ data/wordlist-overrides.json 的 added[].w。"""
    words = set()
    if keep_path is not None:
        with open(keep_path, encoding='utf-8') as fh:
            data = json.load(fh)
        if not isinstance(data, list):
            raise LexError('keep.json 必須是詞的清單')
        for item in data:
            w = item.get('w') if isinstance(item, dict) else item
            if isinstance(w, str) and w:
                words.add(unicodedata.normalize('NFC', w))
    if overrides_path is not None:
        with open(overrides_path, encoding='utf-8') as fh:
            data = json.load(fh)
        for item in data.get('added', []) or []:
            w = item.get('w') if isinstance(item, dict) else None
            if isinstance(w, str) and w:
                words.add(unicodedata.normalize('NFC', w))
    return words


class RuleContext:
    """規則需要的所有資料；classify 只讀它。"""

    def __init__(self, taiwan_chars, simp_only, char_allow, china_terms=None, keep_allow=None,
                 china_freq_min=CHINA_FREQ_MIN, gray_policy='p1', r3_gray=None):
        if gray_policy not in GRAY_POLICIES:
            raise LexError('--gray-policy 只能是 %s' % ' 或 '.join(GRAY_POLICIES))
        self.taiwan_chars = taiwan_chars
        self.simp_only = simp_only
        self.char_allow = char_allow
        self.china_terms = china_terms or {}
        self.keep_allow = keep_allow or set()
        self.r3_gray = r3_gray or set()
        self.china_freq_min = china_freq_min
        self.gray_policy = gray_policy


def load_rule_context(paths, check_counts=True, gray_policy='p1'):
    """從明確的檔案路徑建 RuleContext（測試傳小型範本，build.py 傳快取裡的鎖定檔）。

    paths 的鍵：st、ts、twphrases、moe_common、moe_secondary、char_allow（必要）；
    china_extra、keep、r3_gray、overrides（選用）。
    check_counts=True 時做自我檢查：教育部常用字 4,808、次常用字 6,300–6,400；
    Big5 第一、二級字數永遠檢查（那是 Python 編碼表，與範本無關）。
    """
    l1, l2 = big5_levels()
    check_big5(l1, l2)
    big5 = l1 | l2
    common = load_char_list(paths['moe_common'])
    secondary = load_char_list(paths['moe_secondary'])
    if check_counts:
        if len(common) != MOE_COMMON_COUNT:
            raise LexError('教育部常用國字表應有 %d 個字，實際 %d 個（來源可能被換掉）'
                           % (MOE_COMMON_COUNT, len(common)))
        lo, hi = MOE_SECONDARY_RANGE
        if not lo <= len(secondary) <= hi:
            raise LexError('教育部次常用國字表字數 %d 不在 %d–%d 之間（來源可能被換掉）'
                           % (len(secondary), lo, hi))
    moe = common | secondary
    st = load_opencc_keys(paths['st'])
    ts = load_opencc_keys(paths['ts'])
    char_allow = load_char_allow(paths['char_allow'])
    taiwan = moe | big5 | set(char_allow)
    simp_only = (st - moe - ts - big5) - set(char_allow)
    china = dict(load_twphrases(paths['twphrases']))
    if paths.get('china_extra'):
        china.update(load_china_extra(paths['china_extra']))
    keep = load_keep_allow(paths.get('keep'), paths.get('overrides'))
    r3_gray = load_r3_gray(paths['r3_gray']) if paths.get('r3_gray') else set()
    return RuleContext(taiwan, simp_only, char_allow, china, keep, CHINA_FREQ_MIN, gray_policy, r3_gray)


def reason_for(rule, detail=None):
    """規則 id 與細節 → 繁體中文原因。"""
    if rule in R0_REASONS:
        return R0_REASONS[rule]
    tpl = RULE_REASONS[rule]
    if rule == 'R3-china-term':
        return tpl.format(tw=detail)
    if rule == 'R5-ai-incomprehensible':
        return tpl.format(m=detail)
    return tpl.format(c=detail)


def simplified_chars_in(text, ctx):
    """文字裡所有「只有簡體才有」的字（依出現順序、不重複），用來檢查隨詞庫包散布的文字。"""
    seen = []
    for ch in text:
        if ch in ctx.simp_only and ch not in seen:
            seen.append(ch)
    return seen


def char_problem(w, ctx):
    """詞裡第一個不合規則的字：回傳 (規則, 字) 或 None。R1 先於 R2；char-allow 的字略過。"""
    for c in w:
        if c in ctx.char_allow:
            continue
        if c in ctx.simp_only:
            return 'R1-simplified', c
        if c not in ctx.taiwan_chars:
            return 'R2-rare-char', c
    return None


def classify(w, z, ev, ctx):
    """回傳 (decision, rule, detail)；decision ∈ keep | delete | gray（單字另回 skip）。

    ev = {'n': 收錄這個詞的來源數, 'freq': 本來源詞頻, 'freqs': [所有來源的詞頻]}。
    detail：R1/R2 是那個字、R3 與 G-china-term 是台灣說法，其餘 None。
    """
    w, verdict = normalise(w, z)
    if verdict == SKIP_SINGLE:
        return 'skip', SKIP_SINGLE, None  # 單字不在範圍內（collect 已經略過，這裡只是防呆）
    if verdict is None and w in ctx.keep_allow:
        # 救回清單：格式合格就一定留（格式不合的詞連網站都吃不下，仍然刪）
        return 'keep', 'K0-allowlist', None
    if verdict is not None:
        return 'delete', verdict, None
    hit = char_problem(w, ctx)
    if hit:
        return 'delete', hit[0], hit[1]
    tw = ctx.china_terms.get(w)
    # 完全吻合才算（不用包含比對：…循環、…方程式 之類幾乎都是誤判）
    if tw is not None and ev.get('freq', 0) < ctx.china_freq_min:
        if w in ctx.r3_gray:
            # 拿不準的中國用語：先保留並標灰色，之後交給 AI 判斷（C2/C3），不是直接刪
            return 'gray', 'G-china-term', tw
        return 'delete', 'R3-china-term', tw
    n = ev.get('n', 1)
    if n == 1:
        return 'gray', 'G-single-source', None
    if ctx.gray_policy == 'p2' and all(f == 0 for f in ev.get('freqs') or [ev.get('freq', 0)]):
        return 'gray', 'G-zero-freq', None
    return 'keep', 'K1-pass', None


def resolve(w, decision, rule, judgments, keep_allow):
    """灰色詞遇到 AI 判斷（C3、D2）。回傳 (decision, rule, 待判斷嗎, 判斷的模型)。

    只有 gray 會動：keep_allow 的詞一律保留（K0，優先於 D）；判斷 D → 刪除（R5）；判斷 K → 保留；
    沒有判斷 → 保留並算「待 AI 判斷」。其他決定（keep／delete）原封不動。
    judgments = {詞: (K|D, 模型, 提示版本)}。
    """
    if decision != 'gray':
        return decision, rule, False, None
    if w in keep_allow:
        return 'keep', 'K0-allowlist', False, None
    j = (judgments or {}).get(w)
    if j is None:
        return 'keep', rule, True, None
    if j[0] == 'D':
        return 'delete', 'R5-ai-incomprehensible', False, j[1]
    return 'keep', rule, False, j[1]


def apply_rules(parsed, ctx, judgments=None):
    """對所有詞庫包套用規則。

    parsed = {pack id: (entries, r0_removed, stats)}（parse.collect 的結果，依 pack id 順序）。
    回傳 {pack id: {'entries', 'removed', 'gray', 'stats'}}：
      entries = 留下的條目（含灰色），removed = 全部刪除列（R0 + R1/R2/R3，依詞排序）；
      gray_rows = 灰色詞列 {w,z,p,rule}、china_kept_rows = 中國用語吻合但詞頻夠高而保留的列 {w,z,p,tw}（報告用）。
    judgments（06-07）：灰色詞的 AI 判斷 {詞: (K|D, 模型, 提示版本)}；D 的詞改為刪除（R5），其餘保留。
    gray 一律是「分到灰色的詞數」，不因判斷而變；gray_pending 是還沒判斷的，gray_keep／gray_deleted 是判斷的結果。
    一個詞「被收錄」的定義：通過 R0 格式檢查、出現在該來源。n = 收錄它的來源數。
    每個詞庫包都檢查：留下 + 刪除 == 範圍內的詞（D1、T-06-15）。
    """
    index = {}  # 詞 → {pack id: 詞頻}
    for pid, (entries, _removed, _stats) in parsed.items():
        for e in entries:
            index.setdefault(e['w'], {})[pid] = e['p']
    out = {}
    for pid, (entries, r0_removed, stats) in parsed.items():
        kept = []
        removed = []
        counts = {}
        gray = 0
        gray_pending = 0
        gray_keep = 0
        gray_deleted = 0
        judged_with = set()
        gray_rows = []
        china_kept_rows = []
        china_gray = 0
        china_kept = 0
        keep_allow_n = 0
        for r in r0_removed:
            holders = sorted(set(index.get(r['w'], {})) | {pid})
            removed.append(dict(r, src=holders, n=len(holders)))
            counts[r['rule']] = counts.get(r['rule'], 0) + 1
        for e in entries:
            holders = index[e['w']]
            ev = {'n': len(holders), 'freq': e['p'], 'freqs': [holders[k] for k in sorted(holders)]}
            decision, rule, detail = classify(e['w'], e['z'], ev, ctx)
            if decision == 'gray':
                gray += 1
                row = {'w': e['w'], 'z': e['z'], 'p': e['p'], 'rule': rule}
                decision, rule, pending, model = resolve(e['w'], decision, rule, judgments, ctx.keep_allow)
                if pending:
                    gray_pending += 1
                elif model is not None:
                    judged_with.add(model)
                    row['verdict'] = 'D' if decision == 'delete' else 'K'
                    if decision == 'delete':
                        gray_deleted += 1
                        detail = model
                    else:
                        gray_keep += 1
                gray_rows.append(row)
                if row['rule'] == 'G-china-term':
                    china_gray += 1
            if decision == 'delete':
                srcs = sorted(holders)
                removed.append({'w': e['w'], 'z': e['z'], 'p': e['p'], 'rule': rule,
                                'reason': reason_for(rule, detail), 'src': srcs, 'n': len(srcs)})
                counts[rule] = counts.get(rule, 0) + 1
                continue
            kept.append(e)
            if rule == 'K0-allowlist':
                keep_allow_n += 1
            if e['w'] in ctx.china_terms and e['p'] >= ctx.china_freq_min:
                china_kept += 1
                china_kept_rows.append({'w': e['w'], 'z': e['z'], 'p': e['p'], 'tw': ctx.china_terms[e['w']]})
        removed.sort(key=lambda r: (r['w'], r['z'], r['rule']))
        if len(kept) + len(removed) != stats['in_scope']:
            raise LexError('%s：留下 %d + 刪除 %d 不等於範圍內的詞 %d（規則實作有誤）'
                           % (pid, len(kept), len(removed), stats['in_scope']))
        out[pid] = {'entries': kept, 'removed': removed, 'gray': gray, 'gray_pending': gray_pending,
                    'judged_with': sorted(judged_with),
                    'gray_rows': gray_rows, 'china_kept_rows': china_kept_rows,
                    'stats': dict(stats, kept=len(kept), removed=len(removed), rules=dict(sorted(counts.items())),
                                  gray=gray, gray_keep=gray_keep, gray_deleted=gray_deleted,
                                  china_gray=china_gray, china_kept=china_kept, keep_allow=keep_allow_n)}
    return out


def shipped_text_problems(texts, ctx):
    """隨詞庫包散布的文字（NOTICE／LICENSE）不可含簡體字（Pitfall 15）；texts = {名稱: 內容}。"""
    problems = []
    for name, text in texts.items():
        bad = simplified_chars_in(text, ctx)
        if bad:
            problems.append('%s：含簡體字「%s」' % (name, '、'.join(bad[:10])))
    return problems


def china_term_problem(w, p, ctx):
    """嚴格驗證用：詞庫裡殘留「完全吻合的中國用語且詞頻低、又不在救回清單」就回傳說明。"""
    tw = ctx.china_terms.get(w)
    if tw is not None and p < ctx.china_freq_min and w not in ctx.keep_allow and w not in ctx.r3_gray:
        return '「%s」是中國用語（台灣多作「%s」）且詞頻 %d 低於 %d' % (w, tw, p, ctx.china_freq_min)
    return None

