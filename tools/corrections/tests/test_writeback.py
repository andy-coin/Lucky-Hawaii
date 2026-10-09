"""寫回腳本的流程測試：假 Worker（127.0.0.1）＋暫存 git repo，不碰真正的資料檔與遠端。"""
import contextlib
import io
import json
import os
import shutil
import subprocess
import tempfile
import threading
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from unittest import mock

import writeback

REAL_DATA = Path(__file__).resolve().parents[3] / 'data'
KEY = 'k-test-SECRET-12345'


class FakeWorker(object):
    """記錄收到的標頭；金鑰不對回 403。"""

    def __init__(self, entries, rev=3, status=None):
        self.entries, self.rev, self.status = entries, rev, status
        self.requests = []
        outer = self

        class H(BaseHTTPRequestHandler):
            def do_GET(self):
                outer.requests.append({'path': self.path, 'headers': dict(self.headers)})
                if outer.status:
                    body, code = b'{}', outer.status
                elif self.headers.get('X-Admin-Key') != KEY:
                    body, code = b'{"ok":false}', 403
                else:
                    body = json.dumps({'ok': True, 'version': 1, 'rev': outer.rev, 'entries': outer.entries,
                                       'written': [], 'view': {}}).encode('utf-8')
                    code = 200
                self.send_response(code)
                self.send_header('Content-Type', 'application/json')
                self.send_header('Content-Length', str(len(body)))
                self.end_headers()
                self.wfile.write(body)

            def log_message(self, *a):
                pass

        self.server = ThreadingHTTPServer(('127.0.0.1', 0), H)
        self.url = 'http://127.0.0.1:%d' % self.server.server_address[1]
        threading.Thread(target=self.server.serve_forever, daemon=True).start()

    def close(self):
        self.server.shutdown()
        self.server.server_close()


def entry(eid, target, bucket, value):
    return {'id': eid, 'target': target, 'bucket': bucket, 'value': value,
            'source_kvKeys': ['k_' + eid], 'applied_at': '2026-10-10T00:00:00.000Z'}


def git(repo, *args):
    r = subprocess.run(['git'] + list(args), cwd=str(repo), capture_output=True, text=True, encoding='utf-8')
    assert r.returncode == 0, r.stderr
    return r.stdout


def make_repo(tmp, branch='main'):
    repo = Path(tmp) / 'repo'
    (repo / 'data').mkdir(parents=True)
    for name in ('wordlist-overrides.json', 'rhyme-dict-overrides.json', 'applied-changes.log'):
        shutil.copy(str(REAL_DATA / name), str(repo / 'data' / name))
    git(repo, 'init', '-b', branch)
    git(repo, 'config', 'user.name', 't')
    git(repo, 'config', 'user.email', 't@t')
    git(repo, 'config', 'commit.gpgsign', 'false')
    git(repo, 'add', '.')
    git(repo, 'commit', '-m', 'init')
    return repo


class WritebackCase(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp(prefix='wb-test-')
        self.addCleanup(shutil.rmtree, self.tmp, True)
        self.workers = []
        # 不吃使用者全域的 git 設定（hook、簽章）與系統 proxy
        patcher = mock.patch.dict(os.environ, {'GIT_CONFIG_GLOBAL': os.devnull, 'GIT_CONFIG_NOSYSTEM': '1',
                                                'NO_PROXY': '127.0.0.1', 'no_proxy': '127.0.0.1'})
        patcher.start()
        self.addCleanup(patcher.stop)
        self.addCleanup(lambda: [w.close() for w in self.workers])

    def worker(self, entries, **kw):
        w = FakeWorker(entries, **kw)
        self.workers.append(w)
        return w

    def run_main(self, args, key=KEY):
        out, err = io.StringIO(), io.StringIO()
        env = dict(os.environ)
        env.pop('LH_ADMIN_KEY', None)
        if key:
            env['LH_ADMIN_KEY'] = key
        with mock.patch.dict(os.environ, env, clear=True), contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
            code = writeback.main(args)
        return code, out.getvalue(), err.getvalue()

    def head(self, repo):
        return git(repo, 'rev-parse', 'HEAD').strip()

    def read(self, repo, name):
        return (Path(repo) / 'data' / name).read_text(encoding='utf-8')


class DryRunAndApply(WritebackCase):
    def test_dry_run_prints_the_diff_and_changes_nothing(self):
        repo = make_repo(self.tmp)
        before = (self.head(repo), self.read(repo, 'wordlist-overrides.json'))
        w = self.worker([entry('c_one', 'wordlist', 'removed', '測試詞')])
        code, out, err = self.run_main(['--worker', w.url, '--repo', str(repo)])
        self.assertEqual(code, 0, err)
        self.assertIn('詞庫 removed +1：測試詞', out)
        self.assertIn('加 --apply 才會寫檔並 commit', out)
        self.assertEqual((self.head(repo), self.read(repo, 'wordlist-overrides.json')), before)
        self.assertEqual(git(repo, 'status', '--porcelain').strip(), '')

    def test_apply_writes_logs_and_commits_only_the_three_files(self):
        repo = make_repo(self.tmp)
        (repo / 'notes.txt').write_text('別人的修改', encoding='utf-8')   # 不相關的未提交檔案
        old = json.loads(self.read(repo, 'wordlist-overrides.json'))
        head0 = self.head(repo)
        w = self.worker([entry('c_one', 'wordlist', 'removed', '測試詞')])
        code, out, err = self.run_main(['--worker', w.url, '--repo', str(repo), '--apply'])
        self.assertEqual(code, 0, err)
        new = json.loads(self.read(repo, 'wordlist-overrides.json'))
        self.assertEqual(new['removed'], old['removed'] + ['測試詞'])
        self.assertNotEqual(new['updated_at'], old['updated_at'])
        lines = [l for l in self.read(repo, 'applied-changes.log').splitlines() if '"id": "c_one"' in l]
        self.assertEqual(len(lines), 1)
        self.assertEqual(git(repo, 'rev-list', '--count', head0 + '..HEAD').strip(), '1')
        changed = sorted(git(repo, 'diff', '--name-only', head0, 'HEAD').split())
        self.assertEqual(changed, ['data/applied-changes.log', 'data/wordlist-overrides.json'])
        self.assertEqual(git(repo, 'status', '--porcelain').strip(), '?? notes.txt')

    def test_apply_twice_changes_nothing_the_second_time(self):
        repo = make_repo(self.tmp)
        w = self.worker([entry('c_one', 'wordlist', 'removed', '測試詞'),
                         entry('c_two', 'wordlist', 'fixed', {'w': '好運', 'z': 'ㄏㄠˇ ㄩㄣˋ'})])
        self.assertEqual(self.run_main(['--worker', w.url, '--repo', str(repo), '--apply'])[0], 0)
        head1 = self.head(repo)
        files1 = [self.read(repo, n) for n in ('wordlist-overrides.json', 'rhyme-dict-overrides.json', 'applied-changes.log')]
        code, out, err = self.run_main(['--worker', w.url, '--repo', str(repo), '--apply'])
        self.assertEqual(code, 0, err)
        self.assertIn('資料檔已包含這批修正', out)
        self.assertEqual(self.head(repo), head1)
        self.assertEqual([self.read(repo, n) for n in ('wordlist-overrides.json', 'rhyme-dict-overrides.json', 'applied-changes.log')], files1)

    def test_empty_layer(self):
        repo = make_repo(self.tmp)
        w = self.worker([])
        code, out, err = self.run_main(['--worker', w.url, '--repo', str(repo), '--apply'])
        self.assertEqual(code, 0, err)
        self.assertIn('修正層是空的，沒有要寫回的', out)

    def test_key_goes_in_the_header_and_never_into_output_or_files(self):
        repo = make_repo(self.tmp)
        w = self.worker([entry('c_one', 'wordlist', 'removed', '測試詞')])
        code, out, err = self.run_main(['--worker', w.url, '--repo', str(repo), '--apply'])
        self.assertEqual(code, 0, err)
        req = w.requests[0]
        self.assertEqual(req['headers'].get('X-Admin-Key'), KEY)
        self.assertEqual(req['headers'].get('User-Agent'), 'lucky-hawaii-writeback/1')
        self.assertNotIn(KEY, req['path'])
        self.assertNotIn(KEY, out + err)
        for p in (repo / 'data').iterdir():
            self.assertNotIn(KEY, p.read_text(encoding='utf-8'))
        self.assertNotIn(KEY, git(repo, 'log', '-p', '--all'))


if __name__ == '__main__':
    unittest.main()
