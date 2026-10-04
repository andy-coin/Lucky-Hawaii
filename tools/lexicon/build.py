#!/usr/bin/env python3
"""好韻器詞庫清洗工具：fetch（下載）| build（建包）| verify（離線驗證）| all（全部）。

用法（一律加 -B，不寫 __pycache__）：
    python3 -B tools/lexicon/build.py all
結束代碼：0 成功、1 驗證有問題（逐行列出）、2 工具停止（訊息在 stderr）。
"""
import argparse
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

from lex import LexError, REPO, cache_dir  # noqa: E402
from lex import pack as packlib  # noqa: E402
from lex import parse as parselib  # noqa: E402
from lex import sources  # noqa: E402

LOCK_PATH = HERE / 'sources.lock.json'
PACKS_PATH = HERE / 'packs.json'
OVERRIDES_PATH = HERE / 'rules' / 'reading-overrides.json'
POLY_PATH = REPO / 'data' / 'polyphonic-order.json'


def _load_json(path):
    try:
        with open(path, encoding='utf-8') as fh:
            return json.load(fh)
    except (OSError, ValueError) as exc:
        raise LexError('讀不到 %s：%s' % (path, exc))


def cmd_fetch(lock):
    sources.fetch_all(lock, log=print)
    print('來源檔案都已就緒（快取：%s）' % cache_dir())


def cmd_build(lock):
    packs_cfg = _load_json(PACKS_PATH)
    base = cache_dir()
    poly_order = _load_json(POLY_PATH)
    overrides = _load_json(OVERRIDES_PATH)
    metas = {}
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
        entries, removed, stats = parselib.collect(rows, poly_order, overrides, cfg['sources'][0])

        out_dir = REPO / 'data' / 'packs' / cfg['id']
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
        meta = packlib.write_pack(out_dir, cfg, entries, {'stats': stats},
                                  sources=srcs_meta, licence_files=licence_files)
        packlib.write_notice(out_dir, cfg, meta, upstream, stats['removed'], tabe_text)
        packlib.write_removed(HERE / 'reports' / cfg['id'] / 'removed.ndjson', removed)
        metas[cfg['id']] = meta
        print('%s：保留 %d 筆、刪除 %d 筆（格式）、略過單字 %d 筆、版本 %s' % (
            cfg['name'], stats['kept'], stats['removed'], stats['skipped_single'], meta['version']))
    packlib.write_manifest(packs_cfg, metas, REPO)
    packlib.write_v096_notice(REPO)


def cmd_verify(strict=False):
    # --strict 要等 06-05 加入規則輸入後才有額外檢查；目前與一般驗證相同
    problems = packlib.verify(REPO)
    if problems:
        for p in problems:
            print(p)
        return 1
    manifest = _load_json(REPO / 'data' / 'packs' / 'index.json')
    print('驗證通過：%d 個詞庫包' % len(manifest['packs']))
    return 0


def main(argv=None):
    ap = argparse.ArgumentParser(description='好韻器詞庫清洗工具')
    sub = ap.add_subparsers(dest='cmd', required=True)
    sub.add_parser('fetch', help='下載並檢查釘選的來源檔')
    sub.add_parser('build', help='用快取的來源建出詞庫包')
    v = sub.add_parser('verify', help='離線驗證已提交的詞庫包')
    v.add_argument('--strict', action='store_true', help='加嚴驗證（06-05 起有額外檢查）')
    sub.add_parser('all', help='fetch + build + verify')
    args = ap.parse_args(argv)
    if sys.version_info < (3, 9):
        print('需要 Python 3.9 以上（python3）', file=sys.stderr)
        return 2
    try:
        if args.cmd == 'verify':
            return cmd_verify(args.strict)
        lock = sources.load_lock(LOCK_PATH)
        if args.cmd in ('fetch', 'all'):
            cmd_fetch(lock)
        if args.cmd in ('build', 'all'):
            cmd_build(lock)
        if args.cmd == 'all':
            return cmd_verify()
        return 0
    except LexError as exc:
        print('停止：%s' % exc, file=sys.stderr)
        return 2


if __name__ == '__main__':
    sys.exit(main())
