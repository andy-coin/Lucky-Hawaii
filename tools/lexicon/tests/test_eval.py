"""校準（lexicon:eval，06-08 任務 2）的測試：用錄好的判斷，不連網、不需要金鑰。"""
import contextlib
import hashlib
import io
import tempfile
import unittest
from pathlib import Path
from unittest import mock

import build
from lex import LexError, judge

CALIBRATION = build.HERE / 'judgments' / 'calibration.tsv'


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


class Lines:
    def __init__(self):
        self.lines = []

    def __call__(self, text):
        self.lines.append(text)

    def text(self):
        return '\n'.join(self.lines)


def make_rows(n=60):
    """n 個詞；前一半標 K、後一半標 D（詞不重複、都是合法的 2 字漢字詞）。"""
    han = [chr(0x4E00 + i) for i in range(n * 2)]
    rows = []
    for i in range(n):
        label = 'K' if i < n // 2 else 'D'
        rows.append((han[2 * i] + han[2 * i + 1], label, '類別', '說明'))
    return rows


def agreeing(rows, flip=0, drop=0):
    """RecordedProvider：全部和標準一致，前 flip 個故意答反、再 drop 個不回答。"""
    table = {}
    for i, (w, label, _c, _n) in enumerate(rows):
        if i < flip:
            table[w] = 'D' if label == 'K' else 'K'
        elif i < flip + drop:
            continue
        else:
            table[w] = label
    return judge.RecordedProvider(table)


class LoadCalibrationTest(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self._tmp.cleanup)
        self.tmp = Path(self._tmp.name)

    def write(self, text):
        p = self.tmp / 'cal.tsv'
        p.write_text(text, encoding='utf-8')
        return p

    def test_comments_and_blank_lines_are_skipped(self):
        rows = judge.load_calibration(self.write('# 標頭\n\n早餐\tK\t日常\t說明\n雜湊碰撞\tD\n'))
        self.assertEqual(rows, [('早餐', 'K', '日常', '說明'), ('雜湊碰撞', 'D', '', '')])

    def test_label_must_be_k_or_d(self):
        with self.assertRaises(LexError) as cm:
            judge.load_calibration(self.write('早餐\tX\t日常\n'))
        self.assertIn('K 或 D', str(cm.exception))
        with self.assertRaises(LexError):
            judge.load_calibration(self.write('早餐\tk\t日常\n'))

    def test_bad_word_missing_label_and_duplicates_stop(self):
        for text in ('早\tK\n', 'abc\tK\n', '早餐\n', '早餐\tK\n早餐\tD\n'):
            with self.subTest(text), self.assertRaises(LexError):
                judge.load_calibration(self.write(text))

    def test_shipped_calibration_list_is_well_formed_and_balanced_by_the_standard(self):
        rows = judge.load_calibration(CALIBRATION)
        self.assertGreaterEqual(len(rows), 50)
        by_word = {r[0]: r[1] for r in rows}
        self.assertEqual(by_word['三酸甘油酯'], 'K')
        self.assertEqual(by_word['聚乙烯醇縮丁醛'], 'D')
        self.assertEqual(by_word['分散式雜湊表'], 'D')
        n_k = sum(1 for r in rows if r[1] == 'K')
        self.assertGreater(n_k, len(rows) - n_k)   # K 多於 D（約 36 比 24）
        self.assertGreaterEqual(len(rows) - n_k, 20)

    def test_shipped_calibration_words_are_not_simplified(self):
        # 校準詞表自己也不能含簡體（用規則的簡體字集合檢查整份檔案）
        from tests import test_rules
        with tempfile.TemporaryDirectory() as tmp:
            ctx = build.ruleslib.load_rule_context(test_rules.make_paths(tmp), check_counts=False)
        text = CALIBRATION.read_text(encoding='utf-8')
        self.assertEqual(build.ruleslib.simplified_chars_in(text, ctx), [])


class RunEvalTest(unittest.TestCase):
    def test_full_agreement_prints_100_percent_and_exits_0(self):
        rows = make_rows()
        out = Lines()
        self.assertEqual(judge.run_eval(rows, agreeing(rows), out=out), 0)
        self.assertIn('一致率 100%', out.text())
        self.assertNotIn('不一致的詞', out.text())

    def test_six_of_sixty_disagreeing_is_90_percent_and_passes(self):
        rows = make_rows()
        out = Lines()
        self.assertEqual(judge.run_eval(rows, agreeing(rows, flip=6), min_agree=0.9, out=out), 0)
        self.assertIn('一致率 90%', out.text())
        self.assertIn('標準 K，AI 回答 D', out.text())

    def test_seven_disagreeing_fails_with_exit_1_and_lists_every_one(self):
        rows = make_rows()
        out = Lines()
        self.assertEqual(judge.run_eval(rows, agreeing(rows, flip=7), min_agree=0.9, out=out), 1)
        text = out.text()
        for w, label, _c, _n in rows[:7]:
            other = 'D' if label == 'K' else 'K'
            self.assertIn('  %s：標準 %s，AI 回答 %s' % (w, label, other), text)
        self.assertEqual(text.count('AI 回答'), 7)
        self.assertIn('校準未通過', text)

    def test_unanswered_words_count_as_disagreement_and_are_counted_separately(self):
        rows = make_rows()
        out = Lines()
        rc = judge.run_eval(rows, agreeing(rows, flip=3, drop=4), min_agree=0.9, out=out)
        self.assertEqual(rc, 1)   # 7 個不一致
        self.assertIn('沒回答 4 個', out.text())
        self.assertEqual(out.text().count('AI 沒有回答'), 4)
        self.assertEqual(out.text().count('AI 回答'), 3)

    def test_no_provider_exits_2_with_the_same_guidance_as_judge(self):
        out = Lines()
        self.assertEqual(judge.run_eval(make_rows(), None, out=out), 2)
        self.assertIn(judge.NO_PROVIDER_MESSAGE, out.text())

    def test_batches_never_exceed_60_words(self):
        rows = make_rows(130)
        asked = []

        class Spy(judge.RecordedProvider):
            def judge(self, words):
                asked.append(len(words))
                return super().judge(words)

        provider = Spy({w: l for w, l, _c, _n in rows})
        self.assertEqual(judge.run_eval(rows, provider, out=Lines()), 0)
        self.assertEqual(asked, [60, 60, 10])

    def test_provider_error_stops_with_exit_4_and_redacts_the_key(self):
        class Boom(judge.RecordedProvider):
            key = 'SECRETKEY123'

            def redact(self, text):
                return str(text).replace(self.key, '***')

            def judge(self, words):
                raise judge.ProviderError('出錯了 SECRETKEY123')

        out = Lines()
        self.assertEqual(judge.run_eval(make_rows(), Boom({}), out=out), 4)
        self.assertNotIn('SECRETKEY123', out.text())
        self.assertIn('***', out.text())


class EvalCommandTest(unittest.TestCase):
    """build.py eval：結束代碼與「絕不寫判斷快取」。"""

    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self._tmp.cleanup)
        self.tmp = Path(self._tmp.name)
        self.judgments = self.tmp / 'judgments.tsv'
        judge.save_judgments(self.judgments, {'早餐': ('K', 'recorded', judge.PROMPT_VERSION)})

    def run_cli(self, args, env=None):
        out, err = io.StringIO(), io.StringIO()
        with mock.patch.object(build, 'JUDGMENTS_PATH', self.judgments), \
                mock.patch.dict('os.environ', env or {'GEMINI_API_KEY': '', 'LEX_AI_URL': ''}, clear=False), \
                contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
            rc = build.main(['eval'] + list(args))
        return rc, out.getvalue(), err.getvalue()

    def test_no_provider_exits_2_and_changes_nothing(self):
        before = (sha(self.judgments), sha(CALIBRATION))
        rc, _out, err = self.run_cli([])
        self.assertEqual(rc, 2)
        self.assertIn('GEMINI_API_KEY', err)
        self.assertEqual((sha(self.judgments), sha(CALIBRATION)), before)

    def test_recorded_provider_agreeing_exits_0_and_never_writes_judgments(self):
        rows = judge.load_calibration(CALIBRATION)
        rec = self.tmp / 'rec.tsv'
        rec.write_text('\n'.join('%s\t%s\trecorded\t%s' % (w, label, judge.PROMPT_VERSION)
                                 for w, label, _c, _n in rows) + '\n', encoding='utf-8')
        before = sha(self.judgments)
        rc, out, _err = self.run_cli(['--provider', 'recorded', '--recorded', str(rec)])
        self.assertEqual(rc, 0)
        self.assertIn('一致率 100%', out)
        self.assertEqual(sha(self.judgments), before)
        self.assertEqual(sorted(p.name for p in self.tmp.iterdir()), ['judgments.tsv', 'rec.tsv'])

    def test_recorded_provider_that_disagrees_exits_1_and_lists_words(self):
        rows = judge.load_calibration(CALIBRATION)
        rec = self.tmp / 'rec.tsv'
        flipped = ['%s\t%s\trecorded\t%s' % (w, 'D' if label == 'K' else 'K', judge.PROMPT_VERSION)
                   for w, label, _c, _n in rows]
        rec.write_text('\n'.join(flipped) + '\n', encoding='utf-8')
        rc, out, _err = self.run_cli(['--provider', 'recorded', '--recorded', str(rec)])
        self.assertEqual(rc, 1)
        self.assertIn('三酸甘油酯：標準 K，AI 回答 D', out)

    def test_min_agree_can_be_lowered_and_bad_values_are_refused(self):
        rows = judge.load_calibration(CALIBRATION)
        rec = self.tmp / 'rec.tsv'
        rec.write_text('\n'.join('%s\t%s\trecorded\t%s' % (w, 'D' if i < 10 else label, judge.PROMPT_VERSION)
                                 for i, (w, label, _c, _n) in enumerate(rows)) + '\n', encoding='utf-8')
        args = ['--provider', 'recorded', '--recorded', str(rec)]
        self.assertEqual(self.run_cli(args + ['--min-agree', '0.5'])[0], 0)
        for bad in ('0', '1.5', 'abc'):
            with self.subTest(bad), contextlib.redirect_stderr(io.StringIO()), self.assertRaises(SystemExit):
                self.run_cli(args + ['--min-agree', bad])

    def test_custom_calibration_file_is_used_and_a_bad_one_stops_with_exit_2(self):
        bad = self.tmp / 'bad.tsv'
        bad.write_text('早餐\tX\n', encoding='utf-8')
        rec = self.tmp / 'rec.tsv'
        rec.write_text('早餐\tK\trecorded\tlex03-v1\n', encoding='utf-8')
        rc, _out, err = self.run_cli(['--provider', 'recorded', '--recorded', str(rec), '--calibration', str(bad)])
        self.assertEqual(rc, 2)
        self.assertIn('K 或 D', err)

    def test_package_json_has_the_eval_script(self):
        import json
        pkg = json.loads((build.REPO / 'package.json').read_text(encoding='utf-8'))
        self.assertEqual(pkg['scripts']['lexicon:eval'], 'python3 -B tools/lexicon/build.py eval')


if __name__ == '__main__':
    unittest.main()
