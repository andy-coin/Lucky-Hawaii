"""詞庫包寫出（分片、版本、meta、NOTICE、清單）與離線驗證。

輸出一律「可重現」：排序固定、沒有時間戳（只有 meta.built 這個日期，而且只在版本改變時才重寫），
所以同樣的輸入重跑一次，data/packs 與 reports 底下每個檔案都逐位元組相同（LEX-06、Pitfall 16）。
"""
import datetime
import hashlib
import json
import os
import re
from pathlib import Path

from . import CHUNK_SIZE, LexError, REPO, RULES_VERSION, SPDX_ALLOW  # noqa: F401
from .parse import _SYLLABLE, is_han

_CHUNK_NAME = re.compile(r'^c(\d{2})\.json$')
_META_KEYS = ('id', 'name', 'description', 'version', 'hash', 'entries', 'chunks', 'sources',
              'licence', 'licence_files', 'rules_version', 'built')


def today():
    """今天的 UTC 日期（YYYY-MM-DD）；獨立成函式方便測試時替換。"""
    return datetime.datetime.now(datetime.timezone.utc).date().isoformat()


def _write_bytes(path, data):
    """先寫暫存檔再 os.replace；內容沒變就不動檔案（避免無謂的時間戳變動）。"""
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
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


def _write_text(path, text):
    _write_bytes(path, text.encode('utf-8'))


def _json_line(obj):
    return json.dumps(obj, ensure_ascii=False, separators=(',', ':'))


def _read_json(path):
    with open(path, encoding='utf-8') as fh:
        return json.load(fh)


def write_pack(out_dir, cfg, entries, meta_extra=None, sources=(), licence_files=()):
    """把條目依詞排序、切成分片寫進 out_dir，並寫 meta.json；回傳 meta dict。

    版本 = RULES_VERSION + '.' + 全部分片位元組（依序）sha256 的前 10 位十六進位，
    內容只要有變，版本就跟著變。
    """
    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    rows = sorted(entries, key=lambda e: e['w'])
    chunks = []
    for i in range(0, len(rows), CHUNK_SIZE):
        part = rows[i:i + CHUNK_SIZE]
        text = ''.join(_json_line({'w': e['w'], 'z': e['z'], 'p': e['p']}) + '\n' for e in part)
        chunks.append(text.encode('utf-8'))
    h = hashlib.sha256()
    for data in chunks:
        h.update(data)
    digest = h.hexdigest()
    version = RULES_VERSION + '.' + digest[:10]
    for i, data in enumerate(chunks):
        _write_bytes(out_dir / ('c%02d.json' % i), data)
    # 刪掉比新片數多出來的舊分片
    for p in out_dir.iterdir():
        m = _CHUNK_NAME.match(p.name)
        if m and int(m.group(1)) >= len(chunks):
            p.unlink()
    # 版本沒變就沿用舊的 built，這樣重跑不會讓 meta.json 變髒
    built = today()
    try:
        prev = _read_json(out_dir / 'meta.json')
        if prev.get('version') == version and prev.get('built'):
            built = prev['built']
    except (OSError, ValueError):
        pass
    meta = {
        'id': cfg['id'],
        'name': cfg['name'],
        'description': cfg['description'],
        'version': version,
        'hash': digest,
        'entries': len(rows),
        'chunks': len(chunks),
        'sources': list(sources),
        'licence': cfg['licence_spdx'],
        'licence_files': list(licence_files),
        'rules_version': RULES_VERSION,
        'built': built,
    }
    meta.update(meta_extra or {})
    _write_text(out_dir / 'meta.json', json.dumps(meta, ensure_ascii=False, indent=2) + '\n')
    return meta


def write_removed(path, rows):
    """刪除清單（D1）：每行一個詞，依詞排序，沒有時間戳。"""
    rows = sorted(rows, key=lambda r: (r['w'], r['z'], r['rule']))
    text = ''.join(_json_line(r) + '\n' for r in rows)
    _write_text(path, text)


def pack_notice(cfg, meta, upstream_version, removed_count, tabe_text=None):
    """NOTICE.txt：繁體中文框架 + 英文授權全文（另放 LICENSE.*.txt）。"""
    lines = []
    lines.append('%s（id: %s，版本 %s）' % (cfg['name'], cfg['id'], meta['version']))
    for src in meta['sources']:
        name = src['id']
        up = ('上游版本標示 ' + upstream_version) if upstream_version else '上游未標版本，以 commit 為準'
        lines.append('來源：%s — %s（commit %s，%s）' % (name, src['repo'], src['commit'], up))
    lic_names = [f['file'] for f in meta['licence_files']]
    lines.append('授權：%s（全文見同資料夾 %s）' % (meta['licence'], '、'.join(lic_names)))
    for c in cfg.get('copyright', []):
        lines.append('著作權：' + c)
    if cfg.get('notice_extra'):
        lines.append('補充說明：' + cfg['notice_extra'])
    lines.append('改作說明：本詞庫包由上述資料經自動清洗產生——刪除格式不合的詞條'
                 '（含非漢字或擴充區字元、詞長超過 11 字、注音符號錯誤或音節數與字數不符），'
                 '略過單字，並轉換為 JSON Lines 格式。')
    lines.append('          共刪除 %d 筆，刪除清單與原因見 tools/lexicon/reports/%s/removed.ndjson。'
                 % (removed_count, cfg['id']))
    lines.append('改作日期：' + meta['built'])
    lines.append('清洗規則使用：OpenCC 字表（Apache-2.0）；教育部常用／次常用國字表僅作比對，不重新散布。')
    text = '\n'.join(lines) + '\n'
    if tabe_text:
        text += '\n---- libtabe（TaBE）著作權與授權聲明（原文）----\n\n' + tabe_text
    return text


def write_notice(out_dir, cfg, meta, upstream_version, removed_count, tabe_text=None):
    _write_text(Path(out_dir) / 'NOTICE.txt',
                pack_notice(cfg, meta, upstream_version, removed_count, tabe_text))


def v096_notice_text():
    return (
        'v0.96 現行詞庫（id: v096）\n'
        '說明：這是好韻器目前網站使用的詞庫，檔案是 data/wordlist-c00.json 到 wordlist-c09.json，'
        '詞庫版本見 data/wordlist-meta.json。\n'
        '\n'
        '來源與授權（照實說明）：\n'
        '本詞庫衍生自 vChewing 專案的 VanguardLexicon 與 libchewing-data。其中各部分的授權如下：\n'
        '  - vChewing 自己維護的部分：MulanPSL-2.0（木蘭寬鬆許可證第 2 版）。\n'
        '  - libtabe（TaBE 專案）詞條：BSD-3-Clause。\n'
        '  - 教育部《重編國語辭典修訂本》詞條：CC BY-ND 3.0（創用 CC 姓名標示－禁止改作）。\n'
        '  - CNS11643 中文標準交換碼的字元資料：政府資料開放授權條款第 1 版（OGDv1）。\n'
        '  - libchewing-data（新酷音詞庫）：LGPL-2.1-or-later。\n'
        '\n'
        '已知授權限制：上列 CC BY-ND 3.0 的重編國語辭典修訂本成分不允許改作後再散布，'
        '而本詞庫已把它和其他來源合併過，嚴格來說可能不符合該授權。'
        '第 12 階段的官方詞庫將不再沿用教育部衍生的部分；在那之前，v0.96 照舊作為預設詞庫，並在此老實標示。\n'
        '\n'
        '姓名標示（CC BY 要求的出處）：教育部《重編國語辭典修訂本》 https://dict.revised.moe.edu.tw/\n'
        '\n'
        '改作說明：本詞庫是上述資料經過整理、合併與格式轉換後的結果，內容與上游並不完全相同。\n'
        '\n'
        '其他可切換的詞庫包各自附有 NOTICE 與授權全文，且不含教育部衍生內容。\n'
    )


def write_v096_notice(repo=REPO):
    _write_text(Path(repo) / 'data' / 'packs' / 'v096' / 'NOTICE.txt', v096_notice_text())


def write_manifest(packs_cfg, metas, repo=REPO):
    """data/packs/index.json：網站讀的詞庫包清單（第一個是預設的 v096）。"""
    repo = Path(repo)
    out = []
    for p in packs_cfg['packs']:
        pid = p['id']
        if p.get('legacy'):
            total = _read_json(repo / p['meta'])['total']
            item = {'id': pid, 'name': p['name'], 'description': p['description'],
                    'entries': total, 'meta': p['meta'], 'chunkPattern': p['chunkPattern'],
                    'notice': 'data/packs/%s/NOTICE.txt' % pid, 'legacyCache': True}
        else:
            if pid not in metas:
                raise LexError('清單缺少詞庫包 %s 的 meta' % pid)
            item = {'id': pid, 'name': p['name'], 'description': p['description'],
                    'entries': metas[pid]['entries'],
                    'meta': 'data/packs/%s/meta.json' % pid,
                    'chunkPattern': 'data/packs/%s/c{NN}.json' % pid,
                    'notice': 'data/packs/%s/NOTICE.txt' % pid}
        out.append(item)
    manifest = {'schema': 1, 'default': packs_cfg['default'], 'packs': out}
    _write_text(repo / 'data' / 'packs' / 'index.json',
                json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')
    return manifest


def _sha256_file(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def _expected_licence_sha(spec, lock):
    for src in lock['sources']:
        if src['id'] == spec['source']:
            if spec.get('extract'):
                return src['extract']['sha256']
            for f in src['files']:
                if f['path'] == spec['file']:
                    return f['sha256']
    return None


def verify(repo=REPO, packs_cfg=None, lock=None):
    """離線驗證已提交的詞庫包（只讀專案內的檔案，OD-7）；回傳問題清單，空 = 通過。"""
    repo = Path(repo)
    problems = []
    if packs_cfg is None:
        packs_cfg = _read_json(repo / 'tools' / 'lexicon' / 'packs.json')
    if lock is None:
        lock = _read_json(repo / 'tools' / 'lexicon' / 'sources.lock.json')
    base = repo / 'data' / 'packs'
    idx_path = base / 'index.json'
    try:
        manifest = _read_json(idx_path)
    except (OSError, ValueError) as exc:
        return ['讀不到詞庫包清單 data/packs/index.json：%s' % exc]
    if manifest.get('schema') != 1:
        problems.append('index.json：schema 必須是 1')
    if manifest.get('default') != 'v096':
        problems.append('index.json：預設詞庫包必須是 v096，目前是 %r' % manifest.get('default'))
    mpacks = manifest.get('packs')
    if not isinstance(mpacks, list) or not mpacks:
        return problems + ['index.json：packs 缺少或是空的']
    ids = [p.get('id') for p in mpacks]
    cfg_ids = [p['id'] for p in packs_cfg['packs']]
    if ids != cfg_ids:
        problems.append('index.json 的詞庫包 %s 與 packs.json 的 %s 不一致' % (ids, cfg_ids))
    cfg_by_id = {p['id']: p for p in packs_cfg['packs']}
    # 資料夾底下只能有清單裡的詞庫包
    if base.is_dir():
        for child in sorted(base.iterdir()):
            if child.is_dir() and child.name not in ids:
                problems.append('data/packs/%s：清單裡沒有這個詞庫包' % child.name)
            elif child.is_file() and child.name != 'index.json':
                problems.append('data/packs/%s：多出來的檔案' % child.name)
    for entry in mpacks:
        pid = entry.get('id')
        if pid == 'v096':
            problems += _verify_legacy(repo, entry)
        else:
            problems += _verify_pack(repo, entry, cfg_by_id.get(pid), lock)
    return problems


def _verify_legacy(repo, entry):
    problems = []
    if entry.get('legacyCache') is not True:
        problems.append('v096：legacyCache 必須是 true')
    if entry.get('meta') != 'data/wordlist-meta.json':
        problems.append('v096：meta 必須是 data/wordlist-meta.json')
    if entry.get('chunkPattern') != 'data/wordlist-c{NN}.json':
        problems.append('v096：chunkPattern 必須是 data/wordlist-c{NN}.json')
    try:
        total = _read_json(repo / 'data' / 'wordlist-meta.json')['total']
        if entry.get('entries') != total:
            problems.append('v096：entries %r 與 data/wordlist-meta.json 的 total %r 不同' % (
                entry.get('entries'), total))
    except (OSError, ValueError, KeyError):
        problems.append('v096：讀不到 data/wordlist-meta.json')
    notice = repo / 'data' / 'packs' / 'v096' / 'NOTICE.txt'
    if entry.get('notice') != 'data/packs/v096/NOTICE.txt':
        problems.append('v096：notice 路徑不對')
    try:
        text = notice.read_text(encoding='utf-8')
        for needle in ('CC BY-ND 3.0', '重編國語辭典修訂本'):
            if needle not in text:
                problems.append('v096 NOTICE 缺少「%s」' % needle)
    except OSError:
        problems.append('v096：找不到 data/packs/v096/NOTICE.txt')
    folder = repo / 'data' / 'packs' / 'v096'
    if folder.is_dir():
        for f in sorted(folder.iterdir()):
            if f.name != 'NOTICE.txt':
                problems.append('data/packs/v096/%s：多出來的檔案' % f.name)
    return problems


def _verify_pack(repo, entry, cfg, lock):
    pid = entry.get('id')
    problems = []
    tag = '詞庫包 %s：' % pid
    if cfg is None:
        return [tag + 'packs.json 裡沒有這個詞庫包']
    folder = repo / 'data' / 'packs' / pid
    if entry.get('meta') != 'data/packs/%s/meta.json' % pid:
        problems.append(tag + '清單的 meta 路徑不對')
    if entry.get('chunkPattern') != 'data/packs/%s/c{NN}.json' % pid:
        problems.append(tag + '清單的 chunkPattern 不對')
    if entry.get('notice') != 'data/packs/%s/NOTICE.txt' % pid:
        problems.append(tag + '清單的 notice 路徑不對')
    try:
        meta = _read_json(folder / 'meta.json')
    except (OSError, ValueError) as exc:
        return problems + [tag + '讀不到 meta.json：%s' % exc]
    for key in _META_KEYS:
        if key not in meta:
            problems.append(tag + 'meta.json 缺少欄位 %s' % key)
    if problems and any('缺少欄位' in p for p in problems):
        return problems
    # --- 分片 ---
    chunks = meta['chunks']
    if not isinstance(chunks, int) or chunks < 1:
        return problems + [tag + 'meta.chunks 必須是正整數']
    expected_names = ['c%02d.json' % i for i in range(chunks)]
    present = sorted(p.name for p in folder.iterdir() if _CHUNK_NAME.match(p.name))
    for name in expected_names:
        if name not in present:
            problems.append(tag + '缺少分片 %s' % name)
    for name in present:
        if name not in expected_names:
            problems.append(tag + '多出來的分片 %s' % name)
    h = hashlib.sha256()
    total = 0
    prev_w = None
    for ci, name in enumerate(expected_names):
        path = folder / name
        if not path.is_file():
            continue
        data = path.read_bytes()
        h.update(data)
        lines = data.decode('utf-8').split('\n')
        if lines and lines[-1] == '':
            lines.pop()
        else:
            problems.append(tag + '%s 最後一行沒有換行' % name)
        last = ci == chunks - 1
        if (not last and len(lines) != CHUNK_SIZE) or (last and not 1 <= len(lines) <= CHUNK_SIZE):
            problems.append(tag + '%s 有 %d 行，不符每片 %d 行（最後一片可較短）' % (name, len(lines), CHUNK_SIZE))
        total += len(lines)
        bad = 0
        for ln, line in enumerate(lines, 1):
            msg = _check_line(line, prev_w)
            if msg:
                bad += 1
                if bad <= 3:
                    problems.append(tag + '%s 第 %d 行：%s' % (name, ln, msg))
            try:
                prev_w = json.loads(line)['w']
            except (ValueError, KeyError, TypeError):
                pass
        if bad > 3:
            problems.append(tag + '%s 另有 %d 行有問題' % (name, bad - 3))
    if meta['entries'] != total:
        problems.append(tag + 'meta.entries %r 與實際行數 %d 不同' % (meta['entries'], total))
    if entry.get('entries') != meta['entries']:
        problems.append(tag + '清單的 entries %r 與 meta.entries %r 不同' % (entry.get('entries'), meta['entries']))
    digest = h.hexdigest()
    if meta['hash'] != digest:
        problems.append(tag + 'meta.hash 與分片內容不符')
    if meta['rules_version'] != RULES_VERSION:
        problems.append(tag + '清洗規則版本 %r 與目前工具的 %r 不同，需要重新產生' % (meta['rules_version'], RULES_VERSION))
    if meta['version'] != '%s.%s' % (meta['rules_version'], digest[:10]):
        problems.append(tag + 'meta.version 不是由分片內容算出來的')
    # --- 授權 ---
    for tok in [t.strip() for t in str(meta['licence']).split(' AND ')]:
        if tok not in SPDX_ALLOW:
            problems.append(tag + '授權 %s 不在允許清單內' % tok)
    for src in meta['sources']:
        for tok in [t.strip() for t in str(src.get('licence_spdx', '')).split(' AND ')]:
            if tok not in SPDX_ALLOW:
                problems.append(tag + '來源 %s 的授權 %s 不在允許清單內' % (src.get('id'), tok))
    allowed = set(expected_names) | {'meta.json', 'NOTICE.txt'}
    specs = cfg.get('licence_texts', [])
    meta_files = {f.get('file'): f.get('sha256') for f in meta['licence_files']}
    for spec in specs:
        name = spec['as']
        allowed.add(name)
        path = folder / name
        want = _expected_licence_sha(spec, lock)
        if not path.is_file():
            problems.append(tag + '缺少授權全文 %s' % name)
        elif want is None or _sha256_file(path) != want:
            problems.append(tag + '授權全文 %s 的 sha256 與來源鎖不符' % name)
        if meta_files.get(name) != want:
            problems.append(tag + 'meta.licence_files 對 %s 的紀錄與來源鎖不符' % name)
    for f in sorted(folder.iterdir()):
        if f.name not in allowed:
            problems.append(tag + '多出來的檔案 %s' % f.name)
    # --- NOTICE ---
    try:
        notice = (folder / 'NOTICE.txt').read_text(encoding='utf-8')
        needles = [meta['id'], meta['version'], '改作說明', '改作日期']
        needles += [t.strip() for t in str(meta['licence']).split(' AND ')]
        needles += [s['commit'] for s in meta['sources']]
        for n in needles:
            if n not in notice:
                problems.append(tag + 'NOTICE 缺少「%s」' % n)
    except OSError:
        problems.append(tag + '找不到 NOTICE.txt')
    return problems


def _check_line(line, prev_w):
    try:
        obj = json.loads(line)
    except ValueError:
        return '不是 JSON'
    if not isinstance(obj, dict) or sorted(obj) != ['p', 'w', 'z']:
        return '欄位必須剛好是 w、z、p'
    if line != _json_line({'w': obj['w'], 'z': obj['z'], 'p': obj['p']}):
        return '格式不是固定的精簡 JSON'
    w, z, p = obj['w'], obj['z'], obj['p']
    if not (isinstance(w, str) and isinstance(z, str)):
        return 'w、z 必須是字串'
    if not (isinstance(p, int) and not isinstance(p, bool) and p >= 0):
        return 'p 必須是 0 以上的整數'
    if not 2 <= len(w) <= 11 or not all(is_han(c) and ord(c) <= 0xFFFF for c in w):
        return '詞「%s」不是 2～11 個 BMP 漢字' % w
    syls = z.split(' ')
    if not all(_SYLLABLE.match(s) for s in syls):
        return '「%s」的注音「%s」含非注音符號' % (w, z)
    if len(syls) != len(w):
        return '「%s」的注音音節數與字數不符' % w
    if prev_w is not None and not w > prev_w:
        return '「%s」沒有依詞由小到大排序（前一個是「%s」）' % (w, prev_w)
    return None
