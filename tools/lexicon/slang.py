#!/usr/bin/env python3
"""好韻器自建潮流詞庫：tools/lexicon/slang/*.tsv → data/slang/words.json（網站疊加在每個詞庫包上）。

用法（一律加 -B）：
    python3 -B tools/lexicon/slang.py            # 補注音（寫回 TSV）＋產生 data/slang/words.json
    python3 -B tools/lexicon/slang.py --check    # 只檢查：TSV 與網站檔一致、格式正確（不寫任何檔案）
結束代碼：0 成功、1 有問題（逐行列出）。

TSV 每行：詞<TAB>注音<TAB>源<TAB>備註；# 開頭是註解；檔名（不含 .tsv）就是分類。
- 注音空白：自動產生（先查詞庫包裡的詞，再把詞切成詞庫包裡有的小詞，最後才逐字查字典），
  算出來的注音會寫回 TSV，之後就固定不變。
- 切不開、又碰到破音字（例如「暈」有 ㄩㄣ／ㄩㄣˋ）時不會亂猜：停下來列出建議，請手動填注音。
- 源：台（台灣）、中（中國傳入、台灣也常見）、日、韓、港、外（其他外來）。
"""
import argparse
import glob
import hashlib
import json
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[1]
SLANG_DIR = HERE / 'slang'
OUT_DIR = REPO / 'data' / 'slang'
OUT_PATH = OUT_DIR / 'words.json'

# 候選排序用的「次數」：落在各詞庫包中位數之上、前 10% 之下（v0.96 中位數 4、前 10% 2051；
# 新酷音 11／283；小麥 3／61；唯音 14／1563），AI 排序失敗改依常用度補滿時不會被埋沒也不會壓過常用詞。
P_DEFAULT = 100

ORIGINS = {'台', '中', '日', '韓', '港', '外'}
_TONE = {'1': '', '2': 'ˊ', '3': 'ˇ', '4': 'ˋ', '5': '˙'}
_SYL = re.compile('^[ㄅ-ㄩ]+[ˊˇˋ˙]?$')
_HAN = re.compile('^[㐀-䶿一-鿿]{2,11}$')
# 讀音參考的詞庫包順序：輸入法詞庫的讀音最可靠，v0.96 最後
PACK_GLOBS = ['data/packs/chewing/c*.json', 'data/packs/mcbopomofo/c*.json',
              'data/packs/vanguard-tw/c*.json', 'data/wordlist-c*.json']


# 一個字的第二常見讀音，在詞庫包的詞裡佔到這個比例以上，就算破音字、要人工確認
DOUBT_SHARE = 0.1


def load_char_readings(lex, repo=REPO):
    """字 → 讀音清單（最常見的在前）與要人工確認的字。

    「常見」= 這個讀音在詞庫包所有詞裡出現幾次（例：有 幾乎都讀 ㄧㄡˇ、長 ㄔㄤˊ／ㄓㄤˇ 都很多）；
    詞庫包裡沒出現過的字才看字典（data/rhyme-dict.json），字典有兩個以上讀音就要人工確認。"""
    d = json.loads((repo / 'data' / 'rhyme-dict.json').read_text(encoding='utf-8'))
    dict_r = {}
    for key, val in d.items():
        r = key[:-1] + _TONE[key[-1]]
        for ch in val.replace('｜', '').replace('-', ''):
            dict_r.setdefault(ch, [])
            if r not in dict_r[ch]:
                dict_r[ch].append(r)
    seen = {}
    for w, z in lex.items():
        syl = z.split(' ')
        if len(syl) == len(w):
            for ch, s in zip(w, syl):
                m = seen.setdefault(ch, {})
                m[s] = m.get(s, 0) + 1
    out, doubt = {}, set()
    for ch in set(dict_r) | set(seen):
        m = seen.get(ch, {})
        rs = sorted(m, key=lambda r: -m[r]) + [r for r in dict_r.get(ch, []) if r not in m]
        out[ch] = rs
        if m:
            counts = sorted(m.values(), reverse=True)
            if len(counts) > 1 and counts[1] >= DOUBT_SHARE * sum(counts):
                doubt.add(ch)
        elif len(rs) > 1:
            doubt.add(ch)
    return out, doubt


def load_pack_words(repo=REPO):
    lex = {}
    for pat in PACK_GLOBS:
        for f in sorted(glob.glob(str(repo / pat))):
            with open(f, encoding='utf-8') as fh:
                for line in fh:
                    if line.strip():
                        e = json.loads(line)
                        lex.setdefault(e['w'], e['z'])
    return lex


def auto_reading(w, lex, chars, doubt_chars):
    """回傳 (注音或 None, 有疑慮的字)。詞庫包整詞 > 切成詞庫包小詞（疑慮字最少、段數最少）> 逐字。"""
    if w in lex and len(lex[w].split(' ')) == len(w):
        return lex[w], []
    n = len(w)
    INF = (10**9, 10**9)
    best = [INF] * (n + 1)   # (疑慮字數, 段數)
    back = [None] * (n + 1)
    best[0] = (0, 0)
    for i in range(1, n + 1):
        for j in range(i):
            if best[j] == INF:
                continue
            seg = w[j:i]
            if len(seg) >= 2:
                z = lex.get(seg)
                if not z or len(z.split(' ')) != len(seg):
                    continue
                cost, item = (0, 1), (z, [])
            else:
                rs = chars.get(seg)
                if not rs:
                    continue
                doubt = len(rs) > 1 and seg in doubt_chars
                cost, item = (1 if doubt else 0, 1), (rs[0], [seg] if doubt else [])
            c = (best[j][0] + cost[0], best[j][1] + cost[1])
            if c < best[i]:
                best[i], back[i] = c, (j, item)
    if best[n] == INF:
        return None, list(w)
    parts, doubts, i = [], [], n
    while i > 0:
        j, (z, d) = back[i]
        parts.append(z)
        doubts = d + doubts
        i = j
    return ' '.join(reversed(parts)), doubts


def read_tsv(path):
    """回傳 [(行號, [詞, 注音, 源, 備註])]，註解與空行原樣略過。"""
    rows = []
    for no, line in enumerate(Path(path).read_text(encoding='utf-8').splitlines(), 1):
        if not line.strip() or line.startswith('#'):
            continue
        cols = line.split('\t')
        cols += [''] * (4 - len(cols))
        rows.append((no, [c.strip() for c in cols[:4]]))
    return rows


def check_row(w, z, origin):
    if not _HAN.match(w):
        return '詞要是 2～11 個漢字'
    if origin not in ORIGINS:
        return '源要是 %s 其中之一' % '、'.join(sorted(ORIGINS))
    if z:
        syl = z.split(' ')
        if len(syl) != len(w) or not all(_SYL.match(s) for s in syl):
            return '注音格式不對或音節數與字數不同：%s' % z
    return None


def load_simplified_checker():
    """有規則輸入快取時，回傳「詞裡的簡體字／罕用字」檢查函式；沒有快取回傳 None（略過這項檢查）。"""
    try:
        sys.path.insert(0, str(HERE))
        import build as buildlib
        from lex import cache_dir, rules as ruleslib, sources
        ctx = ruleslib.load_rule_context(buildlib.rule_paths(sources.load_lock(buildlib.LOCK_PATH), cache_dir()))
    except Exception:   # noqa: BLE001 — 沒有快取就略過，不擋建置
        return None
    return lambda w: ruleslib.char_problem(w, ctx)


def run(write=True, slang_dir=SLANG_DIR, out_path=OUT_PATH, repo=REPO):
    problems, entries, seen = [], [], {}
    lex = chars = poly = None
    simp = load_simplified_checker()
    files = sorted(Path(slang_dir).glob('*.tsv'))
    if not files:
        problems.append('找不到任何 %s/*.tsv' % slang_dir)
    for f in files:
        rows = read_tsv(f)
        changed = False
        for no, cols in rows:
            w, z, origin, _note = cols
            where = '%s 第 %d 行「%s」' % (f.name, no, w)
            msg = check_row(w, z, origin)
            if msg:
                problems.append('%s：%s' % (where, msg))
                continue
            if w in seen:
                problems.append('%s：重複（已在 %s）' % (where, seen[w]))
                continue
            seen[w] = f.name
            if simp:
                hit = simp(w)
                if hit and hit[0] == 'R1-simplified':   # 罕用字（R2）不擋：人名、作品名常用（例：堺雅人、柾國），注音照填
                    problems.append('%s：含簡體字「%s」' % (where, hit[1]))
            if not z:
                if lex is None:
                    lex = load_pack_words(repo)
                    chars, poly = load_char_readings(lex, repo)
                guess, doubts = auto_reading(w, lex, chars, poly)
                if guess is None or doubts:
                    problems.append('%s：破音字「%s」要手動填注音（建議：%s）' % (
                        where, '、'.join(doubts), guess or '無'))
                    continue
                cols[1] = z = guess
                changed = True
            entries.append({'w': w, 'z': z, 'p': P_DEFAULT})
        if changed and write:
            _rewrite_z(f, rows)
    if problems:
        return problems, None
    entries.sort(key=lambda e: e['w'])
    body = ',\n'.join(json.dumps(e, ensure_ascii=False, separators=(',', ':')) for e in entries)
    ver = hashlib.sha256(body.encode('utf-8')).hexdigest()[:10]
    text = '{"version":"%s","count":%d,"added":[\n%s\n]}\n' % (ver, len(entries), body)
    if write:
        Path(out_path).parent.mkdir(parents=True, exist_ok=True)
        Path(out_path).write_text(text, encoding='utf-8')
    elif not Path(out_path).exists() or Path(out_path).read_text(encoding='utf-8') != text:
        problems.append('%s 與 TSV 不一致：請執行 python3 -B tools/lexicon/slang.py' % out_path)
    return problems, entries


def _rewrite_z(path, rows):
    """只改注音欄（第 2 欄），其他行（註解、空行、備註）一個字都不動。"""
    fill = {no: cols[1] for no, cols in rows}
    out = []
    for no, line in enumerate(Path(path).read_text(encoding='utf-8').splitlines(), 1):
        if no in fill:
            cols = line.split('\t')
            cols += [''] * (4 - len(cols))
            cols[1] = fill[no]
            line = '\t'.join(cols).rstrip('\t')
        out.append(line)
    Path(path).write_text('\n'.join(out) + '\n', encoding='utf-8')


def main(argv=None):
    ap = argparse.ArgumentParser(description='好韻器自建潮流詞庫')
    ap.add_argument('--check', action='store_true', help='只檢查，不寫任何檔案')
    args = ap.parse_args(argv)
    problems, entries = run(write=not args.check)
    for p in problems:
        print(p)
    if problems:
        return 1
    print('自建潮流詞庫：%d 個詞%s' % (len(entries), '（檢查通過）' if args.check else ' → ' + str(OUT_PATH.relative_to(REPO))))
    return 0


if __name__ == '__main__':
    sys.exit(main())
