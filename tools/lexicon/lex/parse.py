"""來源檔解析、格式規則 R0、讀音選擇。

R0 只管「格式」：非漢字、擴充區字元、長度、注音符號、音節數。
簡體字、罕用字、中國用語等「內容」規則是之後（06-05）才加的。
"""
import re
import unicodedata
from pathlib import Path

# 單字不在範圍內（網站只用 2 字以上的詞），只計數、不進刪除清單
SKIP_SINGLE = 'skip-single'

# R0 規則 id → 白話原因（寫進 removed.ndjson 與報告）
R0_REASONS = {
    'R0-nonbmp': '含擴充區字元（網頁算不出正確字數）',
    'R0-nonhan': '含非漢字字元',
    'R0-length': '詞長超過 11 字',
    'R0-bopomofo': '注音含非注音符號',
    'R0-syllables': '注音音節數與字數不符',
}

MAX_WORD_LEN = 11
_SYLLABLE = re.compile('^[ㄅ-ㄯ]+[ˊˇˋ˙]?$')
_TONES = 'ˊˇˋ˙'
# 漢字範圍（BMP 內）：擴充 A、基本區、相容漢字
_HAN_RANGES = ((0x3400, 0x4DBF), (0x4E00, 0x9FFF), (0xF900, 0xFAFF))


def is_han(ch):
    cp = ord(ch)
    return any(lo <= cp <= hi for lo, hi in _HAN_RANGES)


def _pick(src, suffix):
    """parser 的輸入可以是單一路徑，或 {來源路徑: 快取檔路徑} 的對照表。"""
    if isinstance(src, (str, Path)):
        return Path(src)
    hits = [p for key, p in src.items() if key.endswith(suffix)]
    if len(hits) != 1:
        raise ValueError('需要剛好一個 %s 檔，實際 %d 個' % (suffix, len(hits)))
    return Path(hits[0])


def parse_tsi(src):
    """tsi.csv（詞,頻率,注音）→ (表頭 dict, [(詞, 注音, 頻率), ...])。

    表頭是 `# dc:key,value,` 的行；其他 # 行、空行、欄位不足 3 的行直接略過。
    一個詞有多個讀音就是多行，這裡原樣回傳，合併由 collect() 做。
    """
    path = _pick(src, 'tsi.csv')
    header = {}
    rows = []
    with open(path, encoding='utf-8', newline='') as fh:
        for raw in fh:
            line = raw.rstrip('\r\n')
            if not line.strip():
                continue
            if line.startswith('#'):
                body = line[1:].strip()
                if body.startswith('dc:'):
                    parts = body.split(',')
                    header[parts[0]] = parts[1] if len(parts) > 1 else ''
                continue
            parts = line.split(',')
            if len(parts) < 3:
                continue
            try:
                freq = int(parts[1])
            except ValueError:
                freq = 0
            rows.append((parts[0], parts[2].strip(), max(freq, 0)))
    return header, rows


# 解析器登錄表：packs.json 的 parser 欄位對應到這裡（06-04 會加兩個，不必改 build.py）
PARSERS = {'tsi': parse_tsi}


def normalise(w, z):
    """NFC 正規化後套用 R0；回傳 (詞, 判定)。

    判定：None = 通過；SKIP_SINGLE = 單字（略過、只計數）；其他 = R0 規則 id。
    檢查順序固定，方便報告與測試。
    """
    w = unicodedata.normalize('NFC', w)
    if len(w) < 2:
        return w, SKIP_SINGLE
    if any(ord(c) > 0xFFFF for c in w):
        return w, 'R0-nonbmp'
    if not all(is_han(c) for c in w):
        return w, 'R0-nonhan'
    if len(w) > MAX_WORD_LEN:
        return w, 'R0-length'
    syllables = z.split(' ')
    if not all(_SYLLABLE.match(s) for s in syllables):
        return w, 'R0-bopomofo'
    if len(syllables) != len(w):
        return w, 'R0-syllables'
    return w, None


def _strip_tone(s):
    return ''.join(c for c in s if c not in _TONES)


def _rank(char, syllable, poly_order):
    """這個字的這個讀音在 Andy 的偏好順序裡排第幾；不在表裡的字不影響選擇。"""
    order = poly_order.get(char)
    if order is None:
        return 0
    if syllable in order:
        return order.index(syllable)
    bare = _strip_tone(syllable)
    for i, cand in enumerate(order):
        if _strip_tone(cand) == bare:
            return i
    return len(order)


def choose_reading(w, readings, poly_order, overrides):
    """一個詞有多個讀音時選一個（網站以詞為鍵，只存一個讀音）。

    順序：人工覆寫 > 各字在 polyphonic-order 的名次總和最小 > 輕聲少 > 字典序。
    不重新推導讀音（Pitfall 5）：只在來源已有的讀音裡選。
    """
    if w in overrides:
        return overrides[w]

    def key(z):
        syls = z.split(' ')
        score = sum(_rank(ch, syl, poly_order) for ch, syl in zip(w, syls))
        neutral = sum(1 for s in syls if s.endswith('˙'))
        return (score, neutral, z)

    return min(readings, key=key)


def collect(rows, poly_order, overrides, src_id):
    """把解析出的行變成詞庫條目。

    回傳 (entries, removed, stats)：
      entries = [{'w','z','p'}]（未排序，由 write_pack 排序）
      removed = [{'w','z','p','rule','reason','src','n'}]（R0 刪除的行，依詞排序）
      stats   = {'lines','skipped_single','merged_lines','removed','kept'}
    """
    words = {}   # w → {'readings': set, 'freq': int}
    bad = {}     # (w, z, rule) → freq
    skipped_single = 0
    merged = 0
    for w0, z, freq in rows:
        w, verdict = normalise(w0, z)
        if verdict == SKIP_SINGLE:
            skipped_single += 1
            continue
        if verdict is not None:
            k = (w, z, verdict)
            bad[k] = max(bad.get(k, 0), freq)
            continue
        ev = words.get(w)
        if ev is None:
            words[w] = {'readings': {z}, 'freq': freq}
        else:
            merged += 1
            ev['readings'].add(z)
            ev['freq'] = max(ev['freq'], freq)
    entries = []
    for w, ev in words.items():
        entries.append({'w': w, 'z': choose_reading(w, ev['readings'], poly_order, overrides),
                        'p': ev['freq']})
    removed = [{'w': w, 'z': z, 'p': p, 'rule': rule, 'reason': R0_REASONS[rule],
                'src': [src_id], 'n': 1}
               for (w, z, rule), p in bad.items()]
    removed.sort(key=lambda r: (r['w'], r['z'], r['rule']))
    stats = {'lines': len(rows), 'skipped_single': skipped_single, 'merged_lines': merged,
             'removed': len(removed), 'kept': len(entries)}
    return entries, removed, stats
