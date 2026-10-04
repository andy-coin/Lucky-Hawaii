"""詞庫包寫出、清單、離線驗證的測試（分片大小縮成 10，只用暫存資料夾）。"""
import hashlib
import json
import shutil
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from lex import pack

LICENCE_BYTES = b'Fake licence text\n'
LICENCE_SHA = hashlib.sha256(LICENCE_BYTES).hexdigest()

CFG = {
    'id': 'demo', 'name': '示範詞庫', 'description': '測試用', 'licence_spdx': 'MIT',
    'copyright': ['Copyright (c) 2025 Demo'],
    'licence_texts': [{'source': 'demo-licence', 'file': 'LICENSE', 'as': 'LICENSE.MIT.txt'}],
}
PACKS_CFG = {
    'schema': 1, 'default': 'v096',
    'packs': [
        {'id': 'v096', 'name': 'v0.96 現行詞庫', 'description': '現行', 'legacy': True,
         'meta': 'data/wordlist-meta.json', 'chunkPattern': 'data/wordlist-c{NN}.json'},
        dict(CFG, sources=['demo-src'], parser='tsi'),
    ],
}
LOCK = {'schema': 1, 'sources': [
    {'id': 'demo-licence', 'role': 'licence-text', 'redistribute': True,
     'repo': 'https://github.com/o/r', 'commit': 'b' * 40, 'licence_spdx': 'MIT',
     'files': [{'path': 'LICENSE', 'bytes': len(LICENCE_BYTES), 'sha256': LICENCE_SHA}]},
]}
# 25 個不重複的 BMP 漢字詞（各 2 字）
HAN = [chr(0x4E00 + i) for i in range(50)]
ENTRIES = [{'w': HAN[2 * i] + HAN[2 * i + 1], 'z': 'ㄧ ㄧ', 'p': i} for i in range(25)]
SRC_META = [{'id': 'demo-src', 'repo': 'https://github.com/o/s', 'commit': 'c' * 40, 'licence_spdx': 'MIT'}]


class PackTestBase(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.repo = Path(self.tmp.name)
        (self.repo / 'data').mkdir()
        (self.repo / 'data' / 'wordlist-meta.json').write_text(
            json.dumps({'version': 'x', 'chunks': 10, 'total': 233713}), encoding='utf-8')
        self.out = self.repo / 'data' / 'packs' / 'demo'
        for patcher in (mock.patch('lex.pack.CHUNK_SIZE', 10),
                        mock.patch('lex.pack.today', return_value='2026-01-01')):
            patcher.start()
            self.addCleanup(patcher.stop)

    def licence_files(self):
        return [{'file': 'LICENSE.MIT.txt', 'sha256': LICENCE_SHA}]

    def build(self, entries=ENTRIES):
        self.out.mkdir(parents=True, exist_ok=True)
        (self.out / 'LICENSE.MIT.txt').write_bytes(LICENCE_BYTES)
        meta = pack.write_pack(self.out, CFG, entries, {'stats': {}},
                               sources=SRC_META, licence_files=self.licence_files())
        pack.write_notice(self.out, CFG, meta, '2025.1', 0)
        pack.write_v096_notice(self.repo)
        pack.write_manifest(PACKS_CFG, {'demo': meta}, self.repo)
        return meta

    def problems(self):
        return pack.verify(self.repo, PACKS_CFG, LOCK)

    def snapshot(self):
        return {str(p.relative_to(self.repo)): p.read_bytes()
                for p in sorted(self.repo.rglob('*')) if p.is_file()}


class WritePackTest(PackTestBase):
    def test_chunks_are_split_sorted_and_compact(self):
        shuffled = list(reversed(ENTRIES))
        meta = self.build(shuffled)
        self.assertEqual(meta['chunks'], 3)
        sizes = [len((self.out / ('c%02d.json' % i)).read_text(encoding='utf-8').splitlines()) for i in range(3)]
        self.assertEqual(sizes, [10, 10, 5])
        first = (self.out / 'c00.json').read_text(encoding='utf-8').splitlines()
        self.assertEqual(first[0], json.dumps({'w': ENTRIES[0]['w'], 'z': 'ㄧ ㄧ', 'p': 0},
                                              ensure_ascii=False, separators=(',', ':')))
        words = [json.loads(ln)['w'] for i in range(3)
                 for ln in (self.out / ('c%02d.json' % i)).read_text(encoding='utf-8').splitlines()]
        self.assertEqual(words, sorted(words))

    def test_version_is_rules_version_plus_content_hash(self):
        meta = self.build()
        h = hashlib.sha256()
        for i in range(3):
            h.update((self.out / ('c%02d.json' % i)).read_bytes())
        self.assertEqual(meta['hash'], h.hexdigest())
        self.assertEqual(meta['version'], '1.' + h.hexdigest()[:10])
        self.assertEqual(list(meta)[:12], ['id', 'name', 'description', 'version', 'hash', 'entries',
                                           'chunks', 'sources', 'licence', 'licence_files',
                                           'rules_version', 'built'])

    def test_rebuild_is_byte_identical_and_keeps_built(self):
        self.build()
        before = self.snapshot()
        with mock.patch('lex.pack.today', return_value='2030-05-05'):
            self.build()
        self.assertEqual(self.snapshot(), before)
        self.assertEqual(json.loads((self.out / 'meta.json').read_text(encoding='utf-8'))['built'], '2026-01-01')

    def test_changed_entry_changes_version_and_built(self):
        meta1 = self.build()
        changed = [dict(e) for e in ENTRIES]
        changed[3]['p'] = 999
        with mock.patch('lex.pack.today', return_value='2030-05-05'):
            meta2 = self.build(changed)
        self.assertNotEqual(meta1['version'], meta2['version'])
        self.assertEqual(meta2['built'], '2030-05-05')

    def test_stale_chunk_is_removed(self):
        self.out.mkdir(parents=True)
        (self.out / 'c03.json').write_text('stale\n', encoding='utf-8')
        self.build()
        self.assertFalse((self.out / 'c03.json').exists())

    def test_removed_list_is_sorted_compact_lines(self):
        path = self.repo / 'removed.ndjson'
        rows = [{'w': '乙乙', 'z': 'ㄧ ㄧ', 'p': 0, 'rule': 'R0-x', 'reason': '原因', 'src': ['a'], 'n': 1},
                {'w': '甲甲', 'z': 'ㄧ ㄧ', 'p': 2, 'rule': 'R0-y', 'reason': '原因', 'src': ['a'], 'n': 1}]
        pack.write_removed(path, list(reversed(rows)))
        lines = path.read_text(encoding='utf-8').splitlines()
        self.assertEqual([json.loads(x)['w'] for x in lines], ['乙乙', '甲甲'])
        self.assertNotIn(', ', lines[0])


class ManifestTest(PackTestBase):
    def test_v096_first_with_legacy_cache(self):
        self.build()
        m = json.loads((self.repo / 'data' / 'packs' / 'index.json').read_text(encoding='utf-8'))
        self.assertEqual(m['default'], 'v096')
        self.assertEqual([p['id'] for p in m['packs']], ['v096', 'demo'])
        v = m['packs'][0]
        self.assertIs(v['legacyCache'], True)
        self.assertEqual(v['entries'], 233713)
        self.assertEqual(v['meta'], 'data/wordlist-meta.json')
        self.assertEqual(v['chunkPattern'], 'data/wordlist-c{NN}.json')
        self.assertEqual(m['packs'][1]['chunkPattern'], 'data/packs/demo/c{NN}.json')
        self.assertEqual(m['packs'][1]['entries'], 25)
        self.assertNotIn('legacyCache', m['packs'][1])


class VerifyTest(PackTestBase):
    def setUp(self):
        super().setUp()
        self.build()

    def test_clean_output_passes(self):
        self.assertEqual(self.problems(), [])

    def test_unsorted_chunk_is_reported(self):
        p = self.out / 'c00.json'
        lines = p.read_text(encoding='utf-8').splitlines()
        lines[0], lines[1] = lines[1], lines[0]
        p.write_text('\n'.join(lines) + '\n', encoding='utf-8')
        self.assertTrue(any('排序' in x for x in self.problems()))

    def test_wrong_version_is_reported(self):
        mp = self.out / 'meta.json'
        meta = json.loads(mp.read_text(encoding='utf-8'))
        meta['version'] = '1.0000000000'
        mp.write_text(json.dumps(meta, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
        self.assertTrue(any('version' in x for x in self.problems()))

    def test_missing_licence_file_is_reported(self):
        (self.out / 'LICENSE.MIT.txt').unlink()
        self.assertTrue(any('LICENSE.MIT.txt' in x for x in self.problems()))

    def test_tampered_licence_file_is_reported(self):
        (self.out / 'LICENSE.MIT.txt').write_bytes(b'something else')
        self.assertTrue(any('sha256' in x for x in self.problems()))

    def test_extra_file_is_reported(self):
        (self.out / 'stray.txt').write_text('x', encoding='utf-8')
        self.assertTrue(any('stray.txt' in x for x in self.problems()))

    def test_extra_chunk_is_reported(self):
        shutil.copy(self.out / 'c02.json', self.out / 'c03.json')
        self.assertTrue(any('c03.json' in x for x in self.problems()))

    def test_non_bmp_word_is_reported(self):
        p = self.out / 'c02.json'
        p.write_text(p.read_text(encoding='utf-8') + '{"w":"𰻞𰻞","z":"ㄧ ㄧ","p":0}\n', encoding='utf-8')
        self.assertTrue(any('BMP' in x for x in self.problems()))

    def test_notice_missing_commit_is_reported(self):
        p = self.out / 'NOTICE.txt'
        p.write_text(p.read_text(encoding='utf-8').replace('c' * 40, 'removed'), encoding='utf-8')
        self.assertTrue(any('NOTICE' in x for x in self.problems()))

    def test_default_must_be_v096(self):
        ip = self.repo / 'data' / 'packs' / 'index.json'
        m = json.loads(ip.read_text(encoding='utf-8'))
        m['default'] = 'demo'
        ip.write_text(json.dumps(m, ensure_ascii=False), encoding='utf-8')
        self.assertTrue(any('v096' in x for x in self.problems()))

    def test_licence_outside_allow_list_is_reported(self):
        mp = self.out / 'meta.json'
        meta = json.loads(mp.read_text(encoding='utf-8'))
        meta['licence'] = 'CC-BY-ND-3.0'
        mp.write_text(json.dumps(meta, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
        self.assertTrue(any('CC-BY-ND-3.0' in x for x in self.problems()))


if __name__ == '__main__':
    unittest.main()
