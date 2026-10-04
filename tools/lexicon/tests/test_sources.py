"""來源鎖、釘選下載、授權閘門的測試（不連網：下載一律用假回應）。"""
import hashlib
import json
import os
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from lex import LexError, REPO, cache_dir
from lex import sources

HERE = Path(__file__).resolve().parent.parent
LOCK = HERE / 'sources.lock.json'
PACKS = HERE / 'packs.json'


class FakeResp(object):
    """假的 HTTP 回應：只實作 read 與 with。"""

    def __init__(self, data):
        self.data = data
        self.pos = 0

    def read(self, n=-1):
        if n is None or n < 0:
            n = len(self.data) - self.pos
        chunk = self.data[self.pos:self.pos + n]
        self.pos += len(chunk)
        return chunk

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False


def fake_source(data=b'hello world', **over):
    src = {
        'id': 'fake', 'role': 'pack', 'redistribute': True,
        'repo': 'https://github.com/owner/repo',
        'commit': 'a' * 40, 'licence_spdx': 'MIT', 'licence_evidence': None,
        'files': [{'path': 'dir/a b.txt', 'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest()}],
    }
    src.update(over)
    return src


class RealLockTest(unittest.TestCase):
    def setUp(self):
        self.lock = sources.load_lock(LOCK)

    def test_real_lock_validates_and_has_seven_sources(self):
        self.assertEqual(
            [s['id'] for s in self.lock['sources']],
            ['libchewing-data', 'mcbopomofo', 'vanguard-tw', 'opencc', 'tw-charlists',
             'libchewing-licence', 'tabe-notice'])

    def test_pack_sources_are_redistributable_and_allowed(self):
        for s in self.lock['sources']:
            if s['role'] == 'pack':
                self.assertIs(s['redistribute'], True, s['id'])
            if s['role'] == 'rule-input':
                self.assertIs(s['redistribute'], False, s['id'])

    def test_no_moe_files_in_lock_or_packs(self):
        text = LOCK.read_text(encoding='utf-8') + PACKS.read_text(encoding='utf-8')
        for bad in ('phrases-moe', 'phrases-custom', 'moedict'):
            self.assertNotIn(bad, text)

    def test_real_chewing_pack_passes_gate(self):
        packs = json.loads(PACKS.read_text(encoding='utf-8'))
        chewing = [p for p in packs['packs'] if p['id'] == 'chewing'][0]
        sources.assert_pack_sources(chewing, self.lock)

    def test_raw_url_pins_commit_and_quotes_path(self):
        src = fake_source()
        url = sources.raw_url(src, 'dir/臺灣 a.txt')
        self.assertEqual(
            url, 'https://raw.githubusercontent.com/owner/repo/' + 'a' * 40 +
            '/dir/%E8%87%BA%E7%81%A3%20a.txt')

    def test_load_lock_rejects_bad_commit(self):
        bad = {'schema': 1, 'sources': [fake_source(commit='main')]}
        with tempfile.TemporaryDirectory() as d:
            p = Path(d) / 'lock.json'
            p.write_text(json.dumps(bad), encoding='utf-8')
            with self.assertRaises(LexError):
                sources.load_lock(p)


class GateTest(unittest.TestCase):
    def cfg(self, **over):
        c = {'id': 'x', 'sources': ['fake'], 'licence_spdx': 'MIT', 'licence_texts': []}
        c.update(over)
        return c

    def test_pack_source_with_redistribute_false_is_refused(self):
        lock = {'sources': [fake_source(redistribute=False)]}
        with self.assertRaises(LexError):
            sources.assert_pack_sources(self.cfg(), lock)

    def test_licence_outside_allow_list_is_refused(self):
        lock = {'sources': [fake_source(licence_spdx='CC-BY-ND-3.0')]}
        with self.assertRaises(LexError):
            sources.assert_pack_sources(self.cfg(licence_spdx='CC-BY-ND-3.0'), lock)

    def test_pack_licence_token_outside_allow_list_is_refused(self):
        lock = {'sources': [fake_source()]}
        with self.assertRaises(LexError):
            sources.assert_pack_sources(self.cfg(licence_spdx='MIT AND GPL-3.0-only'), lock)

    def test_rule_input_source_cannot_be_a_pack_source(self):
        lock = {'sources': [fake_source(role='rule-input')]}
        with self.assertRaises(LexError):
            sources.assert_pack_sources(self.cfg(), lock)

    def test_good_pack_passes(self):
        lock = {'sources': [fake_source()]}
        sources.assert_pack_sources(self.cfg(), lock)


class FetchTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.base = Path(self.tmp.name)
        self.addCleanup(self.tmp.cleanup)

    def test_download_is_verified_and_cached(self):
        data = b'hello world'
        src = fake_source(data)
        with mock.patch('lex.sources.urlopen', return_value=FakeResp(data)) as m:
            p = sources.fetch_file(src, src['files'][0], self.base)
        self.assertEqual(p.read_bytes(), data)
        self.assertEqual(m.call_count, 1)
        # 網址是固定 commit 的 raw 網址，且帶 User-Agent
        req = m.call_args[0][0]
        self.assertIn('/' + 'a' * 40 + '/', req.full_url)
        self.assertEqual(req.get_header('User-agent'), 'lucky-hawaii-lexicon')

    def test_complete_cache_makes_no_network_request(self):
        data = b'hello world'
        src = fake_source(data)
        with mock.patch('lex.sources.urlopen', return_value=FakeResp(data)):
            sources.fetch_file(src, src['files'][0], self.base)
        with mock.patch('lex.sources.urlopen', side_effect=AssertionError('不該連網')) as m:
            p = sources.fetch_file(src, src['files'][0], self.base)
            self.assertTrue(p.is_file())
            m.assert_not_called()

    def test_wrong_sha256_is_refused_and_leaves_nothing(self):
        data = b'hello world'
        src = fake_source(data)
        with mock.patch('lex.sources.urlopen', return_value=FakeResp(b'HELLO WORLD')):
            with self.assertRaises(LexError) as ctx:
                sources.fetch_file(src, src['files'][0], self.base)
        self.assertIn('fake', str(ctx.exception))
        self.assertEqual([p for p in self.base.rglob('*') if p.is_file()], [])

    def test_oversize_download_is_aborted(self):
        data = b'hello world'
        src = fake_source(data)
        with mock.patch('lex.sources.urlopen', return_value=FakeResp(data + b'x' * 200000)):
            with self.assertRaises(LexError):
                sources.fetch_file(src, src['files'][0], self.base)
        self.assertEqual([p for p in self.base.rglob('*') if p.is_file()], [])

    def test_missing_licence_evidence_stops(self):
        data = b'no licence line here'
        src = fake_source(data, licence_evidence={'file': 'dir/a b.txt', 'contains': '# dc:license,MIT,'})
        with mock.patch('lex.sources.urlopen', return_value=FakeResp(data)):
            sources.fetch_file(src, src['files'][0], self.base)
        with self.assertRaises(LexError):
            sources.check_evidence(src, self.base)

    def test_present_licence_evidence_passes(self):
        data = b'# dc:license,MIT,\nrest'
        src = fake_source(data, licence_evidence={'file': 'dir/a b.txt', 'contains': '# dc:license,MIT,'})
        with mock.patch('lex.sources.urlopen', return_value=FakeResp(data)):
            sources.fetch_file(src, src['files'][0], self.base)
        sources.check_evidence(src, self.base)

    def test_extract_rule_turns_marker_block_into_text(self):
        body = ('before\n#  ---- COPYING.libtabe ---- BEGIN\n#\n#  /*\n# * Copyright\n#  */\n#\n'
                '#  ---- COPYING.libtabe-----END\nafter\n').encode('utf-8')
        # 規則：兩個標記之間每行去掉 ^\s*# ?，頭尾空行丟掉，最後補一個換行
        data = ' /*\n* Copyright\n */\n'.encode('utf-8')
        src = fake_source(body, role='licence-text', files=[{
            'path': 'LICENSE', 'bytes': len(body), 'sha256': hashlib.sha256(body).hexdigest()}],
            extract={'file': 'LICENSE', 'begin': 'COPYING.libtabe ---- BEGIN',
                     'end': 'COPYING.libtabe-----END', 'strip_regex': r'^\s*# ?',
                     'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest()})
        with mock.patch('lex.sources.urlopen', return_value=FakeResp(body)):
            sources.fetch_file(src, src['files'][0], self.base)
        out = sources.build_extract(src, self.base)
        self.assertEqual(out.read_bytes(), data)

    def test_extract_with_wrong_hash_is_refused(self):
        body = b'x\n# COPYING.libtabe ---- BEGIN\n# hi\n# COPYING.libtabe-----END\n'
        src = fake_source(body, role='licence-text', files=[{
            'path': 'LICENSE', 'bytes': len(body), 'sha256': hashlib.sha256(body).hexdigest()}],
            extract={'file': 'LICENSE', 'begin': 'COPYING.libtabe ---- BEGIN',
                     'end': 'COPYING.libtabe-----END', 'strip_regex': r'^\s*# ?',
                     'bytes': 3, 'sha256': '0' * 64})
        with mock.patch('lex.sources.urlopen', return_value=FakeResp(body)):
            sources.fetch_file(src, src['files'][0], self.base)
        with self.assertRaises(LexError):
            sources.build_extract(src, self.base)


class CacheDirTest(unittest.TestCase):
    def test_cache_inside_repo_is_refused_and_not_created(self):
        target = REPO / 'tmp-cache-should-not-exist'
        with mock.patch.dict(os.environ, {'LEX_CACHE_DIR': str(target)}):
            with self.assertRaises(LexError):
                cache_dir()
        self.assertFalse(target.exists())

    def test_repo_itself_is_refused(self):
        with mock.patch.dict(os.environ, {'LEX_CACHE_DIR': str(REPO)}):
            with self.assertRaises(LexError):
                cache_dir()

    def test_outside_repo_is_accepted(self):
        with tempfile.TemporaryDirectory() as d:
            with mock.patch.dict(os.environ, {'LEX_CACHE_DIR': d}):
                self.assertEqual(cache_dir(), Path(d).resolve())

    def test_test_environment_uses_temp_cache(self):
        self.assertTrue(os.environ.get('LEX_CACHE_DIR'))
        self.assertNotIn('GEMINI_API_KEY', os.environ)


class NetworkGuardTest(unittest.TestCase):
    def test_remote_connection_is_blocked(self):
        import socket
        with self.assertRaises(RuntimeError):
            socket.create_connection(('example.com', 80), timeout=1)


if __name__ == '__main__':
    unittest.main()
