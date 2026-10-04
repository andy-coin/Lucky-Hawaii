"""來源鎖（sources.lock.json）、釘選下載、sha256 與授權閘門。

只有這一個模組會連網；而且只連 raw.githubusercontent.com 的「固定 commit」網址，
下載完先核對位元組數與 sha256 才會放進快取（T-06-01）。
"""
import hashlib
import json
import os
import re
import urllib.parse
from urllib.request import Request, urlopen

from . import LexError, SPDX_ALLOW, cache_dir

ROLES = ('pack', 'rule-input', 'licence-text')
_HEX40 = re.compile(r'^[0-9a-f]{40}$')
_HEX64 = re.compile(r'^[0-9a-f]{64}$')
_REPO_URL = re.compile(r'^https://github\.com/([A-Za-z0-9_.-]+)/([A-Za-z0-9_.-]+)$')
_BLOCK = 64 * 1024


def _bad(msg):
    raise LexError('來源鎖格式錯誤：' + msg)


def _check_path(sid, path):
    # 路徑會拿來組網址與快取路徑，不能跳出去
    if (not isinstance(path, str) or not path or path.startswith('/')
            or '..' in path.split('/') or '\\' in path):
        _bad('%s 的檔案路徑不合法：%r' % (sid, path))


def load_lock(path):
    """讀來源鎖並驗證每一欄；格式不對就丟 LexError。"""
    try:
        with open(path, encoding='utf-8') as fh:
            lock = json.load(fh)
    except (OSError, ValueError) as exc:
        raise LexError('讀不到來源鎖 %s：%s' % (path, exc))
    if lock.get('schema') != 1:
        _bad('schema 必須是 1')
    seen = set()
    for src in lock.get('sources', []):
        sid = src.get('id')
        if not isinstance(sid, str) or not sid or sid in seen:
            _bad('id 缺少或重複：%r' % (sid,))
        seen.add(sid)
        if src.get('role') not in ROLES:
            _bad('%s 的 role 必須是 %s' % (sid, '/'.join(ROLES)))
        if not isinstance(src.get('redistribute'), bool):
            _bad('%s 的 redistribute 必須是 true/false' % sid)
        if not _REPO_URL.match(str(src.get('repo', ''))):
            _bad('%s 的 repo 必須是 https://github.com/<擁有者>/<專案>' % sid)
        if not _HEX40.match(str(src.get('commit', ''))):
            _bad('%s 的 commit 必須是 40 位小寫十六進位' % sid)
        if not isinstance(src.get('licence_spdx'), str) or not src['licence_spdx']:
            _bad('%s 缺少 licence_spdx' % sid)
        files = src.get('files')
        if not isinstance(files, list) or not files:
            _bad('%s 沒有檔案' % sid)
        for f in files:
            _check_path(sid, f.get('path'))
            if not isinstance(f.get('bytes'), int) or f['bytes'] <= 0:
                _bad('%s/%s 的 bytes 必須是正整數' % (sid, f.get('path')))
            if not _HEX64.match(str(f.get('sha256', ''))):
                _bad('%s/%s 的 sha256 必須是 64 位小寫十六進位' % (sid, f.get('path')))
        ev = src.get('licence_evidence')
        if ev is not None:
            if (not isinstance(ev, dict) or not ev.get('contains')
                    or ev.get('file') not in [f['path'] for f in files]):
                _bad('%s 的 licence_evidence 必須指向它自己的檔案並有 contains' % sid)
        ex = src.get('extract')
        if ex is not None:
            for key in ('file', 'begin', 'end', 'strip_regex', 'bytes', 'sha256'):
                if key not in ex:
                    _bad('%s 的 extract 缺少 %s' % (sid, key))
            if ex['file'] not in [f['path'] for f in files]:
                _bad('%s 的 extract.file 不在它的檔案清單裡' % sid)
    return lock


def get_source(lock, sid):
    for src in lock['sources']:
        if src['id'] == sid:
            return src
    raise LexError('來源鎖裡沒有這個來源：' + sid)


def raw_url(source, path):
    """raw.githubusercontent.com 網址 = 擁有者/專案 + 固定 commit + 百分比編碼的路徑。"""
    m = _REPO_URL.match(source['repo'])
    return 'https://raw.githubusercontent.com/%s/%s/%s/%s' % (
        m.group(1), m.group(2), source['commit'], urllib.parse.quote(path))


def cache_path(source, path, base=None):
    return (base or cache_dir()) / source['id'] / source['commit'] / path


def _file_ok(path, expected_bytes, expected_sha):
    """快取檔存在且位元組數、sha256 都對才算數。"""
    try:
        if path.stat().st_size != expected_bytes:
            return False
        h = hashlib.sha256()
        with open(path, 'rb') as fh:
            for block in iter(lambda: fh.read(_BLOCK), b''):
                h.update(block)
        return h.hexdigest() == expected_sha
    except OSError:
        return False


def fetch_file(source, f, base=None, log=None):
    """取得一個釘選的檔案並回傳快取路徑。快取已完整時完全不連網。"""
    base = base or cache_dir()
    dest = cache_path(source, f['path'], base)
    if _file_ok(dest, f['bytes'], f['sha256']):
        return dest
    url = raw_url(source, f['path'])
    if log:
        log('下載 %s/%s（%d 位元組）' % (source['id'], f['path'], f['bytes']))
    dest.parent.mkdir(parents=True, exist_ok=True)
    tmp = dest.with_name(dest.name + '.part%d' % os.getpid())
    h = hashlib.sha256()
    total = 0
    try:
        try:
            with urlopen(Request(url, headers={'User-Agent': 'lucky-hawaii-lexicon'}), timeout=60) as resp:
                with open(tmp, 'wb') as out:
                    while True:
                        block = resp.read(_BLOCK)
                        if not block:
                            break
                        total += len(block)
                        # 超過鎖裡的位元組數就中止，避免被灌爆（T-06-04）
                        if total > f['bytes']:
                            raise LexError('下載超過預期大小（%s/%s）：預期 %d 位元組，已超過' % (
                                source['id'], f['path'], f['bytes']))
                        h.update(block)
                        out.write(block)
        except LexError:
            raise
        except OSError as exc:
            raise LexError('下載失敗（%s/%s）：%s' % (source['id'], f['path'], exc))
        if total != f['bytes'] or h.hexdigest() != f['sha256']:
            raise LexError(
                '下載內容與來源鎖不符（%s/%s）：預期 %d 位元組 sha256 %s，實際 %d 位元組 sha256 %s' % (
                    source['id'], f['path'], f['bytes'], f['sha256'], total, h.hexdigest()))
        os.replace(tmp, dest)
    finally:
        if tmp.exists():
            tmp.unlink()
    return dest


def check_evidence(source, base=None):
    """授權證據：鎖裡指定的檔案必須（仍然）含有那一行（A3）。"""
    ev = source.get('licence_evidence')
    if not ev:
        return
    path = cache_path(source, ev['file'], base)
    try:
        text = path.read_text(encoding='utf-8')
    except OSError:
        raise LexError('找不到下載快取，請先執行 fetch（%s/%s）' % (source['id'], ev['file']))
    if ev['contains'] not in text:
        raise LexError('授權證據不符：%s 的 %s 找不到「%s」，來源的授權可能已改變，停止' % (
            source['id'], ev['file'], ev['contains']))


def build_extract(source, base=None):
    """從大檔案裡取出一段授權全文（例如 Node.js LICENSE 裡的 libtabe 區塊），回傳路徑。"""
    ex = source['extract']
    base = base or cache_dir()
    src_path = cache_path(source, ex['file'], base)
    try:
        lines = src_path.read_text(encoding='utf-8').splitlines()
    except OSError:
        raise LexError('找不到下載快取，請先執行 fetch（%s/%s）' % (source['id'], ex['file']))
    begin = next((i for i, ln in enumerate(lines) if ex['begin'] in ln), None)
    if begin is None:
        raise LexError('%s：找不到擷取起點「%s」' % (source['id'], ex['begin']))
    end = next((i for i in range(begin + 1, len(lines)) if ex['end'] in lines[i]), None)
    if end is None:
        raise LexError('%s：找不到擷取終點「%s」' % (source['id'], ex['end']))
    strip = re.compile(ex['strip_regex'])
    body = [strip.sub('', ln, count=1) for ln in lines[begin + 1:end]]
    while body and not body[0].strip():
        body.pop(0)
    while body and not body[-1].strip():
        body.pop()
    data = ('\n'.join(body) + '\n').encode('utf-8')
    if len(data) != ex['bytes'] or hashlib.sha256(data).hexdigest() != ex['sha256']:
        raise LexError('%s：擷取出的授權全文與來源鎖不符（預期 %d 位元組 sha256 %s，實際 %d 位元組 sha256 %s）' % (
            source['id'], ex['bytes'], ex['sha256'], len(data), hashlib.sha256(data).hexdigest()))
    dest = cache_path(source, 'extract.txt', base)
    tmp = dest.with_name(dest.name + '.part%d' % os.getpid())
    try:
        tmp.write_bytes(data)
        os.replace(tmp, dest)
    finally:
        if tmp.exists():
            tmp.unlink()
    return dest


def fetch_all(lock, base=None, log=None):
    """下載（或確認快取）鎖裡每個檔案，再檢查授權證據並產生擷取的授權全文。"""
    base = base or cache_dir()
    for source in lock['sources']:
        for f in source['files']:
            fetch_file(source, f, base, log)
        check_evidence(source, base)
        if source.get('extract'):
            build_extract(source, base)


def cached_files(source, base=None):
    """只讀快取（不連網）：回傳 {路徑: 快取檔路徑}；缺或不符就叫使用者先 fetch。"""
    base = base or cache_dir()
    out = {}
    for f in source['files']:
        p = cache_path(source, f['path'], base)
        if not _file_ok(p, f['bytes'], f['sha256']):
            raise LexError('找不到下載快取，請先執行 fetch（%s/%s）' % (source['id'], f['path']))
        out[f['path']] = p
    return out


def licence_text_path(source, spec, base=None):
    """授權全文的快取路徑：spec 是 packs.json licence_texts 的一項（file 或 extract）。"""
    base = base or cache_dir()
    if spec.get('extract'):
        p = cache_path(source, 'extract.txt', base)
        ex = source['extract']
        if not _file_ok(p, ex['bytes'], ex['sha256']):
            p = build_extract(source, base)
        return p
    files = cached_files(source, base)
    if spec['file'] not in files:
        raise LexError('%s 沒有檔案 %s' % (source['id'], spec['file']))
    return files[spec['file']]


def _spdx_tokens(expr):
    return [t.strip() for t in expr.split(' AND ') if t.strip()]


def assert_pack_sources(pack_cfg, lock):
    """授權閘門（A1）：不符合就丟 LexError，不會產生任何詞庫包。"""
    pid = pack_cfg['id']
    own = set(pack_cfg.get('sources', []))
    if not own:
        raise LexError('詞庫包 %s 沒有指定來源' % pid)
    for sid in own:
        src = get_source(lock, sid)
        if src['role'] != 'pack':
            raise LexError('詞庫包 %s 的來源 %s 不是 pack 角色（只能當比對規則用）' % (pid, sid))
        if src['redistribute'] is not True:
            raise LexError('詞庫包 %s 的來源 %s 不可重新散布（redistribute:false），停止' % (pid, sid))
        for tok in _spdx_tokens(src['licence_spdx']):
            if tok not in SPDX_ALLOW:
                raise LexError('詞庫包 %s 的來源 %s 授權 %s 不在允許清單內，停止' % (pid, sid, tok))
    tokens = _spdx_tokens(pack_cfg.get('licence_spdx', ''))
    if not tokens:
        raise LexError('詞庫包 %s 沒有標示授權（licence_spdx）' % pid)
    for tok in tokens:
        if tok not in SPDX_ALLOW:
            raise LexError('詞庫包 %s 的授權 %s 不在允許清單內（%s），停止' % (
                pid, tok, '、'.join(sorted(SPDX_ALLOW))))
    for spec in pack_cfg.get('licence_texts', []):
        src = get_source(lock, spec['source'])
        if src['role'] == 'licence-text':
            if src['redistribute'] is not True:
                raise LexError('授權全文來源 %s 不可重新散布，停止' % src['id'])
        elif spec['source'] not in own:
            raise LexError('授權全文 %s 必須來自 licence-text 來源或此詞庫包自己的來源' % spec['source'])
