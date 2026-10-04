"""規則層測試：R1 簡體、R2 罕用字、R3 中國用語（詞頻守門）、K0 保留清單、灰色、Big5 自我檢查。

規則輸入用 fixtures/rule-inputs 裡的小型節錄（從真實檔案複製而來，不是完整字表）。
"""
import json
import tempfile
import unittest
from pathlib import Path

import build
from lex import LexError, pack, parse, rules

FIX = Path(__file__).resolve().parent / 'fixtures' / 'rule-inputs'
POLY = {}


def make_paths(tmp, allow='祢\t詩歌中稱呼神的「祢」\n', keep=None, overrides_added=None, extra=None):
    """把規則輸入的路徑湊齊；需要的可變檔案寫到暫存資料夾。"""
    tmp = Path(tmp)
    (tmp / 'char-allow.txt').write_text('# 測試\n' + allow, encoding='utf-8')
    (tmp / 'keep.json').write_text(json.dumps(keep or [], ensure_ascii=False), encoding='utf-8')
    (tmp / 'overrides.json').write_text(
        json.dumps({'version': 2, 'removed': [], 'added': overrides_added or []}, ensure_ascii=False),
        encoding='utf-8')
    paths = {'st': FIX / 'STCharacters.txt', 'ts': FIX / 'TSCharacters.txt',
             'twphrases': FIX / 'TWPhrases.txt', 'moe_common': FIX / 'moe-common.txt',
             'moe_secondary': FIX / 'moe-secondary.txt', 'char_allow': tmp / 'char-allow.txt',
             'keep': tmp / 'keep.json', 'overrides': tmp / 'overrides.json'}
    if extra is not None:
        (tmp / 'china-extra.txt').write_text(extra, encoding='utf-8')
        paths['china_extra'] = tmp / 'china-extra.txt'
    return paths


def ev(n=2, freq=500, freqs=None):
    return {'n': n, 'freq': freq, 'freqs': freqs if freqs is not None else [freq] * n}


class RuleTestBase(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self._tmp.cleanup)
        self.tmp = Path(self._tmp.name)

    def ctx(self, **kw):
        gray = kw.pop('gray_policy', 'p1')
        return rules.load_rule_context(make_paths(self.tmp, **kw), check_counts=False, gray_policy=gray)


class CharRulesTest(RuleTestBase):
    def test_simplified_only_char_is_deleted_with_r1(self):
        self.assertEqual(rules.classify('电脑', 'ㄉㄧㄢˋ ㄋㄠˇ', ev(), self.ctx()),
                         ('delete', 'R1-simplified', '电'))

    def test_st_key_that_is_big5_or_ts_key_is_kept(self):
        ctx = self.ctx()
        self.assertEqual(rules.classify('峰會', 'ㄈㄥ ㄏㄨㄟˋ', ev(), ctx)[:2], ('keep', 'K1-pass'))
        self.assertEqual(rules.classify('推薦', 'ㄊㄨㄟ ㄐㄧㄢˋ', ev(), ctx)[:2], ('keep', 'K1-pass'))
        # 峰、薦 都不在範本的教育部字表，靠 Big5 才通過
        self.assertNotIn('峰', rules.load_char_list(FIX / 'moe-common.txt'))
        self.assertIn('峰', ctx.taiwan_chars)

    def test_rare_char_is_deleted_with_r2(self):
        self.assertEqual(rules.classify('㹴犬', 'ㄍㄥˇ ㄑㄩㄢˇ', ev(), self.ctx()),
                         ('delete', 'R2-rare-char', '㹴'))

    def test_char_allow_exempts_r1_and_empty_allow_does_not(self):
        word, z = '感謝祢', 'ㄍㄢˇ ㄒㄧㄝˋ ㄋㄧˇ'
        self.assertEqual(rules.classify(word, z, ev(), self.ctx())[:2], ('keep', 'K1-pass'))
        self.assertEqual(rules.classify(word, z, ev(), self.ctx(allow='')),
                         ('delete', 'R1-simplified', '祢'))

    def test_char_allow_also_exempts_r2(self):
        ctx = self.ctx(allow='㹴\t測試\n')
        self.assertEqual(rules.classify('㹴犬', 'ㄍㄥˇ ㄑㄩㄢˇ', ev(), ctx)[:2], ('keep', 'K1-pass'))

    def test_simp_only_set_excludes_big5_ts_moe_and_allow(self):
        ctx = self.ctx()
        self.assertIn('电', ctx.simp_only)
        self.assertIn('条', ctx.simp_only)
        for ch in '峰群床祢':
            self.assertNotIn(ch, ctx.simp_only, ch)

    def test_r0_failures_are_deleted_first(self):
        ctx = self.ctx()
        self.assertEqual(rules.classify('倒三角形', 'ㄉㄠˋ ㄙㄢ ㄐㄧㄠˇ', ev(), ctx),
                         ('delete', 'R0-syllables', None))
        self.assertEqual(rules.classify('二〇二', 'ㄦˋ ㄌㄧㄥˊ ㄦˋ', ev(), ctx)[:2], ('delete', 'R0-nonhan'))

    def test_daosanjiaoxing_is_a_source_defect_not_an_over_eager_rule(self):
        # 唯音來源的讀音只有 3 個音節（缺 ㄒㄧㄥˊ）→ R0 刪除；小麥注音的 4 個音節正確 → 留下
        ctx = self.ctx()
        self.assertEqual(rules.classify('倒三角形', 'ㄉㄠˋ ㄙㄢ ㄐㄧㄠˇ ㄒㄧㄥˊ', ev(n=1, freq=2), ctx)[:2],
                         ('gray', 'G-single-source'))
        self.assertEqual(rules.classify('倒三角形', 'ㄉㄠˋ ㄙㄢ ㄐㄧㄠˇ ㄒㄧㄥˊ', ev(n=2, freq=2), ctx)[:2],
                         ('keep', 'K1-pass'))

    def test_reason_texts_are_traditional_and_name_the_char(self):
        self.assertEqual(rules.reason_for('R1-simplified', '电'), '含簡體字「电」')
        self.assertIn('罕用字「㹴」', rules.reason_for('R2-rare-char', '㹴'))
        self.assertEqual(rules.reason_for('R3-china-term', '支援'), '中國用語（台灣多作「支援」）')
        self.assertEqual(rules.reason_for('R0-nonbmp'), parse.R0_REASONS['R0-nonbmp'])


class Big5Test(unittest.TestCase):
    def test_real_codec_gives_expected_level_counts(self):
        l1, l2 = rules.big5_levels()
        self.assertEqual((len(l1), len(l2)), (5401, 7650))
        rules.check_big5(l1, l2)

    def test_patched_count_stops_the_build(self):
        l1, l2 = rules.big5_levels()
        with self.assertRaises(LexError) as cm:
            rules.check_big5(l1 - {'一'}, l2)
        self.assertIn('Big5', str(cm.exception))
        self.assertIn('5400', str(cm.exception))
        with self.assertRaises(LexError):
            rules.check_big5(l1, l2 | {'㹴'})


class RuleInputTest(RuleTestBase):
    def test_moe_count_self_check_stops_on_a_truncated_list(self):
        with self.assertRaises(LexError) as cm:
            rules.load_rule_context(make_paths(self.tmp), check_counts=True)
        self.assertIn('4808', str(cm.exception))

    def test_char_list_skips_comments_and_markers(self):
        p = self.tmp / 'list.txt'
        p.write_text('# 汉字共 3 个\n一\n堔※\n二\n', encoding='utf-8')
        self.assertEqual(rules.load_char_list(p), {'一', '堔', '二'})

    def test_twphrases_only_keys_of_length_two_or_more_with_a_different_value(self):
        p = self.tmp / 'tw.txt'
        p.write_text('# 標頭\n支持\t支援\n字\t詞\n相同\t相同\n多值\t甲 乙\n', encoding='utf-8')
        self.assertEqual(rules.load_twphrases(p), {'支持': '支援', '多值': '甲'})

    def test_char_allow_needs_exactly_one_char(self):
        p = self.tmp / 'a.txt'
        p.write_text('兩字\t原因\n', encoding='utf-8')
        with self.assertRaises(LexError):
            rules.load_char_allow(p)

    def test_shipped_real_char_allow_file_parses_and_has_the_seeds(self):
        got = rules.load_char_allow(build.HERE / 'rules' / 'char-allow.txt')
        for ch in '庄厘祢疱咤咏':
            self.assertIn(ch, got)
            self.assertTrue(got[ch], ch + ' 要有原因')


class ChinaTermTest(RuleTestBase):
    def test_common_taiwan_word_is_kept_by_the_frequency_guard(self):
        ctx = self.ctx()
        self.assertEqual(rules.classify('支持', 'ㄓ ㄔˊ', ev(freq=9318), ctx)[:2], ('keep', 'K1-pass'))
        self.assertEqual(rules.classify('設備', 'ㄕㄜˋ ㄅㄟˋ', ev(freq=99), ctx)[:2], ('delete', 'R3-china-term'))
        self.assertEqual(rules.classify('設備', 'ㄕㄜˋ ㄅㄟˋ', ev(freq=100), ctx)[:2], ('keep', 'K1-pass'))

    def test_rare_china_term_is_deleted_and_names_the_taiwan_form(self):
        d, rule, tw = rules.classify('支持', 'ㄓ ㄔˊ', ev(freq=50), self.ctx())
        self.assertEqual((d, rule, tw), ('delete', 'R3-china-term', '支援'))
        self.assertIn('支援', rules.reason_for(rule, tw))

    def test_r3_wins_over_gray(self):
        self.assertEqual(rules.classify('阿司匹林', 'ㄚ ㄙ ㄆㄧˇ ㄌㄧㄣˊ', ev(n=1, freq=0), self.ctx())[:2],
                         ('delete', 'R3-china-term'))

    def test_containment_is_never_used(self):
        d = rules.classify('打印機器人', 'ㄉㄚˇ ㄧㄣˋ ㄐㄧ ㄑㄧˋ ㄖㄣˊ', ev(n=2, freq=0), self.ctx())
        self.assertEqual(d[:2], ('keep', 'K1-pass'))
        d = rules.classify('打印機器人', 'ㄉㄚˇ ㄧㄣˋ ㄐㄧ ㄑㄧˋ ㄖㄣˊ', ev(n=1, freq=0), self.ctx())
        self.assertNotEqual(d[0], 'delete')

    def test_extra_file_adds_terms(self):
        ctx = self.ctx(extra='# 補充\n你好嗎\t你好\n')
        self.assertEqual(rules.classify('你好嗎', 'ㄋㄧˇ ㄏㄠˇ ㄇㄚ', ev(freq=3), ctx),
                         ('delete', 'R3-china-term', '你好'))


class GrayAndKeepTest(RuleTestBase):
    Z = 'ㄋㄧˇ ㄏㄠˇ'

    def test_single_source_is_gray_not_deleted(self):
        self.assertEqual(rules.classify('你好', self.Z, ev(n=1, freq=7), self.ctx()),
                         ('gray', 'G-single-source', None))
        self.assertEqual(rules.classify('你好', self.Z, ev(n=2, freq=7), self.ctx())[:2], ('keep', 'K1-pass'))

    def test_keep_json_beats_r1_r2_r3_but_not_r0(self):
        ctx = self.ctx(keep=['剪貼板', '电脑', '㹴犬', 'ＡＢ'])
        self.assertEqual(rules.classify('剪貼板', 'ㄐㄧㄢˇ ㄊㄧㄝ ㄅㄢˇ', ev(freq=1), ctx),
                         ('keep', 'K0-allowlist', None))
        self.assertEqual(rules.classify('电脑', 'ㄉㄧㄢˋ ㄋㄠˇ', ev(), ctx)[:2], ('keep', 'K0-allowlist'))
        self.assertEqual(rules.classify('㹴犬', 'ㄍㄥˇ ㄑㄩㄢˇ', ev(), ctx)[:2], ('keep', 'K0-allowlist'))
        self.assertEqual(rules.classify('ＡＢ', 'ㄅㄧ ㄅㄧ', ev(), ctx)[:2], ('delete', 'R0-nonhan'))

    def test_overrides_added_words_are_kept(self):
        ctx = self.ctx(overrides_added=[{'w': '电脑', 'z': 'ㄉㄧㄢˋ ㄋㄠˇ'}, {'z': '沒有詞'}])
        self.assertEqual(ctx.keep_allow, {'电脑'})
        self.assertEqual(rules.classify('电脑', 'ㄉㄧㄢˋ ㄋㄠˇ', ev(), ctx)[:2], ('keep', 'K0-allowlist'))

    def test_p2_grays_words_with_zero_frequency_everywhere(self):
        zero = ev(n=2, freq=0, freqs=[0, 0])
        self.assertEqual(rules.classify('你好', self.Z, zero, self.ctx())[:2], ('keep', 'K1-pass'))
        self.assertEqual(rules.classify('你好', self.Z, zero, self.ctx(gray_policy='p2')),
                         ('gray', 'G-zero-freq', None))
        some = ev(n=2, freq=0, freqs=[0, 5])
        self.assertEqual(rules.classify('你好', self.Z, some, self.ctx(gray_policy='p2'))[:2], ('keep', 'K1-pass'))

    def test_bad_gray_policy_is_rejected(self):
        with self.assertRaises(LexError):
            self.ctx(gray_policy='p3')

    def test_shipped_real_keep_json_is_a_list_of_words(self):
        data = json.loads((build.HERE / 'rules' / 'keep.json').read_text(encoding='utf-8'))
        self.assertIsInstance(data, list)
        self.assertTrue(all(isinstance(w, str) and len(w) >= 2 for w in data))


def rows_for(words):
    return [(w, z, p) for w, z, p in words]


class EndToEndTest(RuleTestBase):
    """三個很小的詞庫包走完整流程：collect → apply_rules → 寫檔。"""

    def setUp(self):
        super().setUp()
        self.ctx_ = self.ctx(keep=['剪貼板'])
        a = rows_for([
            ('你好', 'ㄋㄧˇ ㄏㄠˇ', 500), ('支持', 'ㄓ ㄔˊ', 9318), ('打印機', 'ㄉㄚˇ ㄧㄣˋ ㄐㄧ', 3),
            ('电脑', 'ㄉㄧㄢˋ ㄋㄠˇ', 4), ('只有甲有', 'ㄓˇ ㄧㄡˇ ㄐㄧㄚˇ ㄧㄡˇ', 0),
            ('剪貼板', 'ㄐㄧㄢˇ ㄊㄧㄝ ㄅㄢˇ', 1), ('單', 'ㄉㄢ', 1),
            ('㹴犬', 'ㄍㄥˇ ㄑㄩㄢˇ', 10), ('壞音節', 'ㄅㄢˋ ㄧ', 1)])
        b = rows_for([('你好', 'ㄋㄧˇ ㄏㄠˇ', 90), ('支持', 'ㄓ ㄔˊ', 20), ('只有乙有', 'ㄓˇ ㄧㄡˇ ㄧˇ ㄧㄡˇ', 5),
                      ('阿司匹林', 'ㄚ ㄙ ㄆㄧˇ ㄌㄧㄣˊ', 0)])
        c = rows_for([('你好', 'ㄋㄧˇ ㄏㄠˇ', 0), ('設備', 'ㄕㄜˋ ㄅㄟˋ', 100)])
        self.parsed = {pid: parse.collect(rows, POLY, {}, pid)
                       for pid, rows in (('a', a), ('b', b), ('c', c))}
        self.res = rules.apply_rules(self.parsed, self.ctx_)

    def test_entries_plus_removed_equal_in_scope_words(self):
        for pid, (_e, _r, stats) in self.parsed.items():
            r = self.res[pid]
            self.assertEqual(len(r['entries']) + len(r['removed']), stats['in_scope'], pid)

    def test_decisions_per_pack(self):
        a = self.res['a']
        self.assertEqual({e['w'] for e in a['entries']}, {'你好', '支持', '只有甲有', '剪貼板'})
        by_w = {r['w']: r for r in a['removed']}
        self.assertEqual(sorted(by_w), sorted(['壞音節', '打印機', '电脑', '㹴犬']))
        self.assertEqual(by_w['电脑']['rule'], 'R1-simplified')
        self.assertEqual(by_w['㹴犬']['rule'], 'R2-rare-char')
        self.assertEqual(by_w['打印機']['rule'], 'R3-china-term')
        self.assertEqual(by_w['壞音節']['rule'], 'R0-syllables')
        # 只有甲有是灰色；剪貼板在救回清單（K0）不算灰色
        self.assertEqual(a['gray'], 1)
        self.assertEqual(a['stats']['keep_allow'], 1)
        self.assertEqual(a['stats']['rules'], {'R0-syllables': 1, 'R1-simplified': 1,
                                                'R2-rare-char': 1, 'R3-china-term': 1})

    def test_r3_uses_the_own_source_frequency(self):
        # 支持在 a 詞頻 9318（留），在 b 只有 20（刪）
        self.assertIn('支持', {e['w'] for e in self.res['a']['entries']})
        self.assertEqual([r['w'] for r in self.res['b']['removed'] if r['rule'] == 'R3-china-term'],
                         ['支持', '阿司匹林'])
        self.assertEqual(self.res['a']['stats']['china_kept'], 1)
        self.assertEqual(self.res['b']['stats']['china_kept'], 0)

    def test_gray_words_stay_and_never_appear_in_removed(self):
        for pid, r in self.res.items():
            self.assertFalse([x for x in r['removed'] if x['rule'].startswith('G')], pid)
            self.assertFalse([x for x in r['removed'] if x['w'] in ('只有甲有', '只有乙有', '設備')], pid)
        self.assertIn('只有乙有', {e['w'] for e in self.res['b']['entries']})
        self.assertEqual(self.res['b']['gray'], 1)
        self.assertEqual(self.res['c']['gray'], 1)  # 設備只有 c 有：詞頻 100 守門過關，再因單一來源變灰色
        self.assertEqual([r for r in self.res['c']['removed']], [])

    def test_removed_rows_carry_every_field_and_the_holders(self):
        for pid, r in self.res.items():
            for row in r['removed']:
                for key in ('w', 'z', 'p', 'rule', 'reason', 'src', 'n'):
                    self.assertIn(key, row)
                self.assertTrue(row['reason'])
                self.assertEqual(row['n'], len(row['src']))
        b_rows = {r['w']: r for r in self.res['b']['removed']}
        self.assertEqual(b_rows['支持']['src'], ['a', 'b'])
        self.assertIn('支援', b_rows['支持']['reason'])

    def test_packs_and_removed_lists_are_written_deterministically(self):
        cfg = {'id': 'a', 'name': '甲', 'description': 'd', 'licence_spdx': 'MIT'}
        out = self.tmp / 'out'
        meta = pack.write_pack(out, cfg, self.res['a']['entries'],
                               {'gray': self.res['a']['gray'], 'gray_pending': self.res['a']['gray'],
                                'gray_policy': 'p1'})
        pack.write_removed(self.tmp / 'removed.ndjson', self.res['a']['removed'])
        self.assertTrue(meta['version'].startswith('2.'))
        self.assertEqual((meta['entries'], meta['gray'], meta['gray_pending']), (4, 1, 1))
        lines = (self.tmp / 'removed.ndjson').read_text(encoding='utf-8').splitlines()
        self.assertEqual(len(lines), 4)
        self.assertEqual(len(self.res['a']['entries']) + len(lines), self.parsed['a'][2]['in_scope'])
        again = rules.apply_rules(self.parsed, self.ctx_)
        self.assertEqual(again['a']['removed'], self.res['a']['removed'])

    def test_mismatch_between_counts_is_detected(self):
        entries, removed, stats = self.parsed['a']
        broken = dict(stats, in_scope=stats['in_scope'] + 1)
        with self.assertRaises(LexError):
            rules.apply_rules({'a': (entries, removed, broken)}, self.ctx_)


class CollectIdentityTest(unittest.TestCase):
    def test_word_with_a_good_and_a_bad_reading_is_kept_once_and_not_listed_as_removed(self):
        rows = [('你好', 'ㄋㄧˇ ㄏㄠˇ', 5), ('你好', 'ㄋㄧˇ', 9), ('壞詞', 'ㄅ', 1), ('壞詞', 'ㄅㄢ', 2)]
        entries, removed, stats = parse.collect(rows, POLY, {}, 'x')
        self.assertEqual([e['w'] for e in entries], ['你好'])
        self.assertEqual([r['w'] for r in removed], ['壞詞'])  # 兩個壞讀音只留一列
        self.assertEqual(stats['dropped_readings'], 1)
        self.assertEqual(stats['in_scope'], 2)
        self.assertEqual(len(entries) + len(removed), stats['in_scope'])


class ShippedTextTest(RuleTestBase):
    def test_notice_with_a_simplified_char_is_rejected(self):
        ctx = self.ctx()
        problems = rules.shipped_text_problems({'data/packs/x/NOTICE.txt': '本詞庫含电字'}, ctx)
        self.assertEqual(len(problems), 1)
        self.assertIn('电', problems[0])
        self.assertEqual(rules.shipped_text_problems({'a': '本詞庫為繁體，祢也可以'}, ctx), [])
        self.assertEqual(rules.simplified_chars_in('电脑电', ctx), ['电', '脑'])

    def test_real_shipped_texts_have_no_simplified_chars_with_fixture_context(self):
        # 範本 STCharacters 只有幾個字；真實檢查由 verify --strict 與 build 完成
        ctx = self.ctx()
        for name, text in build._shipped_texts(build.REPO).items():
            self.assertEqual(rules.simplified_chars_in(text, ctx), [], name)


class StrictVerifyTest(RuleTestBase):
    def make_repo(self, lines):
        base = self.tmp / 'repo' / 'data' / 'packs'
        (base / 'demo').mkdir(parents=True)
        (base / 'index.json').write_text(json.dumps(
            {'schema': 1, 'default': 'v096', 'packs': [{'id': 'v096', 'legacyCache': True}, {'id': 'demo'}]}),
            encoding='utf-8')
        (base / 'demo' / 'meta.json').write_text(json.dumps({'chunks': 1}), encoding='utf-8')
        (base / 'demo' / 'c00.json').write_text(
            ''.join(json.dumps({'w': w, 'z': 'ㄧ ㄧ', 'p': p}, ensure_ascii=False) + '\n' for w, p in lines),
            encoding='utf-8')
        return self.tmp / 'repo'

    def test_reports_simplified_rare_and_china_terms_but_not_allowlisted_ones(self):
        repo = self.make_repo([('你好', 500), ('电脑', 0), ('㹴犬', 0), ('打印機', 3), ('支持', 9000), ('剪貼板', 1)])
        problems = build.strict_problems(repo, self.ctx(keep=['剪貼板']))
        joined = '\n'.join(problems)
        self.assertEqual(len(problems), 3, joined)
        for needle in ('电脑', '㹴犬', '打印機'):
            self.assertIn(needle, joined)
        for clean in ('你好', '支持', '剪貼板'):
            self.assertNotIn('「%s」' % clean, joined)

    def test_clean_pack_has_no_problems(self):
        repo = self.make_repo([('你好', 500), ('支持', 9000)])
        self.assertEqual(build.strict_problems(repo, self.ctx()), [])


class CommittedPacksTest(unittest.TestCase):
    """已提交的詞庫包與刪除清單要符合規則層的不變條件（離線、不需要規則輸入快取）。"""

    PACKS = ('chewing', 'mcbopomofo', 'vanguard-tw')
    RULES = {'R0-nonbmp', 'R0-nonhan', 'R0-length', 'R0-bopomofo', 'R0-syllables',
             'R1-simplified', 'R2-rare-char', 'R3-china-term'}

    def test_removed_rows_and_counts_hold_together(self):
        for pid in self.PACKS:
            meta = json.loads((build.REPO / 'data' / 'packs' / pid / 'meta.json').read_text(encoding='utf-8'))
            lines = (build.HERE / 'reports' / pid / 'removed.ndjson').read_text(encoding='utf-8').splitlines()
            rows = [json.loads(ln) for ln in lines]
            self.assertEqual(meta['entries'] + len(rows), meta['stats']['in_scope'], pid)
            self.assertTrue(20 <= len(rows) <= 2000, pid)
            self.assertTrue(3000 <= meta['gray'] <= 25000, pid)
            self.assertEqual(meta['gray_pending'], meta['gray'])
            self.assertEqual(meta['gray_policy'], 'p1')
            self.assertTrue(meta['version'].startswith(rules_version() + '.'))
            for r in rows:
                self.assertIn(r['rule'], self.RULES)
                self.assertTrue(r['reason'] and r['src'] and r['n'] == len(r['src']))
                self.assertIn(pid, r['src'])
                self.assertNotEqual(r['w'], '支持')  # 詞頻守門：支持是台灣常用詞，不能被當中國用語刪掉
            self.assertEqual([r['w'] for r in rows], sorted(r['w'] for r in rows))
            self.assertEqual(sum(meta['stats']['rules'].values()), len(rows), pid)


def rules_version():
    from lex import RULES_VERSION
    return RULES_VERSION


if __name__ == '__main__':
    unittest.main()
