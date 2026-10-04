"""刪除報告（REPORT.md、stats.json）的測試：數字對得上、樣本可重現、verify 抓得到不一致、網站不讀報告。"""
import contextlib
import io
import json
import re
import tempfile
import unittest
from pathlib import Path
from unittest import mock

import build
from lex import estimate_tokens, pack, parse, report, rules
from tests import test_rules

CFG = {'id': 'demo', 'name': '示範詞庫', 'description': '測試用', 'licence_spdx': 'MIT'}
SRC_META = [{'id': 'demo-src', 'repo': 'https://github.com/o/s', 'commit': 'c' * 40, 'licence_spdx': 'MIT'}]
HAN = [chr(0x4E00 + i) for i in range(200)]


def removed_rows():
    rows = []
    for i in range(45):
        rows.append({'w': '㹴' + HAN[i], 'z': 'ㄍㄥˇ ㄧ', 'p': i, 'rule': 'R2-rare-char',
                     'reason': '含罕用字「㹴」（不在教育部常用／次常用字與 Big5 內）', 'src': ['demo'], 'n': 1})
    for i in range(3):
        rows.append({'w': HAN[100 + 2 * i] + HAN[101 + 2 * i], 'z': 'ㄧ ㄧ', 'p': 1, 'rule': 'R3-china-term',
                     'reason': '中國用語（台灣多作「某」）', 'src': ['demo'], 'n': 1})
    rows.append({'w': '二条', 'z': 'ㄦˋ ㄊㄧㄠˊ', 'p': 0, 'rule': 'R1-simplified', 'reason': '含簡體字「条」',
                 'src': ['demo'], 'n': 1})
    return rows


def gray_rows():
    out = [{'w': HAN[150 + i] + HAN[151 + i], 'z': 'ㄧ ㄧ', 'p': i, 'rule': 'G-single-source'} for i in range(25)]
    out.append({'w': '創建', 'z': 'ㄔㄨㄤˋ ㄐㄧㄢˋ', 'p': 3, 'rule': 'G-china-term'})
    return out


MULTI = [{'w': '一下', 'z': 'ㄧ ㄒㄧㄚˋ', 'others': ['ㄧˊ ㄒㄧㄚˋ']}]
CHINA = [{'w': '支持', 'z': 'ㄓ ㄔˊ', 'p': 9318, 'tw': '支援'}]


class ReportBase(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self._tmp.cleanup)
        self.repo = Path(self._tmp.name)
        self.reports = self.repo / 'tools' / 'lexicon' / 'reports' / 'demo'

    def make(self, version_tail=None, removed=None, gray=None):
        """寫一個小詞庫包與它的報告到暫存資料夾，回傳 (meta, stats)。"""
        removed = removed_rows() if removed is None else removed
        gray = gray_rows() if gray is None else gray
        entries = [{'w': HAN[2 * i] + HAN[2 * i + 1], 'z': 'ㄧ ㄧ', 'p': i + (version_tail or 0)} for i in range(10)]
        out = self.repo / 'data' / 'packs' / 'demo'
        meta = pack.write_pack(
            out, CFG, entries,
            {'stats': {'in_scope': len(entries) + len(removed), 'skipped_single': 7, 'merged_lines': 3},
             'gray': len(gray), 'gray_pending': len(gray), 'gray_policy': 'p1'},
            sources=SRC_META, licence_files=[])
        pack.write_removed(self.reports / 'removed.ndjson', removed)
        stats = report.build_stats(CFG, meta, removed, gray, MULTI, CHINA)
        report.write_report(self.reports, CFG, meta, stats, removed, gray, MULTI, CHINA)
        return meta, stats

    def read(self, name):
        return (self.reports / name).read_text(encoding='utf-8')


class StatsTest(ReportBase):
    def test_identities_hold_and_verify_is_clean(self):
        meta, stats = self.make()
        self.assertEqual(stats['kept'], meta['entries'])
        self.assertEqual(stats['kept'] + stats['removed'], stats['in_scope'])
        self.assertEqual(sum(stats['by_rule'].values()), stats['removed'])
        self.assertLessEqual(stats['gray_pending'], stats['gray'])
        self.assertEqual(stats['by_rule'], {'R1-simplified': 1, 'R2-rare-char': 45, 'R3-china-term': 3})
        self.assertEqual(stats['gray_by_rule'], {'G-china-term': 1, 'G-single-source': 25})
        self.assertEqual(stats['est'], {'batch': 150, 'requests': 1, 'in_tokens': 26 * 7 + 600, 'out_tokens': 78})
        self.assertEqual(pack._verify_report(self.repo, 'demo', meta), [])

    def test_stats_json_is_sorted_indented_and_ends_with_newline(self):
        self.make()
        text = self.read('stats.json')
        self.assertTrue(text.endswith('}\n'))
        self.assertEqual(text, json.dumps(json.loads(text), ensure_ascii=False, indent=2, sort_keys=True) + '\n')

    def test_top_chars_are_counted_from_r1_r2_reasons_only(self):
        _meta, stats = self.make()
        self.assertEqual(stats['top_chars'][0], ['㹴', 45])
        self.assertEqual(stats['top_chars'][1], ['条', 1])
        self.assertEqual(len(stats['top_chars']), 2)


class SamplesTest(ReportBase):
    def test_each_rule_has_at_most_twenty_samples_and_exactly_min_20_n(self):
        self.make()
        text = self.read('REPORT.md')
        for rule, n in (('R2-rare-char', 45), ('R3-china-term', 3), ('R1-simplified', 1)):
            m = re.search(r'### %s：.*?\n\n(.*?)(?:\n\n|\Z)' % rule, text, re.S)
            rows = [ln for ln in m.group(1).split('\n') if ln.startswith('| ')][2:]  # 去掉表頭與分隔線
            self.assertEqual(len(rows), min(20, n), rule)

    def test_pick_samples_is_deterministic_and_seed_dependent(self):
        rows = removed_rows()
        a = report.pick_samples(rows, 20, 'demo:2.aaaa:R2-rare-char')
        self.assertEqual(a, report.pick_samples(list(reversed(rows)), 20, 'demo:2.aaaa:R2-rare-char'))
        self.assertEqual(a, sorted(a, key=lambda r: r['w']))
        self.assertNotEqual(a, report.pick_samples(rows, 20, 'demo:2.bbbb:R2-rare-char'))
        self.assertEqual(report.pick_samples(rows[:5], 20, 'x'), sorted(rows[:5], key=lambda r: r['w']))

    def test_two_runs_are_byte_identical_and_a_new_version_changes_the_sample_choice(self):
        self.make()
        first = (self.read('REPORT.md'), self.read('stats.json'))
        self.make()
        self.assertEqual(first, (self.read('REPORT.md'), self.read('stats.json')))
        self.make(version_tail=5)  # 內容變了 → 版本變了 → 抽樣種子變了
        self.assertNotEqual(first[0], self.read('REPORT.md'))
        r2 = lambda t: re.search(r'### R2-rare-char：.*?\n\n(.*?)\n\n', t, re.S).group(1)
        self.assertNotEqual(r2(first[0]), r2(self.read('REPORT.md')))


class ReportTextTest(ReportBase):
    def test_report_has_every_section_in_traditional_chinese(self):
        self.make()
        text = self.read('REPORT.md')
        self.assertTrue(text.startswith('# 示範詞庫（demo）刪除報告\n'))
        for heading in ('## 總覽', '## 各原因統計', '## 各原因樣本', '## 灰色地帶（待 AI 判斷）', '## 最常造成刪除的字',
                        '## 中國用語對照表吻合但保留', '## 多讀音詞選用的讀音', '## 誤刪怎麼救回'):
            self.assertIn(heading, text)
        for needle in ('版本：', '建置日期：', '清洗規則版本：', '灰色政策：', '估算請求次數', 'rescue 詞',
                       'ㄧˊ ㄒㄧㄚˋ', '一下', '創建', '支持', '押韻比對不看聲調', '本報告只給人看，網站不會讀取'):
            self.assertIn(needle, text)

    def test_report_has_no_timestamp_other_than_meta_built(self):
        meta, _ = self.make()
        dates = set(re.findall(r'\d{4}-\d{2}-\d{2}', self.read('REPORT.md')))
        self.assertEqual(dates, {meta['built']})


class VerifyReportTest(ReportBase):
    def test_kept_off_by_one_is_reported(self):
        meta, _ = self.make()
        path = self.reports / 'stats.json'
        stats = json.loads(path.read_text(encoding='utf-8'))
        stats['kept'] += 1
        path.write_text(json.dumps(stats), encoding='utf-8')
        joined = '\n'.join(pack._verify_report(self.repo, 'demo', meta))
        self.assertIn('stats.kept', joined)
        self.assertIn('不等於範圍內的詞', joined)

    def test_removed_count_and_rule_sums_are_checked(self):
        meta, _ = self.make()
        path = self.reports / 'removed.ndjson'
        lines = path.read_text(encoding='utf-8').splitlines()
        path.write_text('\n'.join(lines[:-1]) + '\n', encoding='utf-8')
        joined = '\n'.join(pack._verify_report(self.repo, 'demo', meta))
        self.assertIn('stats.removed', joined)
        self.assertIn('by_rule', joined)

    def test_missing_report_and_stale_version_are_reported(self):
        meta, _ = self.make()
        path = self.reports / 'stats.json'
        stats = json.loads(path.read_text(encoding='utf-8'))
        stats['version'] = '2.0000000000'
        path.write_text(json.dumps(stats), encoding='utf-8')
        self.assertIn('過期', '\n'.join(pack._verify_report(self.repo, 'demo', meta)))
        (self.reports / 'REPORT.md').unlink()
        self.assertIn('缺少', '\n'.join(pack._verify_report(self.repo, 'demo', meta)))

    def test_gray_pending_cannot_exceed_gray(self):
        meta, _ = self.make()
        path = self.reports / 'stats.json'
        stats = json.loads(path.read_text(encoding='utf-8'))
        stats['gray_pending'] = stats['gray'] + 1
        path.write_text(json.dumps(stats), encoding='utf-8')
        self.assertIn('gray_pending', '\n'.join(pack._verify_report(self.repo, 'demo', meta)))


class HelpersTest(unittest.TestCase):
    def test_estimate_tokens_matches_the_research_model(self):
        est = estimate_tokens(33800)
        self.assertEqual(est['requests'], 226)
        self.assertEqual(est['out_tokens'], 33800 * 3)
        self.assertEqual(est['in_tokens'], 33800 * 7 + 226 * 600)
        self.assertEqual(estimate_tokens(0), {'requests': 0, 'in_tokens': 0, 'out_tokens': 0})
        self.assertEqual(estimate_tokens(151)['requests'], 2)
        self.assertEqual(estimate_tokens(300, 100)['requests'], 3)

    def test_collect_reports_the_chosen_reading_of_multi_reading_words(self):
        rows = [('一下', 'ㄧˊ ㄒㄧㄚˋ', 5), ('一下', 'ㄧ ㄒㄧㄚˋ', 3), ('你好', 'ㄋㄧˇ ㄏㄠˇ', 1)]
        multi = []
        entries, _removed, _stats = parse.collect(rows, {}, {}, 'a', multi)
        self.assertEqual(len(multi), 1)
        self.assertEqual(multi[0]['w'], '一下')
        chosen = {e['w']: e['z'] for e in entries}['一下']
        self.assertEqual(multi[0]['z'], chosen)
        self.assertEqual(sorted([multi[0]['z']] + multi[0]['others']), ['ㄧ ㄒㄧㄚˋ', 'ㄧˊ ㄒㄧㄚˋ'])
        # 不給 multi_out 時回傳值一樣
        self.assertEqual(parse.collect(rows, {}, {}, 'a')[0], entries)


class RescueTest(unittest.TestCase):
    """build.py rescue：加進保留名單、印出可貼進修正檔的那一行；重建後詞就回來。"""
    W = '打印機'
    Z = 'ㄉㄚˇ ㄧㄣˋ ㄐㄧ'

    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self._tmp.cleanup)
        self.tmp = Path(self._tmp.name)
        self.keep = self.tmp / 'keep.json'
        self.keep.write_text('[]\n', encoding='utf-8')
        self.reports = self.tmp / 'reports'
        (self.reports / 'demo').mkdir(parents=True)
        row = {'w': self.W, 'z': self.Z, 'p': 3, 'rule': 'R3-china-term',
               'reason': '中國用語（台灣多作「印表機」）', 'src': ['demo'], 'n': 1}
        bad = {'w': '壞音節', 'z': 'ㄅㄢˋ ㄧ', 'p': 1, 'rule': 'R0-syllables', 'reason': '注音音節數與字數不符',
               'src': ['demo'], 'n': 1}
        pack.write_removed(self.reports / 'demo' / 'removed.ndjson', [row, bad])
        for patcher in (mock.patch.object(build, 'KEEP_PATH', self.keep),
                        mock.patch.object(build, 'REPORTS_ROOT', self.reports)):
            patcher.start()
            self.addCleanup(patcher.stop)

    def run_cli(self, *args):
        out, err = io.StringIO(), io.StringIO()
        with contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
            rc = build.main(['rescue'] + list(args))
        return rc, out.getvalue(), err.getvalue()

    def keep_words(self):
        return json.loads(self.keep.read_text(encoding='utf-8'))

    def test_rescue_adds_the_word_and_prints_pack_rule_reason_and_the_overrides_line(self):
        rc, out, _err = self.run_cli(self.W)
        self.assertEqual(rc, 0)
        self.assertEqual(self.keep_words(), [self.W])
        self.assertIn('demo：R3-china-term（中國用語（台灣多作「印表機」））', out)
        self.assertIn('{"w":"打印機","z":"ㄉㄚˇ ㄧㄣˋ ㄐㄧ","p":3}', out)
        self.assertIn('重新執行 npm run lexicon:build 後生效', out)
        # 印出的那一行就是網站修正檔 added 吃的格式
        line = re.search(r'added：(\{.*\})', out).group(1)
        self.assertEqual(json.loads(line), {'w': self.W, 'z': self.Z, 'p': 3})

    def test_after_a_fixture_rebuild_the_word_is_back_and_not_removed(self):
        (self.tmp / 'a').mkdir()
        before = rules.load_rule_context(test_rules.make_paths(self.tmp / 'a'), check_counts=False)
        rows = [(self.W, self.Z, 3), ('你好', 'ㄋㄧˇ ㄏㄠˇ', 500)]
        parsed = {'demo': parse.collect(rows, {}, {}, 'demo')}
        res = rules.apply_rules(parsed, before)['demo']
        self.assertEqual([r['w'] for r in res['removed']], [self.W])
        self.assertEqual(self.run_cli(self.W)[0], 0)
        paths = test_rules.make_paths(self.tmp / 'a')
        paths['keep'] = self.keep
        after = rules.apply_rules(parsed, rules.load_rule_context(paths, check_counts=False))['demo']
        self.assertIn(self.W, {e['w'] for e in after['entries']})
        self.assertEqual(after['removed'], [])

    def test_word_no_pack_removed_is_still_added_with_a_note(self):
        rc, out, _err = self.run_cli('你好')
        self.assertEqual(rc, 0)
        self.assertEqual(self.keep_words(), ['你好'])
        self.assertIn('目前沒有詞庫包刪除這個詞，已加入保留名單', out)

    def test_format_failures_are_explained_not_offered_as_an_overrides_line(self):
        rc, out, _err = self.run_cli('壞音節')
        self.assertEqual(rc, 0)
        self.assertIn('救回名單救不回來', out)
        self.assertNotIn('貼進 data/wordlist-overrides.json', out)

    def test_invalid_input_exits_2_and_writes_nothing(self):
        before = self.keep.read_bytes()
        for bad in ('abc', '好', '一二三四五六七八九十一二', 'ａｂ', '𠀀𠀁'):
            rc, out, err = self.run_cli(self.W, bad)
            self.assertEqual(rc, 2, bad)
            self.assertIn('只能救回 2～11 個漢字的詞', err)
            self.assertEqual(self.keep.read_bytes(), before, bad)
            self.assertEqual(out, '', bad)

    def test_rescue_twice_keeps_one_copy_and_the_list_stays_sorted(self):
        self.run_cli('蘋果', self.W)
        self.run_cli(self.W)
        self.assertEqual(self.keep_words(), sorted({'蘋果', self.W}))
        self.assertEqual(self.keep.read_text(encoding='utf-8'),
                         json.dumps(sorted({'蘋果', self.W}), ensure_ascii=False, indent=2) + '\n')

    def test_the_real_keep_json_is_untouched_by_these_tests(self):
        real = json.loads((build.HERE / 'rules' / 'keep.json').read_text(encoding='utf-8'))
        self.assertEqual(real, sorted(set(real)))


class CommittedReportsTest(unittest.TestCase):
    PACKS = ('chewing', 'mcbopomofo', 'vanguard-tw')

    def test_committed_reports_agree_with_the_committed_packs(self):
        for pid in self.PACKS:
            meta = json.loads((build.REPO / 'data' / 'packs' / pid / 'meta.json').read_text(encoding='utf-8'))
            self.assertEqual(pack._verify_report(build.REPO, pid, meta), [], pid)
            text = (build.HERE / 'reports' / pid / 'REPORT.md').read_text(encoding='utf-8')
            self.assertIn('刪除報告', text)
            self.assertIn('待 AI 判斷', text)
            stats = json.loads((build.HERE / 'reports' / pid / 'stats.json').read_text(encoding='utf-8'))
            self.assertEqual(stats['gray_pending'], meta['gray_pending'])

    def test_the_site_never_references_the_reports(self):
        hits = []
        files = [build.REPO / 'index.html'] + sorted((build.REPO / 'js').rglob('*.js'))
        for f in files:
            if 'tools/lexicon/reports' in f.read_text(encoding='utf-8'):
                hits.append(str(f))
        self.assertEqual(hits, [])
        self.assertFalse((build.REPO / 'data' / 'packs' / 'chewing' / 'REPORT.md').exists())


if __name__ == '__main__':
    unittest.main()
