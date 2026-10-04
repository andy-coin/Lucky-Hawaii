#!/usr/bin/env python3
"""好韻器詞庫清洗工具：fetch（下載）| build（建包）| verify（離線驗證）| rescue（救回誤刪的詞）| all（全部）。

用法（一律加 -B，不寫 __pycache__）：
    python3 -B tools/lexicon/build.py all
結束代碼：0 成功、1 驗證有問題（逐行列出）、2 工具停止（訊息在 stderr）。
"""
import argparse
import json
import os
import sys
import unicodedata
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

from lex import LexError, REPO, cache_dir  # noqa: E402
from lex import pack as packlib  # noqa: E402
from lex import report as reportlib  # noqa: E402
from lex import parse as parselib  # noqa: E402
from lex import rules as ruleslib  # noqa: E402
from lex import sources  # noqa: E402

LOCK_PATH = HERE / 'sources.lock.json'
PACKS_PATH = HERE / 'packs.json'
OVERRIDES_PATH = HERE / 'rules' / 'reading-overrides.json'
POLY_PATH = REPO / 'data' / 'polyphonic-order.json'
OVERRIDES_WORDS_PATH = REPO / 'data' / 'wordlist-overrides.json'
KEEP_PATH = HERE / 'rules' / 'keep.json'      # rescue 寫入的救回清單（測試會換成暫存檔）
REPORTS_ROOT = HERE / 'reports'               # rescue 查刪除清單的位置（測試會換成暫存資料夾）


def _load_json(path):
    try:
        with open(path, encoding='utf-8') as fh:
            return json.load(fh)
    except (OSError, ValueError) as exc:
        raise LexError('讀不到 %s：%s' % (path, exc))


def cmd_fetch(lock):
    sources.fetch_all(lock, log=print)
    print('來源檔案都已就緒（快取：%s）' % cache_dir())


_OPENCC_FILES = {'st': 'data/dictionary/STCharacters.txt', 'ts': 'data/dictionary/TSCharacters.txt',
                 'twphrases': 'data/dictionary/TWPhrases.txt'}
_MOE_FILES = {'moe_common': 'data-charlist/臺灣《常用國字表》（1982年）.txt',
              'moe_secondary': 'data-charlist/臺灣《次常用國字表》（1982年）.txt'}


def rule_paths(lock, base):
    """規則輸入的檔案路徑：OpenCC 字表與教育部字表（只讀快取，sha256 已核對）＋專案內的規則檔。"""
    paths = {}
    opencc = sources.cached_files(sources.get_source(lock, 'opencc'), base)
    for key, name in _OPENCC_FILES.items():
        paths[key] = opencc[name]
    moe = sources.cached_files(sources.get_source(lock, 'tw-charlists'), base)
    for key, name in _MOE_FILES.items():
        paths[key] = moe[name]
    paths['char_allow'] = HERE / 'rules' / 'char-allow.txt'
    paths['china_extra'] = HERE / 'rules' / 'china-terms-extra.txt'
    paths['keep'] = HERE / 'rules' / 'keep.json'
    paths['r3_gray'] = HERE / 'rules' / 'r3-gray.json'
    paths['overrides'] = OVERRIDES_WORDS_PATH
    return paths


def _shipped_texts(repo):
    """隨詞庫包散布的文字檔（NOTICE.txt、LICENSE.*.txt）：{相對路徑: 內容}。"""
    out = {}
    base = Path(repo) / 'data' / 'packs'
    if not base.is_dir():
        return out
    for folder in sorted(p for p in base.iterdir() if p.is_dir()):
        for f in sorted(folder.iterdir()):
            if f.name == 'NOTICE.txt' or (f.name.startswith('LICENSE') and f.suffix == '.txt'):
                out['data/packs/%s/%s' % (folder.name, f.name)] = f.read_text(encoding='utf-8')
    return out


def cmd_build(lock, gray_policy='p1'):
    packs_cfg = _load_json(PACKS_PATH)
    base = cache_dir()
    poly_order = _load_json(POLY_PATH)
    overrides = _load_json(OVERRIDES_PATH)
    ctx = ruleslib.load_rule_context(rule_paths(lock, base), gray_policy=gray_policy)
    # 第一階段：解析所有詞庫包（規則要比對「幾個來源都有這個詞」，所以要全部讀完才能判斷）
    parsed = {}
    multi = {}
    infos = {}
    for cfg in packs_cfg['packs']:
        if cfg.get('legacy'):
            continue
        sources.assert_pack_sources(cfg, lock)
        files = {}
        srcs_meta = []
        for sid in cfg['sources']:
            src = sources.get_source(lock, sid)
            cached = sources.cached_files(src, base)
            sources.check_evidence(src, base)
            for path, p in cached.items():
                files['%s/%s' % (sid, path)] = p
            srcs_meta.append({'id': sid, 'repo': src['repo'], 'commit': src['commit'],
                              'licence_spdx': src['licence_spdx']})
        parser = parselib.PARSERS.get(cfg['parser'])
        if parser is None:
            raise LexError('不認得的 parser：%s' % cfg['parser'])
        header, rows = parser(files)
        multi[cfg['id']] = []
        parsed[cfg['id']] = parselib.collect(rows, poly_order, overrides, cfg['sources'][0], multi[cfg['id']])
        infos[cfg['id']] = (cfg, header, srcs_meta)
    # 第二階段：套用規則（K0、R0–R3、灰色）
    results = ruleslib.apply_rules(parsed, ctx)
    metas = {}
    for pid, (cfg, header, srcs_meta) in infos.items():
        res = results[pid]
        stats = res['stats']
        out_dir = REPO / 'data' / 'packs' / pid
        out_dir.mkdir(parents=True, exist_ok=True)
        licence_files = []
        tabe_text = None
        for spec in cfg.get('licence_texts', []):
            src = sources.get_source(lock, spec['source'])
            data = sources.licence_text_path(src, spec, base).read_bytes()
            packlib._write_bytes(out_dir / spec['as'], data)
            licence_files.append({'file': spec['as'], 'sha256': packlib._sha256_file(out_dir / spec['as'])})
            if spec.get('extract'):
                tabe_text = data.decode('utf-8')
        upstream = header.get(cfg.get('upstream_version_from', ''), '')
        meta = packlib.write_pack(
            out_dir, cfg, res['entries'],
            {'stats': stats, 'gray': res['gray'], 'gray_pending': res['gray'], 'gray_policy': gray_policy},
            sources=srcs_meta, licence_files=licence_files)
        packlib.write_notice(out_dir, cfg, meta, upstream, stats['removed'], tabe_text)
        packlib.write_removed(HERE / 'reports' / pid / 'removed.ndjson', res['removed'])
        # 刪除報告（06-06）：只留下保留的詞的多讀音列；網站不會讀（放在 tools/ 底下，不在 data/）
        kept_words = {e['w'] for e in res['entries']}
        multi_rows = sorted((m for m in multi[pid] if m['w'] in kept_words), key=lambda m: m['w'])
        rstats = reportlib.build_stats(cfg, meta, res['removed'], res['gray_rows'], multi_rows,
                                       res['china_kept_rows'])
        reportlib.write_report(HERE / 'reports' / pid, cfg, meta, rstats, res['removed'], res['gray_rows'],
                               multi_rows, res['china_kept_rows'])
        metas[pid] = meta
        per_rule = '、'.join('%s %d' % (k, v) for k, v in stats['rules'].items()) or '無'
        print('%s：保留 %d 筆、刪除 %d 筆（%s）、略過單字 %d 筆；灰色 %d 筆（待 AI 判斷 %d 筆）；'
              '中國用語但詞頻夠高而保留 %d 筆；版本 %s' % (
                  cfg['name'], stats['kept'], stats['removed'], per_rule, stats['skipped_single'],
                  res['gray'], res['gray'], stats['china_kept'], meta['version']))
        print('  刪除報告：tools/lexicon/reports/%s/REPORT.md' % pid)
    packlib.write_manifest(packs_cfg, metas, REPO)
    packlib.write_v096_notice(REPO)
    problems = ruleslib.shipped_text_problems(_shipped_texts(REPO), ctx)
    if problems:
        raise LexError('隨詞庫包散布的文字含簡體字：' + '；'.join(problems))


def strict_problems(repo, ctx, limit=30):
    """嚴格驗證：每個詞庫包的每個詞都要符合內容規則，隨包文字不可含簡體字。"""
    problems = []
    base = Path(repo) / 'data' / 'packs'
    manifest = _load_json(base / 'index.json')
    for item in manifest['packs']:
        if item.get('legacyCache'):
            continue
        pid = item['id']
        found = []
        for i in range(item_chunks(base / pid)):
            with open(base / pid / ('c%02d.json' % i), encoding='utf-8') as fh:
                for line in fh:
                    e = json.loads(line)
                    w = e['w']
                    if w in ctx.keep_allow:
                        continue
                    hit = ruleslib.char_problem(w, ctx)
                    if hit:
                        found.append('詞庫包 %s：「%s」%s' % (pid, w, ruleslib.reason_for(*hit)))
                        continue
                    msg = ruleslib.china_term_problem(w, e['p'], ctx)
                    if msg:
                        found.append('詞庫包 %s：%s' % (pid, msg))
        problems += found[:limit]
        if len(found) > limit:
            problems.append('詞庫包 %s：另有 %d 筆不合規則' % (pid, len(found) - limit))
    problems += ruleslib.shipped_text_problems(_shipped_texts(repo), ctx)
    return problems


def item_chunks(folder):
    return _load_json(folder / 'meta.json')['chunks']


def cmd_verify(strict=False):
    problems = packlib.verify(REPO)
    if strict:
        try:
            lock = sources.load_lock(LOCK_PATH)
            ctx = ruleslib.load_rule_context(rule_paths(lock, cache_dir()))
        except LexError as exc:
            if '找不到下載快取' in str(exc):
                raise LexError('找不到規則輸入快取，請先執行 npm run lexicon:build')
            raise
        if not problems:
            problems += strict_problems(REPO, ctx)
    if problems:
        for p in problems:
            print(p)
        return 1
    manifest = _load_json(REPO / 'data' / 'packs' / 'index.json')
    print('驗證通過：%d 個詞庫包%s' % (len(manifest['packs']), '（嚴格：無簡體字、罕用字、中國用語殘留）' if strict else ''))
    return 0


def _valid_rescue_word(w):
    """救回的詞只能是 2～11 個 BMP 漢字（網站吃得下的格式，T-06-18）。"""
    return 2 <= len(w) <= parselib.MAX_WORD_LEN and all(parselib.is_han(c) and ord(c) <= 0xFFFF for c in w)


def _write_keep(path, words):
    """排序（依字碼）、不重複、縮排 2、先寫暫存檔再 os.replace；內容沒變就不動檔案。"""
    text = json.dumps(sorted(set(words)), ensure_ascii=False, indent=2) + '\n'
    path = Path(path)
    try:
        if path.read_text(encoding='utf-8') == text:
            return
    except OSError:
        pass
    tmp = path.with_name(path.name + '.tmp%d' % os.getpid())
    try:
        tmp.write_text(text, encoding='utf-8')
        os.replace(tmp, path)
    finally:
        if tmp.exists():
            tmp.unlink()


def _pack_names():
    try:
        return {p['id']: p['name'] for p in _load_json(PACKS_PATH)['packs']}
    except LexError:
        return {}


def cmd_rescue(words, rebuild=False, lock=None):
    """救回誤刪的詞（D2）：加進 keep.json，並印出每個刪掉它的詞庫包、規則、原因，以及可貼進
    data/wordlist-overrides.json「added」的那一行。輸入不合格就整批不寫、結束代碼 2。"""
    clean = []
    for raw in words:
        w = unicodedata.normalize('NFC', raw)
        if not _valid_rescue_word(w):
            raise LexError('只能救回 2～11 個漢字的詞：%s' % raw)
        if w not in clean:
            clean.append(w)
    keep_path = Path(KEEP_PATH)
    try:
        current = json.loads(keep_path.read_text(encoding='utf-8'))
    except OSError:
        current = []
    except ValueError as exc:
        raise LexError('keep.json 不是正確的 JSON：%s' % exc)
    if not isinstance(current, list):
        raise LexError('keep.json 必須是詞的清單')
    names = _pack_names()
    reports = Path(REPORTS_ROOT)
    folders = sorted(p for p in reports.iterdir() if (p / 'removed.ndjson').is_file()) if reports.is_dir() else []
    for w in clean:
        print('「%s」' % w)
        found = False
        for folder in folders:
            for line in (folder / 'removed.ndjson').read_text(encoding='utf-8').splitlines():
                if not line:
                    continue
                row = json.loads(line)
                if row['w'] != w:
                    continue
                found = True
                print('  %s：%s（%s）' % (names.get(folder.name, folder.name), row['rule'], row['reason']))
                if row['rule'].startswith('R0-'):
                    print('    這個詞因為「格式不合」被刪，救回名單救不回來（網站吃不下這種格式）')
                else:
                    print('    貼進 data/wordlist-overrides.json 的 added：%s' % json.dumps(
                        {'w': row['w'], 'z': row['z'], 'p': row['p']}, ensure_ascii=False, separators=(',', ':')))
        if not found:
            print('  目前沒有詞庫包刪除這個詞，已加入保留名單（之後 AI 判斷也不會刪它）')
    _write_keep(keep_path, [x for x in current if isinstance(x, str)] + clean)
    if rebuild:
        cmd_build(lock or sources.load_lock(LOCK_PATH))
        return cmd_verify(strict=True)
    print('重新執行 npm run lexicon:build 後生效')
    return 0


def main(argv=None):
    ap = argparse.ArgumentParser(description='好韻器詞庫清洗工具')
    sub = ap.add_subparsers(dest='cmd', required=True)
    sub.add_parser('fetch', help='下載並檢查釘選的來源檔')
    b = sub.add_parser('build', help='用快取的來源建出詞庫包')
    v = sub.add_parser('verify', help='離線驗證已提交的詞庫包')
    v.add_argument('--strict', action='store_true',
                   help='加嚴驗證：另載入規則輸入，確認沒有簡體、罕用字、中國用語殘留')
    r = sub.add_parser('rescue', help='救回被誤刪的詞（加進 rules/keep.json，並印出可貼進修正檔的那一行）')
    r.add_argument('words', nargs='+', help='要救回的詞（2～11 個漢字）')
    r.add_argument('--rebuild', action='store_true', help='加進保留名單後立刻重建詞庫包')
    a = sub.add_parser('all', help='fetch + build + verify --strict')
    for sp in (b, a):
        sp.add_argument('--gray-policy', choices=('p1', 'p2'), default='p1',
                        help='灰色策略：p1（預設）只有單一來源的詞變灰色；p2 另加「所有來源詞頻都是 0」的詞')
    args = ap.parse_args(argv)
    if sys.version_info < (3, 9):
        print('需要 Python 3.9 以上（python3）', file=sys.stderr)
        return 2
    try:
        if args.cmd == 'verify':
            return cmd_verify(args.strict)
        if args.cmd == 'rescue':
            return cmd_rescue(args.words, args.rebuild)
        lock = sources.load_lock(LOCK_PATH)
        if args.cmd in ('fetch', 'all'):
            cmd_fetch(lock)
        if args.cmd in ('build', 'all'):
            cmd_build(lock, args.gray_policy)
        if args.cmd == 'all':
            return cmd_verify(strict=True)
        return 0
    except LexError as exc:
        print('停止：%s' % exc, file=sys.stderr)
        return 2


if __name__ == '__main__':
    sys.exit(main())
