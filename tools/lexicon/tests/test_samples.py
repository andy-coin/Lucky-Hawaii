"""範例詞表測試（C5）：用一份有預期結果的詞表，驗證「可理解性」標準（LEX-03）。

規則能決定的詞（簡體、罕用字、中國用語、格式）直接斷言規則 id；
灰色詞（只有一個來源收錄）的去留由「錄好的 AI 判斷」決定，不連網。
另外檢查：已提交的 judgments.tsv 若已有三個 LEX-03 指標詞，判斷必須是 K、D、D。
"""
import json
import tempfile
import unittest
from pathlib import Path

import build
from lex import judge, rules
from tests.test_rules import make_paths

FIX = Path(__file__).resolve().parent / 'fixtures'
SAMPLES = FIX / 'samples.tsv'
RECORDED = FIX / 'recorded-judgments.tsv'

# LEX-03 的三個指標詞與應有的判斷
ANCHORS = {'三酸甘油酯': 'K', '聚乙烯醇縮丁醛': 'D', '分散式雜湊表': 'D'}


def load_samples(path=SAMPLES):
    rows = []
    with open(path, encoding='utf-8') as fh:
        for raw in fh:
            line = raw.rstrip('\r\n')
            if not line.strip() or line.startswith('#'):
                continue
            parts = line.split('\t')
            if len(parts) != 7:
                raise AssertionError('samples.tsv 每行要有 7 欄：%r' % line)
            w, z, n, freq, expect, rule, note = parts
            rows.append({'w': w, 'z': z, 'n': int(n), 'freq': int(freq), 'expect': expect,
                         'rule': rule, 'note': note})
    return rows


class SampleListTest(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self._tmp.cleanup)
        # 保留名單放 剪貼板；char-allow 預設有 祢
        paths = make_paths(Path(self._tmp.name), keep=['剪貼板'])
        self.ctx = rules.load_rule_context(paths, check_counts=False)
        self.provider = judge.RecordedProvider.from_file(RECORDED)

    def verdict_of(self, row):
        """分類 → 灰色詞用錄好的判斷決定去留 → (決定, 規則)。"""
        ev = {'n': row['n'], 'freq': row['freq'], 'freqs': [row['freq']] * row['n']}
        decision, rule, _detail = rules.classify(row['w'], row['z'], ev, self.ctx)
        if decision == 'gray':
            got = self.provider.judge([row['w']])[row['w']]
            judgments = {row['w']: (got, 'recorded', judge.PROMPT_VERSION)} if got else {}
            decision, rule, _pending, _model = rules.resolve(
                row['w'], decision, rule, judgments, self.ctx.keep_allow)
        return decision, rule

    def test_sample_list_has_enough_rows_and_the_three_anchor_words(self):
        rows = load_samples()
        self.assertGreaterEqual(len(rows), 15)
        words = {r['w'] for r in rows}
        for w in ANCHORS:
            self.assertIn(w, words)
        for r in rows:
            self.assertIn(r['expect'], ('KEEP', 'DELETE'), r['w'])

    def test_every_sample_gets_the_expected_outcome_and_rule(self):
        for row in load_samples():
            with self.subTest(row['w']):
                decision, rule = self.verdict_of(row)
                self.assertEqual(decision.upper(), row['expect'], row['note'])
                self.assertEqual(rule, row['rule'], row['note'])

    def test_comprehensibility_anchors(self):
        # ROADMAP 成功條件 4：三酸甘油酯保留、聚乙烯醇縮丁醛與分散式雜湊表刪除
        by_word = {r['w']: r for r in load_samples()}
        self.assertEqual(self.verdict_of(by_word['三酸甘油酯'])[0], 'keep')
        self.assertEqual(self.verdict_of(by_word['聚乙烯醇縮丁醛']), ('delete', 'R5-ai-incomprehensible'))
        self.assertEqual(self.verdict_of(by_word['分散式雜湊表']), ('delete', 'R5-ai-incomprehensible'))

    def test_gray_rows_without_a_recorded_verdict_stay_pending_and_kept(self):
        decision, rule, pending, model = rules.resolve('三酸甘油酯', 'gray', 'G-single-source', {}, set())
        self.assertEqual((decision, rule, pending, model), ('keep', 'G-single-source', True, None))

    def test_synthetic_rows_say_so(self):
        for row in load_samples():
            if row['w'] in ('聚乙烯醇縮丁醛', '分散式雜湊表'):
                self.assertIn('合成證據列', row['note'])
                self.assertEqual((row['n'], row['freq']), (1, 0))


class CommittedJudgmentsAnchorTest(unittest.TestCase):
    def test_committed_judgments_agree_with_lex03_anchors_when_present(self):
        table, _bad = judge.load_judgments(build.JUDGMENTS_PATH)
        checked = 0
        for w, want in ANCHORS.items():
            if w not in table:
                print('judgments.tsv 尚無 %s，略過' % w)
                continue
            checked += 1
            self.assertEqual(table[w][0], want, '%s 的判斷應是 %s（LEX-03）' % (w, want))
        self.assertLessEqual(checked, len(ANCHORS))


if __name__ == '__main__':
    unittest.main()
