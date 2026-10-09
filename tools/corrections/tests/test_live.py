"""push → 等線上生效 → 只清這一批：假 Worker（可清空）＋假網站（慢半拍才換新資料）＋本機 bare 遠端。
一律只連 127.0.0.1 與暫存目錄，不碰真正的遠端、資料檔與金鑰。"""
import json
import subprocess
import threading
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from unittest import mock

import writeback
from tests.test_writeback import KEY, REAL_DATA, WritebackCase, entry, git, make_repo


class LayerWorker(object):
    """有狀態的假 Worker：admin.json 與 /corrections/clear（rev 對不上回 409）。
    clear_script 依序放要先回的狀態碼：409 會模擬別人剛改過（rev + 1），其他碼原樣回。"""

    def __init__(self, entries, rev=3):
        self.entries, self.rev, self.written = list(entries), rev, []
        self.requests, self.clear_script = [], []
        outer = self

        class H(BaseHTTPRequestHandler):
            def _send(self, code, doc):
                body = json.dumps(doc).encode('utf-8')
                self.send_response(code)
                self.send_header('Content-Type', 'application/json')
                self.send_header('Content-Length', str(len(body)))
                self.end_headers()
                self.wfile.write(body)

            def do_GET(self):
                outer.requests.append(('GET', self.path, None))
                if self.headers.get('X-Admin-Key') != KEY:
                    return self._send(403, {'ok': False})
                self._send(200, {'ok': True, 'version': 1, 'rev': outer.rev, 'entries': outer.entries,
                                 'written': outer.written, 'view': {}})

            def do_POST(self):
                body = json.loads(self.rfile.read(int(self.headers.get('Content-Length') or 0)).decode('utf-8'))
                outer.requests.append(('POST', self.path, body))
                if self.headers.get('X-Admin-Key') != KEY:
                    return self._send(403, {'ok': False})
                if outer.clear_script:
                    code = outer.clear_script.pop(0)
                    if code == 409:
                        outer.rev += 1
                    return self._send(code, {'ok': False, 'rev': outer.rev})
                if body['baseRev'] != outer.rev:
                    return self._send(409, {'ok': False, 'code': 'REV_MISMATCH', 'rev': outer.rev})
                found = [e['id'] for e in outer.entries if e['id'] in body['ids']]
                if found:
                    outer.entries = [e for e in outer.entries if e['id'] not in found]
                    outer.rev += 1
                self._send(200, {'ok': True, 'rev': outer.rev, 'cleared': found,
                                 'missing': [i for i in body['ids'] if i not in found]})

            def log_message(self, *a):
                pass

        self.server = ThreadingHTTPServer(('127.0.0.1', 0), H)
        self.url = 'http://127.0.0.1:%d' % self.server.server_address[1]
        threading.Thread(target=self.server.serve_forever, daemon=True).start()

    def add(self, e):
        self.entries.append(e)
        self.rev += 1

    def clears(self):
        return [b for m, p, b in self.requests if m == 'POST' and p == '/corrections/clear']

    def ids(self):
        return [e['id'] for e in self.entries]

    def close(self):
        self.server.shutdown()
        self.server.server_close()


class Site(object):
    """假 GitHub Pages：前 live_after 次輪詢給舊檔（原始資料），之後給 git 裡 ref 的最新檔。
    on_poll(n) 在每次輪詢（抓詞庫檔那一刻）被呼叫，用來在輪詢中途做事。"""

    def __init__(self, gitdir, ref, live_after=0):
        self.gitdir, self.ref, self.live_after = str(gitdir), ref, live_after
        self.count, self.on_poll = 0, None
        outer = self

        class H(BaseHTTPRequestHandler):
            def do_GET(self):
                rel = self.path.split('?')[0].lstrip('/')
                if rel not in (writeback.WORD_FILE, writeback.RHYME_FILE):
                    return self.reply(404, b'')
                if rel == writeback.WORD_FILE:
                    outer.count += 1
                    if outer.on_poll:
                        outer.on_poll(outer.count)
                if outer.count <= outer.live_after:
                    return self.reply(200, (REAL_DATA / Path(rel).name).read_bytes())
                r = subprocess.run(['git', '-C', outer.gitdir, 'show', '%s:%s' % (outer.ref, rel)], capture_output=True)
                self.reply(200 if r.returncode == 0 else 404, r.stdout)

            def reply(self, code, body):
                self.send_response(code)
                self.send_header('Content-Length', str(len(body)))
                self.end_headers()
                self.wfile.write(body)

            def log_message(self, *a):
                pass

        self.server = ThreadingHTTPServer(('127.0.0.1', 0), H)
        self.url = 'http://127.0.0.1:%d/' % self.server.server_address[1]
        threading.Thread(target=self.server.serve_forever, daemon=True).start()

    def close(self):
        self.server.shutdown()
        self.server.server_close()


ONE = entry('c_one', 'wordlist', 'removed', '測試詞')
TWO = entry('c_two', 'wordlist', 'hidden', '隱藏詞')
LATE = entry('c_late', 'wordlist', 'removed', '後來詞')


class LiveCase(WritebackCase):
    def layer(self, entries, **kw):
        w = LayerWorker(entries, **kw)
        self.addCleanup(w.close)
        return w

    def site(self, gitdir, ref, live_after=0):
        s = Site(gitdir, ref, live_after)
        self.addCleanup(s.close)
        return s

    def remote(self, repo, push=True, branch='main'):
        bare = Path(self.tmp) / 'bare.git'
        git(self.tmp, 'init', '--bare', '-b', 'main', str(bare))
        git(repo, 'remote', 'add', 'origin', str(bare))
        if push:
            git(repo, 'push', 'origin', branch)
        return bare

    def go(self, repo, w, site, *extra):
        # 預設值夠快；後面的旗標會蓋掉前面的
        return self.run_main(['--worker', w.url, '--site', site.url, '--repo', str(repo),
                              '--poll-interval', '0.02', '--timeout', '5'] + list(extra))

    def files(self, repo):
        return [self.read(repo, n) for n in ('wordlist-overrides.json', 'rhyme-dict-overrides.json', 'applied-changes.log')]

    def commits_since_init(self, repo):
        return int(git(repo, 'rev-list', '--count', 'HEAD').strip()) - 1


class PushPollClear(LiveCase):
    def test_push_waits_for_the_site_then_clears_only_the_batch(self):
        repo = make_repo(self.tmp)
        bare = self.remote(repo)
        w = self.layer([ONE, TWO])
        site = self.site(bare, 'main', live_after=2)
        site.on_poll = lambda n: w.add(LATE) if n == 1 else None      # 輪詢中途後台又套用了一筆
        code, out, err = self.go(repo, w, site, '--apply', '--push')
        self.assertEqual(code, 0, err)
        self.assertEqual(git(bare, 'rev-parse', 'main').strip(), self.head(repo))
        self.assertGreaterEqual(site.count, 3)                          # 前兩次還是舊資料，第三次才清
        clears = w.clears()
        self.assertEqual(len(clears), 1)
        self.assertEqual(clears[0]['ids'], ['c_one', 'c_two'])
        self.assertEqual(clears[0]['baseRev'], 4)                       # 等完之後重抓的最新 rev
        self.assertEqual(w.ids(), ['c_late'])
        self.assertIn('已清空這批 2 筆；寫回期間新套用的 1 筆仍留在修正層', out)
        self.assertNotIn(KEY, out + err)

    def test_timeout_exits_4_keeps_the_push_and_clears_nothing(self):
        repo = make_repo(self.tmp)
        bare = self.remote(repo)
        w = self.layer([ONE])
        site = self.site(bare, 'main', live_after=10 ** 9)
        code, out, err = self.go(repo, w, site, '--apply', '--push', '--timeout', '0.3', '--poll-interval', '0.05')
        self.assertEqual(code, 4)
        self.assertIn('不是壞掉，CDN 還沒更新，過幾分鐘用 --confirm-only 重跑', err)
        self.assertEqual(w.clears(), [])
        self.assertEqual(w.ids(), ['c_one'])
        self.assertEqual(git(bare, 'rev-parse', 'main').strip(), self.head(repo))

    def test_clear_409_is_retried_once_with_the_new_rev_and_same_ids(self):
        repo = make_repo(self.tmp)
        bare = self.remote(repo)
        w = self.layer([ONE, TWO])
        w.clear_script = [409]
        code, out, err = self.go(repo, w, self.site(bare, 'main'), '--apply', '--push')
        self.assertEqual(code, 0, err)
        first, second = w.clears()
        self.assertEqual(first['ids'], second['ids'])
        self.assertEqual((first['baseRev'], second['baseRev']), (3, 4))
        self.assertEqual(w.ids(), [])

    def test_clear_failing_twice_exits_5_and_leaves_the_layer_alone(self):
        repo = make_repo(self.tmp)
        bare = self.remote(repo)
        w = self.layer([ONE, TWO])
        w.clear_script = [409, 500]
        code, out, err = self.go(repo, w, self.site(bare, 'main'), '--apply', '--push')
        self.assertEqual(code, 5)
        self.assertEqual(len(w.clears()), 2)
        self.assertEqual(w.ids(), ['c_one', 'c_two'])
        self.assertNotIn(KEY, out + err)

    def test_large_batch_is_cleared_in_chunks_with_the_rev_from_each_answer(self):
        repo = make_repo(self.tmp)
        bare = self.remote(repo)
        w = self.layer([entry('c_%d' % i, 'wordlist', 'removed', '詞%s' % '甲乙丙'[i]) for i in range(3)])
        with mock.patch.object(writeback, 'CLEAR_CHUNK', 2), mock.patch.object(writeback, 'CLEAR_PAUSE', 0):
            code, out, err = self.go(repo, w, self.site(bare, 'main'), '--apply', '--push')
        self.assertEqual(code, 0, err)
        first, second = w.clears()
        self.assertEqual((len(first['ids']), len(second['ids'])), (2, 1))
        self.assertEqual(second['baseRev'], first['baseRev'] + 1)
        self.assertEqual(w.ids(), [])

    def test_other_branch_with_push_neither_pushes_nor_clears(self):
        repo = make_repo(self.tmp)
        git(repo, 'checkout', '-b', 'gsd/test')
        bare = self.remote(repo, push=False)
        w = self.layer([ONE])
        code, out, err = self.go(repo, w, self.site(bare, 'main'), '--apply', '--push')
        self.assertEqual(code, 0, err)
        self.assertIn('目前不在 main：已寫檔並 commit，不 push、不清空', out)
        self.assertEqual(git(bare, 'for-each-ref').strip(), '')
        self.assertEqual(w.clears(), [])

    def test_live_branch_only_without_push_flag_never_pushes(self):
        repo = make_repo(self.tmp)
        bare = self.remote(repo, push=False)
        w = self.layer([ONE])
        code, out, err = self.go(repo, w, self.site(bare, 'main'), '--apply')
        self.assertEqual(code, 0, err)
        self.assertIn('已 commit；要推上線請加 --push', out)
        self.assertEqual(git(bare, 'for-each-ref').strip(), '')
        self.assertEqual(w.clears(), [])

    def test_push_failure_exits_3_and_clears_nothing(self):
        repo = make_repo(self.tmp)
        git(repo, 'remote', 'add', 'origin', str(Path(self.tmp) / 'not-there.git'))
        w = self.layer([ONE])
        code, out, err = self.go(repo, w, self.site(repo, 'main'), '--apply', '--push')
        self.assertEqual(code, 3)
        self.assertIn('git push 失敗', err)
        self.assertEqual(w.clears(), [])


if __name__ == '__main__':
    unittest.main()
