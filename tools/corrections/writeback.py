#!/usr/bin/env python3
"""把 Worker 上的線上修正層寫回 data/ 的兩個修正檔（好韻器 Phase 7，FB-05）。

只用 Python 標準函式庫（3.9 以上）。金鑰只從環境變數 LH_ADMIN_KEY 讀，
不印出、不寫檔、不放進網址。

用法：
  python3 -B tools/corrections/writeback.py                 預覽（預設）：只列出會改什麼，不寫任何東西
  python3 -B tools/corrections/writeback.py --apply         寫 data/wordlist-overrides.json、
                                                            data/rhyme-dict-overrides.json、
                                                            data/applied-changes.log，並只 commit 這三個檔
  python3 -B tools/corrections/writeback.py --apply --push  在 main 上寫檔、commit、push，等線上網站真的換成新資料，
                                                            才清空「這一批」修正層（等最久 --timeout 秒，預設 1200 即 20 分鐘，
                                                            每 --poll-interval 秒看一次，預設 30）
  python3 -B tools/corrections/writeback.py --confirm-only  不寫檔、不 commit、不 push（任何分支都可以）：只確認線上已生效並清空
                                                            日誌裡已記過 id 的那幾筆（合併到 main 之後，或逾時之後用這個）

退出碼：0 成功或沒事可做 · 2 讀不到修正層或沒有金鑰 · 3 資料不合格（修正層的資料、或 data/ 兩個修正檔缺少／壞掉）或 git／寫檔失敗
        · 4 線上確認逾時 · 5 清空失敗 · 6 寫回完成，但等待期間有幾筆在後台被撤回、而它們已經寫進資料檔並上線（要手動處理，訊息裡有清單）

不支援同時跑兩個：請一次只開一個寫回，避免兩邊同時改 data/ 與 git（腳本沒有鎖）。
重跑是安全的：已寫入的修正不會重複寫、不會重複記日誌、不會重複 commit；任何一步中斷都直接重跑
（或確認階段用 --confirm-only）。寫檔前會先把三個檔的新內容全部排好版、寫成暫存檔，再一次換上去（檔案不會寫到一半）；
資料檔缺少、壞掉或有格式不對的項目時，直接停下來、什麼都不寫，不會默默丟掉任何既有項目。清空只動「已寫進資料檔日誌」的那批 id，寫回期間新套用的修正會留在修正層。
"""
import argparse
import json
import os
import re
import subprocess
import sys
import time
import unicodedata
import http.client
import urllib.error
import urllib.request
from datetime import datetime
from pathlib import Path

WORKER_URL = 'https://lucky-hawaii.is3000dollar.workers.dev'
SITE_URL = 'https://andy-coin.github.io/Lucky-Hawaii/'
USER_AGENT = 'lucky-hawaii-writeback/1'
KEY_ENV = 'LH_ADMIN_KEY'

WORD_FILE = 'data/wordlist-overrides.json'
RHYME_FILE = 'data/rhyme-dict-overrides.json'
LOG_FILE = 'data/applied-changes.log'
TARGET_PATHS = (WORD_FILE, RHYME_FILE, LOG_FILE)
BUCKETS = ('removed', 'hidden', 'fixed', 'added')
CLEAR_CHUNK = 100       # Worker 一次最多收 100 個 id
CLEAR_PAUSE = 1.1       # KV 同一個 key 每秒只能寫一次：分批清空時批與批之間等一下
LIVE_TIMEOUT_MSG = ('等了 %g 秒，線上網站還沒換成新資料。不是壞掉，CDN 還沒更新，過幾分鐘用 --confirm-only 重跑；'
                    '修正層一筆都沒清')
NOT_LIVE_MSG = '目前不在 main：已寫檔並 commit，不 push、不清空。合併到 main 後用 --confirm-only 完成確認與清空'


class Stop(Exception):
    """任何一步失敗就停在那一步：code 是退出碼，msg 是給 Andy 看的白話說明。"""

    def __init__(self, code, msg):
        Exception.__init__(self, msg)
        self.code = code
        self.msg = msg


# ==================== 讀修正層 ====================

def fetch_layer(worker, key):
    """GET /corrections/admin.json。金鑰只放在標頭；錯誤訊息一律不含金鑰。"""
    req = urllib.request.Request(
        worker.rstrip('/') + '/corrections/admin.json',
        headers={'X-Admin-Key': key, 'User-Agent': USER_AGENT, 'Accept': 'application/json'})
    try:
        with urllib.request.urlopen(req, timeout=15) as res:
            doc = json.loads(res.read().decode('utf-8'))
    except urllib.error.HTTPError as e:
        if e.code == 403:
            raise Stop(2, '金鑰不對：LH_ADMIN_KEY 被 Worker 拒絕')
        raise Stop(2, '讀取修正層失敗：伺服器回應 %d' % e.code)
    except (urllib.error.URLError, OSError, ValueError) as e:
        raise Stop(2, '連不上修正層（%s）' % type(e).__name__)
    if not isinstance(doc, dict) or not isinstance(doc.get('entries'), list):
        raise Stop(2, '修正層回應的格式不對')
    return doc


# ==================== 檔案讀寫與排版（和舊匯出腳本逐字相同）====================

def load_overrides(path):
    try:
        with open(str(path), encoding='utf-8') as f:
            doc = json.load(f)
    except FileNotFoundError:
        raise Stop(3, '找不到資料檔 %s，已停止、什麼都沒寫' % Path(str(path)).name)
    except (OSError, ValueError) as e:
        raise Stop(3, '資料檔 %s 讀不了或不是正確的 JSON（%s），已停止、什麼都沒寫' % (Path(str(path)).name, type(e).__name__))
    if not isinstance(doc, dict) or 'version' not in doc:
        raise Stop(3, '資料檔 %s 的格式不對（缺少 version），已停止、什麼都沒寫' % Path(str(path)).name)
    return doc


def check_base(doc, name, is_rhyme):
    """既有的修正檔每個項目都要認得出身分（詞、或字＋讀音）；認不得的不能默默被重排掉，直接停下來。"""
    def bad(why):
        raise Stop(3, '資料檔 %s 的格式不對（%s），已停止、什麼都沒寫；請先手動修好這個檔' % (name, why))
    for b in BUCKETS:
        v = doc.get(b)
        if v is None:
            continue
        if not is_rhyme and b == 'fixed':
            if not isinstance(v, dict) or not all(isinstance(k, str) and isinstance(x, str) for k, x in v.items()):
                bad('fixed 要是 詞 → 注音 的對照')
            continue
        if not isinstance(v, list):
            bad('%s 要是清單' % b)
        for i, it in enumerate(v):
            if not is_rhyme and b in ('removed', 'hidden'):
                ok = isinstance(it, str)
            elif not is_rhyme:
                ok = isinstance(it, dict) and isinstance(it.get('w'), str)
            elif b == 'fixed':
                ok = isinstance(it, dict) and isinstance(it.get('char'), str) and isinstance(it.get('from'), str)
            else:
                ok = isinstance(it, dict) and isinstance(it.get('char'), str) and isinstance(it.get('dict_key'), str)
            if not ok:
                bad('%s 第 %d 項認不出是哪個詞或字' % (b, i + 1))


def _q(s):
    return json.dumps(s, ensure_ascii=False)


def _fmt_str_array(arr, per_line=10, indent='    '):
    if not arr:
        return '[]'
    items = [_q(x) for x in arr]
    if len(items) <= per_line:
        return '[' + ', '.join(items) + ']'
    chunks = [', '.join(items[i:i + per_line]) for i in range(0, len(items), per_line)]
    return '[\n' + indent + (',\n' + indent).join(chunks) + '\n  ]'


def _fmt_obj_array(arr, indent='    '):
    if not arr:
        return '[]'
    lines = [json.dumps(x, ensure_ascii=False) for x in arr]
    return '[\n' + indent + (',\n' + indent).join(lines) + '\n  ]'


def _fmt_str_dict(d, indent='    '):
    if not d:
        return '{}'
    lines = ['%s: %s' % (_q(k), _q(v)) for k, v in d.items()]
    return '{\n' + indent + (',\n' + indent).join(lines) + '\n  }'


def format_word(doc):
    return (
        '{\n'
        '  "version": %s,\n\n' % doc['version'] +
        '  "removed": %s,\n\n' % _fmt_str_array(doc['removed']) +
        '  "hidden": %s,\n\n' % _fmt_str_array(doc['hidden']) +
        '  "fixed": %s,\n\n' % _fmt_str_dict(doc['fixed']) +
        '  "added": %s,\n\n' % _fmt_obj_array(doc['added']) +
        '  "updated_at": %s\n' % _q(doc['updated_at']) +
        '}\n'
    )


def format_rhyme(doc):
    return (
        '{\n'
        '  "version": %s,\n\n' % doc['version'] +
        '  "removed": %s,\n\n' % _fmt_obj_array(doc['removed']) +
        '  "hidden": %s,\n\n' % _fmt_obj_array(doc['hidden']) +
        '  "fixed": %s,\n\n' % _fmt_obj_array(doc['fixed']) +
        '  "added": %s,\n\n' % _fmt_obj_array(doc['added']) +
        '  "updated_at": %s\n' % _q(doc['updated_at']) +
        '}\n'
    )


# ==================== 驗證（和 Worker 的 validateEntryValue 同一套規則）====================
_WORD_RE = re.compile(r'[^\s<>"\'`\\&\ufeff]+')
_SYLLABLE_RE = re.compile(r'[ㄅ-ㄩ]+[ˊˇˋ˙]?')
_DICT_KEY_RE = re.compile(r'[ㄅ-ㄩ]+[1-5]')
_ENTRY_ID_RE = re.compile(r'c_[\w-]{1,64}')
_TIERS = ('common', 'normal', 'rare')
_SOURCES = ('manual', 'ai_accept', 'ai_modify')
_TONE_DIGIT = {'ˊ': '2', 'ˇ': '3', 'ˋ': '4', '˙': '5'}


def _len(s):
    return len(s) if isinstance(s, str) else 0


def _is_word(w):
    # 1–20 字、不含空白／引號／角括號／反斜線／&／控制字元（fullmatch：結尾換行不能溜過去）
    return (isinstance(w, str) and 1 <= len(w) <= 20 and _WORD_RE.fullmatch(w) is not None
            and not any(unicodedata.category(ch) == 'Cc' for ch in w))


def _is_char(c):
    return isinstance(c, str) and len(c) == 1 and _is_word(c)


def _is_z(z, n):
    if not isinstance(z, str):
        return False
    parts = z.split(' ')
    return len(parts) == n and all(_SYLLABLE_RE.fullmatch(p) for p in parts)


def _is_reading(r):
    return isinstance(r, str) and _SYLLABLE_RE.fullmatch(r) is not None


def _is_dict_key(k):
    return isinstance(k, str) and _DICT_KEY_RE.fullmatch(k) is not None


def _reading_to_dict_key(r):
    return r[:-1] + _TONE_DIGIT[r[-1]] if r[-1] in _TONE_DIGIT else r + '1'


def _key_matches(reading, key):
    return _is_reading(reading) and _is_dict_key(key) and _reading_to_dict_key(reading) == key


def validate_entry(target, bucket, v):
    if bucket not in BUCKETS or not v:
        return False
    if target == 'wordlist':
        if bucket in ('removed', 'hidden'):
            return _is_word(v)
        if not isinstance(v, dict):
            return False
        if bucket == 'fixed':
            return _is_word(v.get('w')) and _is_z(v.get('z'), _len(v.get('w')))
        # added：只有手動新增可以沒有注音；AI 收錄的一定要有
        z = v.get('z')
        z_ok = v.get('source') == 'manual' if z == '' else _is_z(z, _len(v.get('w')))
        return (_is_word(v.get('w')) and z_ok and v.get('tier') in _TIERS and v.get('source') in _SOURCES
                and ('original' not in v or _is_word(v['original'])))
    if target == 'rhymeDict':
        if not isinstance(v, dict) or not _is_char(v.get('char')):
            return False
        if bucket in ('removed', 'hidden'):
            return _is_dict_key(v.get('dict_key')) and ('reading' not in v or _key_matches(v['reading'], v['dict_key']))
        if bucket == 'fixed':
            return (_is_dict_key(v.get('from')) and _is_dict_key(v.get('to'))
                    and ('tier' not in v or v['tier'] in _TIERS))
        return _key_matches(v.get('reading'), v.get('dict_key')) and v.get('tier') in _TIERS
    return False


def check_entries(entries):
    """線上修正層的每一筆都要通過驗證；任何一筆不合格就整批停下（D4）。"""
    bad = []
    for e in entries:
        ok = (isinstance(e, dict) and isinstance(e.get('id'), str) and _ENTRY_ID_RE.fullmatch(e['id'])
              and validate_entry(e.get('target'), e.get('bucket'), e.get('value')))
        if not ok:
            bad.append(e.get('id') if isinstance(e, dict) and isinstance(e.get('id'), str) else '(沒有 id)')
    if bad:
        raise Stop(3, '修正層有 %d 筆資料不合格，已停止、什麼都沒寫：%s' % (len(bad), '、'.join(bad[:10])))


# ==================== 合併（契約：worker/src/corrections.js 的 replayEntries）====================
# 規則寫在 replayEntries 上方的註解；tests/fixtures/corrections-vectors.json 是兩邊共用的驗收。
# 集合語意：同一份有序 entries 重播多次結果相同。用 dict 當有序集合：
# 更新已存在的對象不動位置；先刪再放會移到最後，這和 JS Map 的行為一致。

def _rk(v):
    return '%s|%s' % (v.get('char'), v.get('dict_key'))


def _by(items, key_of):
    m = {}
    for it in items or []:
        k = key_of(it)
        if k is not None:
            m[k] = it
    return m


def replay(base, entries):
    """依序重播 entries，回傳 {'wordlist': {...}, 'rhymeDict': {...}}；不動 base。"""
    wl = (base or {}).get('wordlist') or {}
    rd = (base or {}).get('rhymeDict') or {}
    b = {
        'wRemoved': _by(wl.get('removed'), lambda x: x),
        'wHidden': _by(wl.get('hidden'), lambda x: x),
        'wFixed': dict(wl.get('fixed') or {}),
        'wAdded': _by(wl.get('added'), lambda x: x.get('w') if isinstance(x, dict) else None),
        'rRemoved': _by(rd.get('removed'), lambda x: _rk(x) if isinstance(x, dict) else None),
        'rHidden': _by(rd.get('hidden'), lambda x: _rk(x) if isinstance(x, dict) else None),
        'rFixed': _by(rd.get('fixed'), lambda x: '%s|%s' % (x.get('char'), x.get('from')) if isinstance(x, dict) else None),
        'rAdded': _by(rd.get('added'), lambda x: _rk(x) if isinstance(x, dict) else None),
    }
    c = dict((k, dict(m)) for k, m in b.items())
    for e in entries:
        v = e['value']
        target, bucket = e['target'], e['bucket']
        if target == 'wordlist':
            if bucket in ('removed', 'hidden'):
                c['wRemoved' if bucket == 'removed' else 'wHidden'][v] = v
                c['wHidden' if bucket == 'removed' else 'wRemoved'].pop(v, None)
                c['wFixed'].pop(v, None)
                c['wAdded'].pop(v, None)
            elif bucket == 'fixed':
                c['wFixed'][v['w']] = v['z']
                c['wRemoved'].pop(v['w'], None)
                c['wHidden'].pop(v['w'], None)
                if v['w'] in c['wAdded']:
                    c['wAdded'][v['w']] = dict(c['wAdded'][v['w']], z=v['z'])
            elif bucket == 'added':
                c['wAdded'][v['w']] = v
                c['wRemoved'].pop(v['w'], None)
                c['wHidden'].pop(v['w'], None)
                # 手動新增沒填注音（z 為空）時，不去蓋掉既有的修正注音
                if v['w'] in c['wFixed'] and v.get('z'):
                    c['wFixed'][v['w']] = v['z']
        elif target == 'rhymeDict':
            if bucket in ('removed', 'hidden'):
                mine = c['rRemoved' if bucket == 'removed' else 'rHidden']
                other = c['rHidden' if bucket == 'removed' else 'rRemoved']
                mine[_rk(v)] = v
                other.pop(_rk(v), None)
                c['rAdded'].pop(_rk(v), None)
                for k, f in list(c['rFixed'].items()):
                    if f.get('char') != v['char'] or f.get('to') != v['dict_key']:
                        continue
                    del c['rFixed'][k]
                    frm = f.get('from')
                    if frm and (v['char'] + '|' + frm) not in mine:
                        mine[v['char'] + '|' + frm] = {'char': v['char'], 'dict_key': frm}
            elif bucket == 'fixed':
                c['rFixed'][v['char'] + '|' + v['from']] = v
                # (字, to) 與 (字, from) 都讓位：修正重新生效時，連帶產生的 from 移除要拿掉，重播才會冪等
                for k in (v['char'] + '|' + v['to'], v['char'] + '|' + v['from']):
                    c['rRemoved'].pop(k, None)
                    c['rHidden'].pop(k, None)
            elif bucket == 'added':
                c['rAdded'][_rk(v)] = v
                c['rRemoved'].pop(_rk(v), None)
                c['rHidden'].pop(_rk(v), None)

    def keys(name):
        # base 的對象照 base 順序，其餘照最後放入的順序
        return [k for k in b[name] if k in c[name]] + [k for k in c[name] if k not in b[name]]

    def lst(name):
        return [c[name][k] for k in keys(name)]

    return {
        'wordlist': {
            'removed': keys('wRemoved'), 'hidden': keys('wHidden'),
            'fixed': dict((k, c['wFixed'][k]) for k in keys('wFixed')), 'added': lst('wAdded'),
        },
        'rhymeDict': {
            'removed': lst('rRemoved'), 'hidden': lst('rHidden'),
            'fixed': lst('rFixed'), 'added': lst('rAdded'),
        },
    }


def merge(word_doc, rhyme_doc, entries):
    """把 entries 合併進兩個修正檔的內容，回傳 (新詞庫檔, 新讀音檔)；version、updated_at 等其他欄位原樣保留。"""
    out = replay({'wordlist': word_doc, 'rhymeDict': rhyme_doc}, entries)
    new_word, new_rhyme = dict(word_doc), dict(rhyme_doc)
    new_word.update(out['wordlist'])
    new_rhyme.update(out['rhymeDict'])
    return new_word, new_rhyme


# ==================== 差異、日誌、寫檔 ====================

def _content(doc):
    return dict((k, v) for k, v in doc.items() if k != 'updated_at')


def _ident_map(bucket_name, items, is_rhyme):
    """項目 -> (識別字串, 內容字串)，用來比對新增／移除／改動。"""
    out = {}
    if isinstance(items, dict):
        for k, v in items.items():
            out[k] = json.dumps(v, ensure_ascii=False)
        return out
    for it in items or []:
        if isinstance(it, str):
            out[it] = it
        elif bucket_name == 'fixed' and is_rhyme:
            out['%s|%s' % (it.get('char'), it.get('from'))] = json.dumps(it, ensure_ascii=False, sort_keys=True)
        elif is_rhyme:
            out[_rk(it)] = json.dumps(it, ensure_ascii=False, sort_keys=True)
        else:
            out[str(it.get('w'))] = json.dumps(it, ensure_ascii=False, sort_keys=True)
    return out


def diff_lines(old, new, label, is_rhyme):
    """一個檔案的差異，一行一個欄位，例如「詞庫 removed +1：測試詞」。"""
    lines = []
    for bucket in BUCKETS:
        o = _ident_map(bucket, old.get(bucket), is_rhyme)
        n = _ident_map(bucket, new.get(bucket), is_rhyme)
        raw = old.get(bucket)
        if isinstance(raw, list) and len(raw) > len(o):
            lines.append('%s %s 原本有 %d 個重複項目，寫回時會合併成一個' % (label, bucket, len(raw) - len(o)))
        added = [k for k in n if k not in o]
        gone = [k for k in o if k not in n]
        changed = [k for k in n if k in o and n[k] != o[k]]
        for sign, names in (('+', added), ('-', gone), ('~', changed)):
            if names:
                shown = '、'.join(names[:10]) + ('…' if len(names) > 10 else '')
                lines.append('%s %s %s%d：%s' % (label, bucket, sign, len(names), shown))
    return lines


def read_logged_ids(log_path):
    p = Path(str(log_path))
    if not p.exists():
        return set()
    return set(re.findall(r'"id": "(c_[\w-]+)"', p.read_text(encoding='utf-8')))


def _replace_all(items):
    """items = [(路徑, bytes)]：全部先寫成同一個資料夾的暫存檔，都成功才一個一個換上去。
    排版或寫暫存檔失敗時一個檔都不動；暫存檔不論成敗都會清掉。"""
    tmps = []
    try:
        for path, data in items:
            tmp = path.with_name(path.name + '.tmp-%d' % os.getpid())
            tmps.append((tmp, path))
            tmp.write_bytes(data)
        for tmp, path in tmps:
            os.replace(str(tmp), str(path))
    except OSError as e:
        raise Stop(3, '寫檔失敗（%s）；請先看 git status 確認資料檔狀態，再重跑' % type(e).__name__)
    finally:
        for tmp, _ in tmps:
            try:
                tmp.unlink()
            except OSError:
                pass


def apply_files(repo, old_word, old_rhyme, new_word, new_rhyme, entries, now=None):
    """只在內容（不含 updated_at）真的變了才寫檔；每個還沒記過的 entry id 在日誌補一行。回傳寫了哪些檔。
    三個檔的新內容全部先排好版，才一起換上去：中途出錯不會留下寫到一半的樹。"""
    repo = Path(str(repo))
    now = (now or datetime.now()).isoformat()
    out = []
    for rel, old, new, fmt in ((WORD_FILE, old_word, new_word, format_word),
                               (RHYME_FILE, old_rhyme, new_rhyme, format_rhyme)):
        if _content(old) != _content(new):
            new['updated_at'] = now
            try:
                out.append((repo / rel, rel, fmt(new).encode('utf-8')))
            except (KeyError, TypeError, ValueError) as e:
                raise Stop(3, '排版 %s 失敗（%s），已停止、什麼都沒寫' % (rel, type(e).__name__))
    log_path = repo / LOG_FILE
    logged = read_logged_ids(log_path)
    lines = []
    for e in entries:
        if e['id'] in logged:
            continue
        logged.add(e['id'])
        lines.append('%s | corrections:%s/%s | %s' % (now, e['target'], e['bucket'], json.dumps(e, ensure_ascii=False)))
    if lines:
        old_log = log_path.read_bytes() if log_path.exists() else b''
        prefix = b'\n' if old_log and not old_log.endswith(b'\n') else b''
        out.append((log_path, LOG_FILE, old_log + prefix + ('\n'.join(lines) + '\n').encode('utf-8')))
    _replace_all([(p, data) for p, _, data in out])
    return [rel for _, rel, _ in out]


# ==================== git（一律不經過 shell）====================

def git(repo, *args):
    env = dict(os.environ)
    env['GIT_TERMINAL_PROMPT'] = '0'
    return subprocess.run(['git'] + list(args), cwd=str(repo), capture_output=True, text=True,
                          encoding='utf-8', env=env)


def git_ok(repo, *args):
    r = git(repo, *args)
    if r.returncode != 0:
        raise Stop(3, 'git %s 失敗：%s' % (args[0], (r.stderr or r.stdout).strip()))
    return r.stdout


def commit_targets(repo, count, rev):
    """只 add／commit 這三個檔；其他有改動的檔案不碰。沒有東西可 commit 回傳 False。"""
    git_ok(repo, 'add', '--', *TARGET_PATHS)
    if not git_ok(repo, 'status', '--porcelain', '--', *TARGET_PATHS).strip():
        return False
    msg = '資料：寫回修正層 %d 筆（rev %s）' % (count, rev)
    r = git(repo, 'commit', '-m', msg, '--', *TARGET_PATHS)
    if r.returncode != 0:
        changed = git(repo, 'status', '--porcelain', '--', *TARGET_PATHS).stdout.strip()
        raise Stop(3, 'git commit 失敗：%s\n工作區裡這幾個檔的修改還在，沒有被丟掉：\n%s'
                   % ((r.stderr or r.stdout).strip(), changed))
    return True


# ==================== 推上線、等線上生效、清空這一批 ====================

def confirmed_batch(entries, logged_ids):
    """這一批 = 修正層裡「id 已記在 applied-changes.log」的項目（照修正層順序）。
    寫回期間或在別的分支才套用的修正沒有記過，所以不在這批、也不會被清掉。"""
    return [e for e in entries if e['id'] in logged_ids]


def git_push(repo, remote, branch):
    r = git(repo, 'push', remote, branch)
    if r.returncode != 0:
        raise Stop(3, 'git push 失敗，修正層沒有動：%s' % (r.stderr or r.stdout).strip())


def fetch_live(site):
    """抓網站上現在的兩個修正檔。?cb= 只是順手加的，GitHub Pages 的 CDN 會無視網址參數，不能靠它。"""
    cb = int(time.time())
    docs = []
    for rel in (WORD_FILE, RHYME_FILE):
        req = urllib.request.Request('%s/%s?cb=%d' % (site.rstrip('/'), rel, cb),
                                     headers={'User-Agent': USER_AGENT, 'Cache-Control': 'no-cache'})
        with urllib.request.urlopen(req, timeout=15) as res:
            docs.append(json.loads(res.read().decode('utf-8')))
    return docs[0], docs[1]


def wait_until_live(site, batch, timeout, interval, now=time.monotonic, sleep=time.sleep):
    """輪詢到 merge(線上, 這批) == 線上（不看 updated_at）為止；merge 是冪等的，所以不需要任何狀態。逾時回 False。"""
    deadline = now() + timeout
    n = 0
    while True:
        n += 1
        try:
            live_word, live_rhyme = fetch_live(site)
            if not (isinstance(live_word, dict) and isinstance(live_rhyme, dict)):
                raise ValueError('not a document')
            m_word, m_rhyme = merge(live_word, live_rhyme, batch)
            if _content(m_word) == _content(live_word) and _content(m_rhyme) == _content(live_rhyme):
                return True
            print('第 %d 次確認：線上還是舊資料' % n, flush=True)
        except (OSError, ValueError, http.client.HTTPException) as e:   # 讀不到一律當作還沒生效（URLError 也是 OSError）
            print('第 %d 次確認：讀不到線上資料（%s）' % (n, type(e).__name__), flush=True)
        if now() >= deadline:
            return False
        sleep(max(0, min(interval, deadline - now())))


def _post_clear(worker, key, ids, rev):
    req = urllib.request.Request(
        worker.rstrip('/') + '/corrections/clear', data=json.dumps({'ids': ids, 'baseRev': rev}).encode('utf-8'),
        method='POST', headers={'X-Admin-Key': key, 'User-Agent': USER_AGENT, 'Content-Type': 'application/json'})
    try:
        with urllib.request.urlopen(req, timeout=15) as res:
            return res.status, json.loads(res.read().decode('utf-8'))
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.loads(e.read().decode('utf-8'))
        except (OSError, ValueError):
            return e.code, {}
    except (OSError, ValueError, http.client.HTTPException) as e:
        raise Stop(5, '清空修正層失敗（%s）；資料已在線上、修正層沒有動，可以用 --confirm-only 重跑' % type(e).__name__)


def clear_ids(worker, key, ids, rev):
    """POST /corrections/clear，只清這些 id。409（rev 對不上）→ 重抓 rev、同樣的 id 再試一次；仍失敗 exit 5。
    ponytail: 超過 100 筆分批、批間固定等 1.1 秒（KV 每秒一次寫入）；量大了再改成依回應重試 503。"""
    cleared = []
    for i in range(0, len(ids), CLEAR_CHUNK):
        chunk = ids[i:i + CLEAR_CHUNK]
        if i:
            time.sleep(CLEAR_PAUSE)
        code, doc = _post_clear(worker, key, chunk, rev)
        if code == 409:
            try:
                rev = fetch_layer(worker, key)['rev']
            except Stop:
                raise Stop(5, '清空遇到 409，重抓修正層版本失敗；修正層沒有動，可以用 --confirm-only 重跑')
            code, doc = _post_clear(worker, key, chunk, rev)
        if code != 200 or not isinstance(doc, dict) or not doc.get('ok'):
            raise Stop(5, '清空修正層失敗：伺服器回應 %d；修正層沒有被這支腳本改動（已清的批次除外），可以用 --confirm-only 重跑' % code)
        cleared.extend(doc.get('cleared') or [])
        rev = doc.get('rev', rev)
    return cleared


def describe_entry(e):
    v = json.dumps(e.get('value'), ensure_ascii=False)
    return '%s  %s/%s  %s' % (e.get('id'), e.get('target'), e.get('bucket'), v if len(v) <= 80 else v[:77] + '…')


def revoked_warning(lost):
    return ('注意：寫回期間，下面 %d 筆修正在後台被撤回了，但它們已經寫進 data/ 並推上線，網站上仍然有效：\n  %s\n'
            '要讓網站也拿掉它們，請手動編輯 data/wordlist-overrides.json、data/rhyme-dict-overrides.json 拿掉這幾筆的效果，'
            'commit 後再推上去（或在後台重新核准、套用，再寫回一次）。其餘的批次已清空。'
            % (len(lost), '\n  '.join(describe_entry(e) for e in lost)))


def finish_live(args, key, batch):
    """等線上生效 → 只清這一批。呼叫前 batch 已通過 check_entries。
    清空前重新讀一次修正層：只送出「現在還在」的 id；等待期間被撤回的（已經寫進資料檔、也上線了）列出來並用結束代碼 6 提醒。"""
    ids = [e['id'] for e in batch]
    print('等線上網站換成新資料（最久 %g 秒，每 %g 秒看一次）…' % (args.timeout, args.poll_interval), flush=True)
    if not wait_until_live(args.site, batch, args.timeout, args.poll_interval):
        raise Stop(4, LIVE_TIMEOUT_MSG % args.timeout)
    layer = fetch_layer(args.worker, key)        # 等的期間 rev 和內容都可能變了：用最新的
    now_ids = set(e['id'] for e in layer['entries'])
    present = [i for i in ids if i in now_ids]
    left = [e for e in layer['entries'] if e['id'] not in set(ids)]
    cleared = clear_ids(args.worker, key, present, layer['rev']) if present else []
    gone = set(cleared)
    lost = [e for e in batch if e['id'] not in gone]   # 重新讀之前就被撤回的，加上讀完到清空之間被撤回的
    print('已清空這批 %d 筆；寫回期間新套用的 %d 筆仍留在修正層' % (len(cleared), len(left)))
    if lost:
        print(revoked_warning(lost), file=sys.stderr)
        return 6
    return 0


# ==================== 主流程 ====================

def build_parser():
    p = argparse.ArgumentParser(description='把線上修正層寫回 data/ 的修正檔（預設只預覽）')
    p.add_argument('--apply', action='store_true', help='寫檔並 commit（預設只預覽）')
    p.add_argument('--push', action='store_true', help='推上線（要和 --apply 一起用，只有在 --live-branch 上才會 push），確認線上生效後清空這一批')
    p.add_argument('--confirm-only', action='store_true', help='不寫檔不 commit 不 push，只確認線上已生效並清空已寫入的那批（任何分支都可以）')
    p.add_argument('--worker', default=WORKER_URL, help='Worker 網址')
    p.add_argument('--site', default=SITE_URL, help='網站網址（線上確認用）')
    p.add_argument('--repo', default=str(Path(__file__).resolve().parents[2]), help='專案根目錄')
    p.add_argument('--remote', default='origin', help='git remote 名稱')
    p.add_argument('--live-branch', default='main', help='線上網站來自哪個分支')
    p.add_argument('--timeout', type=float, default=1200, help='線上確認的逾時秒數（預設 1200，即 20 分鐘）')
    p.add_argument('--poll-interval', type=float, default=30, help='線上確認的輪詢間隔秒數（預設 30）')
    return p


def run(args):
    if args.push and not args.apply and not args.confirm_only:
        raise Stop(3, '--push 要和 --apply 一起用，什麼都沒做')
    key = os.environ.get(KEY_ENV, '')
    if not key:
        raise Stop(2, '請先設定環境變數 %s' % KEY_ENV)
    repo = Path(args.repo)
    layer = fetch_layer(args.worker, key)
    entries = layer['entries']
    if args.confirm_only:
        # 不碰資料檔、不 commit、不 push，任何分支都可以：只處理日誌裡已記過 id 的那幾筆
        batch = confirmed_batch(entries, read_logged_ids(repo / LOG_FILE))
        if not batch:
            print('沒有需要確認的修正')
            return 0
        check_entries(batch)
        return finish_live(args, key, batch)
    if not entries:
        print('修正層是空的，沒有要寫回的')
        return 0
    check_entries(entries)
    old_word = load_overrides(repo / WORD_FILE)
    old_rhyme = load_overrides(repo / RHYME_FILE)
    check_base(old_word, Path(WORD_FILE).name, False)
    check_base(old_rhyme, Path(RHYME_FILE).name, True)
    new_word, new_rhyme = merge(old_word, old_rhyme, entries)
    diff = (diff_lines(old_word, new_word, '詞庫', False) + diff_lines(old_rhyme, new_rhyme, '讀音', True))
    logged = read_logged_ids(repo / LOG_FILE)
    print('讀到修正層 rev %s，共 %d 筆' % (layer.get('rev'), len(entries)))
    for line in diff:
        print(line)
    already = not diff and all(e['id'] in logged for e in entries)
    if not args.apply:
        print('資料檔已包含這批修正（還沒清空修正層的話，推上線後用 --confirm-only）' if already
              else '（預覽）加 --apply 才會寫檔並 commit')
        return 0
    if git_ok(repo, 'status', '--porcelain', '--', *TARGET_PATHS).strip():
        raise Stop(3, 'data 檔有還沒 commit 的修改，請先處理（什麼都沒寫）。如果是上一次寫到一半被中斷，用 git checkout -- %s 還原後重跑' % ' '.join(TARGET_PATHS))
    apply_files(repo, old_word, old_rhyme, new_word, new_rhyme, entries)
    if commit_targets(repo, len(entries), layer.get('rev')):
        print('已寫入並 commit：%s' % '、'.join(TARGET_PATHS))
    else:
        print('資料檔已包含這批修正')
    branch = git_ok(repo, 'rev-parse', '--abbrev-ref', 'HEAD').strip()
    if branch != args.live_branch:
        print(NOT_LIVE_MSG.replace('main', args.live_branch))
        return 0
    if not args.push:
        print('已 commit；要推上線請加 --push（或自己 push 後用 --confirm-only）')
        return 0
    # 沒有新 commit 也要 push：上一次可能 commit 完就被中斷，commit 還沒出去
    git_push(repo, args.remote, args.live_branch)
    print('已 push %s %s' % (args.remote, args.live_branch))
    # 這一批 = 修正層裡已記在日誌的項目；寫回期間才套用的不在其中
    batch = confirmed_batch(entries, read_logged_ids(repo / LOG_FILE))
    if not batch:
        print('沒有需要確認的修正')
        return 0
    return finish_live(args, key, batch)


def main(argv=None):
    args = build_parser().parse_args(argv)
    try:
        return run(args)
    except Stop as e:
        key = os.environ.get(KEY_ENV, '')
        msg = e.msg.replace(key, '***') if key else e.msg
        print(msg, file=sys.stderr)
        return e.code
    except Exception as e:   # 沒預期到的錯誤也要留在文件寫的結束代碼裡，不丟 traceback（traceback 可能帶出金鑰）
        print('寫回時發生沒預期的錯誤（%s）。資料檔若有沒 commit 的修改，用 git checkout -- %s 還原後重跑'
              % (type(e).__name__, ' '.join(TARGET_PATHS)), file=sys.stderr)
        return 3


if __name__ == '__main__':
    sys.exit(main())
