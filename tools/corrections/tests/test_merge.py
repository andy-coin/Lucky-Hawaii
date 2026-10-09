"""合併語意：和 Worker 的 replayEntries 讀同一份測試向量，結果必須一樣，而且重跑不變。"""
import json
import unittest
from pathlib import Path

import writeback

VECTORS = json.loads((Path(__file__).resolve().parents[3] / 'tests' / 'fixtures' / 'corrections-vectors.json')
                     .read_text(encoding='utf-8'))
EMPTY = {'wordlist': {'removed': [], 'hidden': [], 'fixed': {}, 'added': []},
         'rhymeDict': {'removed': [], 'hidden': [], 'fixed': [], 'added': []}}


def docs(base):
    """向量的 base（可省略、可只有部分欄位）→ 兩個資料檔的內容。"""
    base = base or {}
    w = {'version': 2, 'updated_at': 'T'}
    w.update(base.get('wordlist') or {})
    r = {'version': 2, 'updated_at': 'T'}
    r.update(base.get('rhymeDict') or {})
    return w, r


def buckets(w, r):
    return {'wordlist': dict((k, w[k]) for k in ('removed', 'hidden', 'fixed', 'added')),
            'rhymeDict': dict((k, r[k]) for k in ('removed', 'hidden', 'fixed', 'added'))}


class SharedVectors(unittest.TestCase):
    def test_every_case_matches_the_expected_state(self):
        self.assertGreaterEqual(len(VECTORS['cases']), 31)
        for case in VECTORS['cases']:
            with self.subTest(case['name']):
                w, r = docs(case.get('base'))
                self.assertEqual(buckets(*writeback.merge(w, r, case['entries'])), case['expected'])

    def test_every_case_is_idempotent_down_to_the_bytes(self):
        for case in VECTORS['cases']:
            with self.subTest(case['name']):
                w, r = docs(case.get('base'))
                w1, r1 = writeback.merge(w, r, case['entries'])
                w2, r2 = writeback.merge(w1, r1, case['entries'])
                self.assertEqual(buckets(w2, r2), buckets(w1, r1))
                self.assertEqual(writeback.format_word(w2), writeback.format_word(w1))
                self.assertEqual(writeback.format_rhyme(r2), writeback.format_rhyme(r1))

    def test_merge_never_touches_its_inputs(self):
        for case in VECTORS['cases']:
            with self.subTest(case['name']):
                w, r = docs(case.get('base'))
                snap = json.dumps([w, r, case['entries']], ensure_ascii=False, sort_keys=True)
                writeback.merge(w, r, case['entries'])
                self.assertEqual(json.dumps([w, r, case['entries']], ensure_ascii=False, sort_keys=True), snap)

    def test_every_case_entry_passes_validation(self):
        for case in VECTORS['cases']:
            for e in case['entries']:
                with self.subTest(case['name']):
                    self.assertTrue(writeback.validate_entry(e['target'], e['bucket'], e['value']), e)

    def test_every_invalid_value_is_rejected(self):
        self.assertGreaterEqual(len(VECTORS['invalid']), 17)
        for bad in VECTORS['invalid']:
            with self.subTest(bad['name']):
                self.assertFalse(writeback.validate_entry(bad['target'], bad['bucket'], bad['value']), bad)

    def test_manual_add_without_pronunciation_keeps_an_existing_fix(self):
        # Worker 註解裡的邊角（向量沒涵蓋）：z 為空的手動新增不可蓋掉修正過的注音
        w, r = docs(None)
        entries = [
            {'target': 'wordlist', 'bucket': 'fixed', 'value': {'w': '好運', 'z': 'ㄏㄠˇ ㄩㄣˋ'}},
            {'target': 'wordlist', 'bucket': 'added', 'value': {'w': '好運', 'z': '', 'tier': 'normal', 'source': 'manual'}},
        ]
        nw, _ = writeback.merge(w, r, entries)
        self.assertEqual(nw['fixed'], {'好運': 'ㄏㄠˇ ㄩㄣˋ'})


if __name__ == '__main__':
    unittest.main()
