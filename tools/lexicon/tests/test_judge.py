"""灰色詞 AI 判斷（06-07 任務 1）的測試：全部用錄好的判斷，不連網、不需要金鑰。

涵蓋：判斷快取讀寫、resolve、run_judge（估算、上限、續跑、中斷、重判、試跑）、
重建詞庫包（D 刪、K 留、沒判的保留並標待判、版本自動更新）、verify 的免費額度檢查。
"""
import contextlib
import io
import json
import tempfile
import unittest
from pathlib import Path
from unittest import mock

import build
from lex import judge, pack, parse, report, rules
from tests import test_pack, test_rules

FIXTURE = Path(__file__).resolve().parent / 'fixtures' / 'recorded-judgments.tsv'
PENDING = ['一二', '一三', '一四', '二三', '二四', '三四', '四五']   # 7 個待判詞
Z2 = 'ㄧ ㄧ'


class Lines:
    """收集 run_judge 印出的行；provider 的呼叫也記在同一份清單，才看得出誰先誰後。"""

    def __init__(self):
        self.log = []

    def __call__(self, text):
        self.log.append(('out', text))

    def texts(self):
        return [t for k, t in self.log if k == 'out']


class SpyProvider(judge.RecordedProvider):
    """記錄每次問了哪些詞；可以設定第幾次呼叫要出錯。"""

    def __init__(self, table, log=None, fail_on=None):
        super().__init__(table)
        self.asked = []
        self.log = log if log is not None else []
        self.fail_on = fail_on

    def judge(self, words):
        self.log.append(('call', list(words)))
        if self.fail_on is not None and self.requests + 1 == self.fail_on:
            self.requests += 1
            raise RuntimeError('假的 AI 掛了')
        self.asked.append(list(words))
        return super().judge(words)


def recorded_table():
    table, bad = judge.load_judgments(FIXTURE)
    assert bad == 0
    return table


class JudgeBase(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self._tmp.cleanup)
        self.tmp = Path(self._tmp.name)
        self.path = self.tmp / 'judgments' / 'judgments.tsv'

    def run_judge(self, provider, pending=PENDING, **kw):
        out = Lines()
        if provider is not None and getattr(provider, 'log', None) is not None:
            out.log = provider.log
        kw.setdefault('batch_size', 3)
        rc = judge.run_judge(pending, self.path, provider, out=out, **kw)
        return rc, out


class JudgmentsFileTest(JudgeBase):
    def test_load_skips_comments_and_counts_malformed_lines(self):
        self.path.parent.mkdir(parents=True)
        self.path.write_text(
            '# 註解\n'
            '\n'
            '一二\tK\tm\tv1\n'
            '一三\tD\tm\tv1\n'
            '一四\tX\tm\tv1\n'          # 判斷不是 K／D
            '一五\tK\tm\n'              # 欄位數不對
            'ab\tK\tm\tv1\n'            # 不是漢字
            '好\tK\tm\tv1\n'            # 太短
            '一二三四五六七八九十一二\tK\tm\tv1\n'   # 太長
            '𠀀𠀁\tK\tm\tv1\n'          # 非 BMP
            '一六\tK\t\tv1\n',          # 沒有模型
            encoding='utf-8')
        table, bad = judge.load_judgments(self.path)
        self.assertEqual(table, {'一二': ('K', 'm', 'v1'), '一三': ('D', 'm', 'v1')})
        self.assertEqual(bad, 7)

    def test_missing_file_is_empty(self):
        self.assertEqual(judge.load_judgments(self.tmp / 'nope.tsv'), ({}, 0))

    def test_save_writes_header_and_sorted_lines_without_leftovers(self):
        judge.save_judgments(self.path, {'二三': ('D', 'm', 'v'), '一二': ('K', 'm', 'v')})
        lines = self.path.read_text(encoding='utf-8').splitlines()
        self.assertEqual(lines, [judge.JUDGMENTS_HEADER, '一二\tK\tm\tv', '二三\tD\tm\tv'])
        self.assertEqual([p.name for p in self.path.parent.iterdir()], ['judgments.tsv'])
        self.assertEqual(judge.load_judgments(self.path)[1], 0)

    def test_the_committed_file_is_the_header_only_and_parses_clean(self):
        real = build.HERE / 'judgments' / 'judgments.tsv'
        self.assertIn('好韻器灰色詞', real.read_text(encoding='utf-8').splitlines()[0])
        judge.save_judgments(self.path, {})
        self.assertEqual(real.read_bytes(), self.path.read_bytes())
        self.assertEqual(judge.load_judgments(real), ({}, 0))

    def test_recorded_fixture_is_readable(self):
        t = recorded_table()
        self.assertEqual(t['三酸甘油酯'][0], 'K')
        self.assertEqual(t['聚乙烯醇縮丁醛'][0], 'D')
        self.assertEqual(t['分散式雜湊表'][0], 'D')


class ResolveTest(unittest.TestCase):
    J = {'甲乙': ('D', 'gem', 'v'), '丙丁': ('K', 'gem', 'v')}

    def test_gray_with_d_is_deleted_with_r5_and_the_model(self):
        self.assertEqual(rules.resolve('甲乙', 'gray', 'G-single-source', self.J, set()),
                         ('delete', 'R5-ai-incomprehensible', False, 'gem'))
        self.assertIn('gem', rules.reason_for('R5-ai-incomprehensible', 'gem'))
        self.assertIn('AI 判斷：一般讀者難以理解', rules.reason_for('R5-ai-incomprehensible', 'gem'))

    def test_gray_with_k_is_kept_and_unjudged_is_kept_as_pending(self):
        self.assertEqual(rules.resolve('丙丁', 'gray', 'G-single-source', self.J, set()),
                         ('keep', 'G-single-source', False, 'gem'))
        self.assertEqual(rules.resolve('戊己', 'gray', 'G-single-source', self.J, set()),
                         ('keep', 'G-single-source', True, None))

    def test_allowlist_beats_d(self):
        self.assertEqual(rules.resolve('甲乙', 'gray', 'G-single-source', self.J, {'甲乙'}),
                         ('keep', 'K0-allowlist', False, None))

    def test_non_gray_decisions_pass_through(self):
        self.assertEqual(rules.resolve('甲乙', 'keep', 'K1-pass', self.J, set()), ('keep', 'K1-pass', False, None))
        self.assertEqual(rules.resolve('甲乙', 'delete', 'R1-simplified', self.J, set()),
                         ('delete', 'R1-simplified', False, None))


class RunJudgeTest(JudgeBase):
    def test_batches_calls_and_saves_after_every_batch(self):
        snapshots = []
        prov = SpyProvider(recorded_table())
        real = prov.judge

        def spy(words):
            snapshots.append(len(judge.load_judgments(self.path)[0]))   # 呼叫前，檔案裡已存的判斷數
            return real(words)
        prov.judge = spy
        rc, out = self.run_judge(prov)
        self.assertEqual(rc, 0)
        self.assertEqual(prov.requests, 3)
        self.assertEqual([len(b) for b in prov.asked], [3, 3, 1])
        self.assertEqual(snapshots, [0, 3, 6])   # 每判完一批就存了
        table, bad = judge.load_judgments(self.path)
        self.assertEqual((len(table), bad), (7, 0))
        self.assertEqual(table['一二'], ('K', 'recorded', judge.PROMPT_VERSION))
        self.assertEqual(table['一三'][0], 'D')
        self.assertIn('本次判斷 7 筆（保留 4、刪除 3）、仍待判 0 筆', out.texts())

    def test_the_estimate_line_is_printed_before_the_first_call(self):
        prov = SpyProvider(recorded_table())
        rc, out = self.run_judge(prov, gray_total=9)
        first_call = next(i for i, (k, _t) in enumerate(out.log) if k == 'call')
        first_out = next(i for i, (k, _t) in enumerate(out.log) if k == 'out')
        self.assertLess(first_out, first_call)
        self.assertEqual(out.texts()[0], '灰色 9 筆、待判 7 筆、批次 3、估計輸入 %d token、輸出 21 token' % (7 * 7 + 3 * 600))

    def test_estimate_over_max_tokens_exits_3_without_calls_and_force_runs(self):
        prov = SpyProvider(recorded_table())
        rc, out = self.run_judge(prov, max_tokens=100)
        self.assertEqual(rc, 3)
        self.assertEqual(prov.requests, 0)
        self.assertFalse(self.path.exists())
        self.assertTrue(any('--force' in t for t in out.texts()))
        rc, _out = self.run_judge(prov, max_tokens=100, force=True)
        self.assertEqual(rc, 0)
        self.assertEqual(prov.requests, 3)

    def test_max_requests_stops_cleanly_keeps_verdicts_and_the_next_run_asks_only_the_rest(self):
        prov = SpyProvider(recorded_table())
        rc, out = self.run_judge(prov, max_requests=2)
        self.assertEqual(rc, 0)
        self.assertEqual(prov.requests, 2)
        self.assertTrue(any('已達本次上限（2 次請求）' in t for t in out.texts()))
        self.assertEqual(len(judge.load_judgments(self.path)[0]), 6)
        again = SpyProvider(recorded_table())
        rc, out = self.run_judge(again, max_requests=2)
        self.assertEqual(rc, 0)
        self.assertEqual(again.asked, [['四五']])
        self.assertIn('待判 1 筆', out.texts()[0])

    def test_a_provider_error_exits_4_keeps_batch_one_and_a_rerun_resumes(self):
        prov = SpyProvider(recorded_table(), fail_on=2)
        rc, out = self.run_judge(prov)
        self.assertEqual(rc, 4)
        self.assertTrue(any('AI 服務中斷：假的 AI 掛了；已判斷的部分已存檔，再跑一次會接續' in t for t in out.texts()))
        table, _bad = judge.load_judgments(self.path)
        self.assertEqual(sorted(table), sorted(PENDING[:3]))
        again = SpyProvider(recorded_table())
        rc, _out = self.run_judge(again)
        self.assertEqual(rc, 0)
        self.assertEqual(sorted(w for b in again.asked for w in b), sorted(PENDING[3:]))
        self.assertEqual(len(judge.load_judgments(self.path)[0]), 7)

    def test_rejudge_asks_every_gray_word_again(self):
        self.run_judge(SpyProvider(recorded_table()))
        plain = SpyProvider(recorded_table())
        self.run_judge(plain)
        self.assertEqual(plain.asked, [])
        redo = SpyProvider(recorded_table())
        self.run_judge(redo, rejudge=True)
        self.assertEqual(sorted(w for b in redo.asked for w in b), sorted(PENDING))

    def test_unanswered_words_stay_unjudged(self):
        prov = SpyProvider({'一二': 'K'})
        rc, out = self.run_judge(prov)
        self.assertEqual(rc, 0)
        self.assertEqual(list(judge.load_judgments(self.path)[0]), ['一二'])
        self.assertIn('本次判斷 1 筆（保留 1、刪除 0）、仍待判 6 筆', out.texts())

    def test_dry_run_makes_no_calls_and_writes_nothing(self):
        prov = SpyProvider(recorded_table())
        rc, out = self.run_judge(prov, dry_run=True)
        self.assertEqual((rc, prov.requests), (0, 0))
        self.assertFalse(self.path.exists())
        self.assertIn('待判 7 筆', out.texts()[0])

    def test_dry_run_needs_no_provider(self):
        rc, out = self.run_judge(None, dry_run=True)
        self.assertEqual(rc, 0)

    def test_no_provider_exits_2_and_writes_nothing(self):
        rc, out = self.run_judge(None)
        self.assertEqual(rc, 2)
        self.assertFalse(self.path.exists())
        text = '\n'.join(out.texts())
        self.assertIn('GEMINI_API_KEY', text)
        self.assertIn('LEX_AI_URL', text)

    def test_nothing_pending_is_a_clean_zero(self):
        judge.save_judgments(self.path, recorded_table())
        prov = SpyProvider(recorded_table())
        rc, out = self.run_judge(prov, pending=['一二', '一三'])
        self.assertEqual((rc, prov.requests), (0, 0))
        self.assertIn('沒有待判斷的灰色詞', out.texts())


class CliTest(JudgeBase):
    """build.py judge 的命令列：沒有 AI 時不動任何檔案、結束代碼 2。"""

    def run_cli(self, *args, env=None):
        out, err = io.StringIO(), io.StringIO()
        with mock.patch.object(build, 'JUDGMENTS_PATH', self.path), \
                mock.patch.dict('os.environ', env or {}, clear=False), \
                contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
            rc = build.main(['judge'] + list(args))
        return rc, out.getvalue(), err.getvalue()

    def test_no_key_and_no_url_exits_2_with_instructions_and_no_file(self):
        rc, out, err = self.run_cli(env={'GEMINI_API_KEY': '', 'LEX_AI_URL': ''})
        self.assertEqual(rc, 2)
        self.assertIn('GEMINI_API_KEY', err)
        self.assertIn('LEX_AI_URL', err)
        self.assertFalse(self.path.exists())

    def test_recorded_provider_needs_a_file(self):
        rc, _out, err = self.run_cli('--provider', 'recorded')
        self.assertEqual(rc, 2)
        self.assertIn('--recorded', err)

    def test_bad_option_values_are_rejected(self):
        for bad in (['--batch-size', '301'], ['--batch-size', '0'], ['--max-requests', 'x']):
            with self.assertRaises(SystemExit):
                with contextlib.redirect_stderr(io.StringIO()):
                    build.main(['judge', '--dry-run'] + bad)

    def fake_prepare(self):
        tmp = self.tmp / 'cli-rules'
        tmp.mkdir()
        ctx = rules.load_rule_context(test_rules.make_paths(tmp, keep=['分散式雜湊表']), check_counts=False)
        parsed = {'demo': parse.collect(fixture_rows(), {}, {}, 'demo'),
                  'other': parse.collect([('你好', 'ㄋㄧˇ ㄏㄠˇ', 900)], {}, {}, 'other')}
        return mock.patch.object(build, '_prepare', return_value=(None, ctx, parsed, {}, {}))

    def test_recorded_run_judges_only_the_gray_words_and_rebuilds_on_request(self):
        calls = []
        with self.fake_prepare(), \
                mock.patch.object(build, 'cmd_build', side_effect=lambda *a, **k: calls.append('build')), \
                mock.patch.object(build, 'cmd_verify', side_effect=lambda **k: calls.append('verify') or 0):
            rc, out, _err = self.run_cli('--provider', 'recorded', '--recorded', str(FIXTURE),
                                         '--batch-size', '2', '--rebuild')
        self.assertEqual(rc, 0)
        self.assertEqual(calls, ['build', 'verify'])
        table, _bad = judge.load_judgments(self.path)
        # 灰色：三酸甘油酯、聚乙烯醇縮丁醛、月光曲（分散式雜湊表在救回清單、你好有兩個來源）；錄好的判斷表裡沒有月光曲
        self.assertEqual(sorted(table), ['三酸甘油酯', '聚乙烯醇縮丁醛'])
        self.assertIn('灰色 3 筆、待判 3 筆、批次 2', out)

    def test_dry_run_does_not_rebuild_or_write(self):
        calls = []
        with self.fake_prepare(), \
                mock.patch.object(build, 'cmd_build', side_effect=lambda *a, **k: calls.append('build')):
            rc, out, _err = self.run_cli('--dry-run', '--rebuild')
        self.assertEqual((rc, calls), (0, []))
        self.assertFalse(self.path.exists())
        self.assertIn('待判 3 筆', out)

    def test_a_failed_run_does_not_rebuild(self):
        calls = []
        with self.fake_prepare(), \
                mock.patch.object(build, 'cmd_build', side_effect=lambda *a, **k: calls.append('build')):
            rc, _out, _err = self.run_cli('--provider', 'recorded', '--recorded', str(FIXTURE),
                                          '--max-tokens', '10', '--rebuild')
        self.assertEqual((rc, calls), (3, []))


def fixture_rows():
    """單一來源的小詞庫包：兩個詞會被判斷（K、D），一個沒判，一個在救回清單。"""
    return [('你好', 'ㄋㄧˇ ㄏㄠˇ', 500),
            ('三酸甘油酯', 'ㄙㄢ ㄙㄨㄢ ㄍㄢ ㄧㄡˊ ㄓˇ', 3),
            ('聚乙烯醇縮丁醛', 'ㄐㄩˋ ㄧˇ ㄒㄧ ㄔㄨㄣˊ ㄙㄨㄛ ㄉㄧㄥ ㄑㄩㄢˊ', 0),
            ('分散式雜湊表', 'ㄈㄣ ㄙㄢˋ ㄕˋ ㄗㄚˊ ㄔㄡˋ ㄅㄧㄠˇ', 0),
            ('月光曲', 'ㄩㄝˋ ㄍㄨㄤ ㄑㄩˇ', 7)]


class RebuildTest(JudgeBase):
    CFG = {'id': 'demo', 'name': '示範詞庫', 'description': '測試用', 'licence_spdx': 'MIT'}

    def setUp(self):
        super().setUp()
        (self.tmp / 'r').mkdir()
        self.paths = test_rules.make_paths(self.tmp / 'r', keep=['分散式雜湊表'])
        self.ctx = rules.load_rule_context(self.paths, check_counts=False)
        # 把「你好」另放第二個來源，讓它不是灰色
        self.parsed = {'demo': parse.collect(fixture_rows(), {}, {}, 'demo'),
                       'other': parse.collect([('你好', 'ㄋㄧˇ ㄏㄠˇ', 900)], {}, {}, 'other')}

    def build_pack(self, judgments):
        res = rules.apply_rules(self.parsed, self.ctx, judgments)['demo']
        out = self.tmp / 'out'
        meta = pack.write_pack(
            out, self.CFG, res['entries'],
            {'stats': res['stats'], 'gray': res['gray'], 'gray_pending': res['gray_pending'],
             'gray_policy': 'p1', 'judged_with': res['judged_with']},
            sources=test_pack.SRC_META)
        return res, meta

    def test_without_verdicts_every_gray_word_stays_and_is_pending(self):
        res, meta = self.build_pack({})
        words = {e['w'] for e in res['entries']}
        self.assertTrue({'三酸甘油酯', '聚乙烯醇縮丁醛', '分散式雜湊表', '月光曲'} <= words)
        self.assertEqual((res['gray'], res['gray_pending'], res['judged_with']), (3, 3, []))
        self.assertEqual(meta['judged_with'], [])
        self.assertEqual(res['removed'], [])
        # 分散式雜湊表在救回清單（K0），所以不是灰色；灰色是另外三個
        self.assertEqual({r['w'] for r in res['gray_rows']}, {'三酸甘油酯', '聚乙烯醇縮丁醛', '月光曲'})

    def test_after_judging_d_is_removed_with_r5_k_is_kept_unjudged_is_pending(self):
        before, meta0 = self.build_pack({})
        judgments = {'三酸甘油酯': ('K', 'recorded', 'lex03-v1'), '聚乙烯醇縮丁醛': ('D', 'recorded', 'lex03-v1'),
                     '分散式雜湊表': ('D', 'recorded', 'lex03-v1')}
        res, meta = self.build_pack(judgments)
        words = {e['w'] for e in res['entries']}
        self.assertNotIn('聚乙烯醇縮丁醛', words)
        self.assertIn('三酸甘油酯', words)
        self.assertIn('月光曲', words)                      # 沒判斷：保留
        self.assertIn('分散式雜湊表', words)                # 救回清單贏過 D
        row = [r for r in res['removed'] if r['w'] == '聚乙烯醇縮丁醛']
        self.assertEqual(len(row), 1)
        self.assertEqual(row[0]['rule'], 'R5-ai-incomprehensible')
        self.assertIn('recorded', row[0]['reason'])
        self.assertEqual(res['stats']['rules'], {'R5-ai-incomprehensible': 1})
        self.assertEqual((res['gray'], res['gray_pending'], res['stats']['gray_keep'],
                          res['stats']['gray_deleted']), (3, 1, 1, 1))
        self.assertEqual(meta['judged_with'], ['recorded'])
        self.assertEqual(len(res['entries']) + len(res['removed']), res['stats']['in_scope'])
        self.assertNotEqual(meta['version'], meta0['version'])   # 內容變了，版本自動更新

    def test_version_does_not_change_when_judgments_change_nothing(self):
        _r, meta0 = self.build_pack({})
        _r, meta1 = self.build_pack({'三酸甘油酯': ('K', 'recorded', 'lex03-v1')})
        self.assertEqual(meta0['version'], meta1['version'])

    def test_report_and_verify_stay_consistent_after_judging(self):
        judgments = {'三酸甘油酯': ('K', 'recorded', 'lex03-v1'), '聚乙烯醇縮丁醛': ('D', 'recorded', 'lex03-v1')}
        res, meta = self.build_pack(judgments)
        reports = self.tmp / 'repo' / 'tools' / 'lexicon' / 'reports' / 'demo'
        pack.write_removed(reports / 'removed.ndjson', res['removed'])
        stats = report.build_stats(self.CFG, meta, res['removed'], res['gray_rows'], [], [])
        report.write_report(reports, self.CFG, meta, stats, res['removed'], res['gray_rows'], [], [])
        self.assertEqual((stats['gray_keep'], stats['gray_deleted'], stats['gray_pending']), (1, 1, 1))
        self.assertEqual(stats['judged_with'], ['recorded'])
        self.assertEqual(pack._verify_report(self.tmp / 'repo', 'demo', meta), [])
        text = (reports / 'REPORT.md').read_text(encoding='utf-8')
        self.assertIn('R5-ai-incomprehensible', text)
        self.assertIn('已判斷的模型：recorded', text)
        # 報告的數字被改壞，verify 要抓到
        stats['gray_deleted'] = 0
        (reports / 'stats.json').write_text(json.dumps(stats, ensure_ascii=False), encoding='utf-8')
        self.assertTrue(pack._verify_report(self.tmp / 'repo', 'demo', meta))

    def test_notice_mentions_the_ai_pass_only_when_it_happened(self):
        _r, meta0 = self.build_pack({})
        _r, meta1 = self.build_pack({'聚乙烯醇縮丁醛': ('D', 'recorded', 'lex03-v1')})
        t0 = pack.pack_notice(dict(self.CFG), dict(meta0, sources=[]), '', 0)
        t1 = pack.pack_notice(dict(self.CFG), dict(meta1, sources=[]), '', 1)
        self.assertNotIn('AI（', t0)
        self.assertIn('AI（recorded）', t1)


class QuotaVerifyTest(test_pack.PackTestBase):
    """verify：待判灰色詞估算超過免費額度就列為問題。"""

    def set_pending(self, n):
        meta_path = self.out / 'meta.json'
        meta = json.loads(meta_path.read_text(encoding='utf-8'))
        meta['gray_pending'] = n
        meta_path.write_text(json.dumps(meta, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

    def test_small_pending_counts_pass(self):
        self.build()
        self.assertEqual(self.problems(), [])
        self.set_pending(60000)      # 剛好 400 次請求、約 84 萬 token：還在額度內
        self.assertEqual(self.problems(), [])

    def test_more_than_400_requests_is_flagged(self):
        self.build()
        self.set_pending(60001)
        self.assertTrue(any('待判灰色詞超過免費額度估計' in p for p in self.problems()))

    def test_judged_with_must_be_a_list_of_names(self):
        self.build()
        meta_path = self.out / 'meta.json'
        meta = json.loads(meta_path.read_text(encoding='utf-8'))
        meta['judged_with'] = 'recorded'
        meta_path.write_text(json.dumps(meta, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
        self.assertTrue(any('judged_with' in p for p in self.problems()))
        meta['judged_with'] = ['recorded']
        meta_path.write_text(json.dumps(meta, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
        self.assertEqual(self.problems(), [])


if __name__ == '__main__':
    unittest.main()
