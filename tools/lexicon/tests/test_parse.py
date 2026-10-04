"""tsi.csv 解析、格式規則 R0、讀音選擇的測試（只用 fixtures）。"""
import unittest
from pathlib import Path

from lex import parse

FIX = Path(__file__).resolve().parent / 'fixtures' / 'tsi-mini.csv'


class ParseTsiTest(unittest.TestCase):
    def setUp(self):
        self.header, self.rows = parse.parse_tsi(FIX)

    def test_header_has_identifier_and_licence(self):
        self.assertEqual(self.header['dc:identifier'], '2025.11.17')
        self.assertEqual(self.header['dc:license'], 'LGPL-2.1-or-later')

    def test_two_column_line_and_comments_are_skipped(self):
        words = [r[0] for r in self.rows]
        self.assertNotIn('只有兩欄', words)
        self.assertEqual(len(self.rows), 15)

    def test_stray_tone_line_is_kept_by_parser_but_counted_single_later(self):
        # 解析器只管欄位；單字與雜訊行由 normalise 判成「略過單字」
        self.assertIn('ˇ', [r[0] for r in self.rows])

    def test_accepts_mapping_input(self):
        header, rows = parse.parse_tsi({'libchewing-data/dict/chewing/tsi.csv': FIX})
        self.assertEqual(len(rows), len(self.rows))


class NormaliseTest(unittest.TestCase):
    def test_single_char_is_skipped(self):
        self.assertEqual(parse.normalise('你', 'ㄋㄧˇ')[1], parse.SKIP_SINGLE)
        self.assertEqual(parse.normalise('ˇ', 'ˇ')[1], parse.SKIP_SINGLE)

    def test_non_bmp_is_r0_nonbmp(self):
        self.assertEqual(parse.normalise('𰻞𰻞麵', 'ㄅㄧㄤˊ ㄅㄧㄤˊ ㄇㄧㄢˋ')[1], 'R0-nonbmp')

    def test_non_han_is_r0_nonhan(self):
        self.assertEqual(parse.normalise('哆啦Ａ夢', 'ㄉㄨㄛ ㄌㄚ ㄟ ㄇㄥˋ')[1], 'R0-nonhan')

    def test_twelve_chars_is_r0_length(self):
        w = '一二三四五六七八九十百千'
        z = ' '.join(['ㄧ'] * 12)
        self.assertEqual(parse.normalise(w, z)[1], 'R0-length')

    def test_bad_bopomofo_is_r0_bopomofo(self):
        self.assertEqual(parse.normalise('你好', 'ni hao')[1], 'R0-bopomofo')

    def test_syllable_mismatch_is_r0_syllables(self):
        self.assertEqual(parse.normalise('你好嗎', 'ㄋㄧˇ ㄏㄠˇ')[1], 'R0-syllables')

    def test_good_word_passes(self):
        self.assertEqual(parse.normalise('你好', 'ㄋㄧˇ ㄏㄠˇ'), ('你好', None))
        self.assertEqual(parse.normalise('好了', 'ㄏㄠˇ ㄌㄜ˙')[1], None)

    def test_compat_ideograph_is_nfc_normalised(self):
        w, verdict = parse.normalise('欄位', 'ㄌㄢˊ ㄨㄟˋ')
        self.assertEqual(w, '欄位')
        self.assertIsNone(verdict)

    def test_every_rule_has_a_reason(self):
        for rule in ('R0-nonbmp', 'R0-nonhan', 'R0-length', 'R0-bopomofo', 'R0-syllables'):
            self.assertTrue(parse.R0_REASONS[rule])


class ChooseReadingTest(unittest.TestCase):
    READINGS = {'ㄧ ㄒㄧㄚˋ', 'ㄧˊ ㄒㄧㄚˋ'}

    def test_polyphonic_rank_decides(self):
        order = {'一': ['ㄧˊ', 'ㄧ']}
        self.assertEqual(parse.choose_reading('一下', self.READINGS, order, {}), 'ㄧˊ ㄒㄧㄚˋ')
        order = {'一': ['ㄧ', 'ㄧˊ']}
        self.assertEqual(parse.choose_reading('一下', self.READINGS, order, {}), 'ㄧ ㄒㄧㄚˋ')

    def test_char_missing_from_order_does_not_matter(self):
        # 沒有任何字在表裡：輕聲少者優先，再比字典序，結果固定
        a = parse.choose_reading('一下', self.READINGS, {}, {})
        b = parse.choose_reading('一下', set(reversed(sorted(self.READINGS))), {}, {})
        self.assertEqual(a, b)

    def test_neutral_tone_loses_ties(self):
        got = parse.choose_reading('了解', {'ㄌㄜ˙ ㄐㄧㄝˇ', 'ㄌㄧㄠˇ ㄐㄧㄝˇ'}, {}, {})
        self.assertEqual(got, 'ㄌㄧㄠˇ ㄐㄧㄝˇ')

    def test_tone_stripped_match_is_used(self):
        order = {'乾': ['ㄍㄢ', 'ㄑㄧㄢˊ']}
        got = parse.choose_reading('乾杯', {'ㄍㄢ ㄅㄟ', 'ㄑㄧㄢˊ ㄅㄟ'}, order, {})
        self.assertEqual(got, 'ㄍㄢ ㄅㄟ')

    def test_override_wins(self):
        order = {'一': ['ㄧˊ', 'ㄧ']}
        got = parse.choose_reading('一下', self.READINGS, order, {'一下': 'ㄧ ㄒㄧㄚˋ'})
        self.assertEqual(got, 'ㄧ ㄒㄧㄚˋ')


class CollectTest(unittest.TestCase):
    def setUp(self):
        _, rows = parse.parse_tsi(FIX)
        self.entries, self.removed, self.stats = parse.collect(
            rows, {'一': ['ㄧˊ', 'ㄧ'], '乾': ['ㄍㄢ', 'ㄑㄧㄢˊ']}, {}, 'libchewing-data')

    def test_counts(self):
        # 單字：你、ˇ；刪除：𰻞𰻞麵、12 字詞、你好嗎、哆啦Ａ夢
        # 你好(ni hao) 的壞讀音只是丟掉（你好另有合格讀音），不另列刪除列，所以「留下 + 刪除 == 範圍內的詞」成立
        self.assertEqual(self.stats['skipped_single'], 2)
        self.assertEqual(self.stats['removed'], 4)
        self.assertEqual(self.stats['dropped_readings'], 1)
        self.assertEqual(self.stats['kept'] + self.stats['removed'], self.stats['in_scope'])
        self.assertEqual(self.stats['kept'], len(self.entries))
        self.assertEqual(self.stats['merged_lines'], 2)  # 一下、乾杯各多一行

    def test_duplicate_lines_merge_with_max_freq(self):
        by = {e['w']: e for e in self.entries}
        self.assertEqual(by['一下']['p'], 50)
        self.assertEqual(by['一下']['z'], 'ㄧˊ ㄒㄧㄚˋ')
        self.assertEqual(by['乾杯']['z'], 'ㄍㄢ ㄅㄟ')
        self.assertEqual(sum(1 for e in self.entries if e['w'] == '你好'), 1)

    def test_removed_rows_carry_rule_reason_and_source(self):
        rules = sorted(r['rule'] for r in self.removed)
        self.assertEqual(rules, ['R0-length', 'R0-nonbmp', 'R0-nonhan', 'R0-syllables'])
        self.assertNotIn('你好', [r['w'] for r in self.removed])
        for r in self.removed:
            self.assertEqual(sorted(r), ['n', 'p', 'reason', 'rule', 'src', 'w', 'z'])
            self.assertEqual(r['src'], ['libchewing-data'])
            self.assertTrue(r['reason'])
        self.assertEqual([r['w'] for r in self.removed], sorted(r['w'] for r in self.removed))


FIXDIR = Path(__file__).resolve().parent / 'fixtures'
POLY = {'一': ['ㄧˊ', 'ㄧ']}


class ParseMcBopomofoTest(unittest.TestCase):
    def setUp(self):
        self.header, self.rows = parse.parse_mcbopomofo({
            'mcbopomofo/Source/Data/BPMFMappings.txt': FIXDIR / 'BPMFMappings-mini.txt',
            'mcbopomofo/Source/Data/phrase.occ': FIXDIR / 'phrase-mini.occ'})
        self.by = {}
        for w, z, p in self.rows:
            self.by.setdefault(w, []).append((z, p))

    def test_registered_and_header_is_empty(self):
        self.assertIs(parse.PARSERS['mcbopomofo'], parse.parse_mcbopomofo)
        self.assertEqual(self.header, {})

    def test_blank_comment_and_one_token_lines_are_skipped(self):
        # 10 筆：壞掉（只有一欄）、空行、# 註解都不算
        self.assertEqual(len(self.rows), 10)
        self.assertNotIn('壞掉', self.by)

    def test_single_space_separated_syllables_are_joined(self):
        self.assertEqual(self.by['一九九○'][0][0], 'ㄧ ㄐㄧㄡˇ ㄐㄧㄡˇ ㄌㄧㄥˊ')
        self.assertEqual(self.by['你好'], [('ㄋㄧˇ ㄏㄠˇ', 9000)])

    def test_occurrence_count_is_read_with_single_space_not_tab(self):
        # phrase.occ 是「詞 次數」單一空格；若誤用 TAB 切會整檔讀成 0
        self.assertEqual(self.by['一一'][0][1], 3)
        self.assertEqual(self.by['好了'][0][1], 77)

    def test_word_missing_from_occ_gets_zero(self):
        self.assertEqual(self.by['沒次數詞'][0][1], 0)

    def test_malformed_occ_line_is_ignored(self):
        self.assertNotIn('壞次數', self.by)

    def test_multi_reading_word_keeps_every_line_with_the_same_count(self):
        self.assertEqual(sorted(self.by['一下']), [('ㄧ ㄒㄧㄚˋ', 120), ('ㄧˊ ㄒㄧㄚˋ', 120)])

    def test_tab_separated_occ_would_not_parse(self):
        import tempfile
        with tempfile.TemporaryDirectory() as d:
            occ = Path(d) / 'phrase.occ'
            occ.write_text('你好\t9000\n', encoding='utf-8')
            _, rows = parse.parse_mcbopomofo({'x/BPMFMappings.txt': FIXDIR / 'BPMFMappings-mini.txt',
                                              'x/phrase.occ': occ})
        self.assertEqual([p for w, z, p in rows if w == '你好'], [0])

    def test_r0_outcomes_and_reading_choice(self):
        entries, removed, stats = parse.collect(self.rows, POLY, {}, 'mcbopomofo')
        rules = {r['w']: r['rule'] for r in removed}
        self.assertEqual(rules, {'一九九○': 'R0-nonhan', '𰻞𰻞麵': 'R0-nonbmp', '菜々子': 'R0-nonhan'})
        by = {e['w']: e for e in entries}
        self.assertEqual(by['一下'], {'w': '一下', 'z': 'ㄧˊ ㄒㄧㄚˋ', 'p': 120})
        self.assertEqual(by['沒次數詞']['p'], 0)
        self.assertEqual(stats['skipped_single'], 1)
        self.assertEqual(stats['kept'], 5)  # 一一、一下、你好、沒次數詞、好了
        self.assertEqual(stats['merged_lines'], 1)


class ParseVanguardTest(unittest.TestCase):
    def setUp(self):
        self.header, self.rows = parse.parse_vanguard({
            'vanguard-tw/Sources/x/components/cht/phrases-vchewing-cht.txt': FIXDIR / 'phrases-vchewing-mini.txt',
            'vanguard-tw/Sources/x/components/cht/phrases-tabe-cht.txt': FIXDIR / 'phrases-tabe-mini.txt'})

    def test_registered_and_header_is_empty(self):
        self.assertIs(parse.PARSERS['vanguard'], parse.parse_vanguard)
        self.assertEqual(self.header, {})

    def test_comments_blank_short_and_bad_frequency_lines_are_skipped(self):
        words = [r[0] for r in self.rows]
        self.assertNotIn('只有兩欄', words)
        self.assertNotIn('壞頻次', words)
        self.assertEqual(len(self.rows), 6)

    def test_fields_are_word_frequency_then_syllables(self):
        self.assertIn(('你好', 'ㄋㄧˇ ㄏㄠˇ', 50), self.rows)
        self.assertIn(('好了', 'ㄏㄠˇ ㄌㄜ˙', 8), self.rows)

    def test_word_in_both_files_takes_max_frequency_and_considers_both_readings(self):
        entries, removed, stats = parse.collect(self.rows, POLY, {}, 'vanguard-tw')
        by = {e['w']: e for e in entries}
        self.assertEqual(by['你好']['p'], 120)
        self.assertEqual(by['一下'], {'w': '一下', 'z': 'ㄧˊ ㄒㄧㄚˋ', 'p': 30})
        self.assertEqual(stats['merged_lines'], 2)

    def test_short_reading_is_r0_syllables(self):
        _, removed, _ = parse.collect(self.rows, POLY, {}, 'vanguard-tw')
        self.assertEqual([(r['w'], r['rule']) for r in removed], [('倒三角形', 'R0-syllables')])

    def test_needs_exactly_the_two_expected_files(self):
        with self.assertRaises(ValueError):
            parse.parse_vanguard({'x/phrases-tabe-cht.txt': FIXDIR / 'phrases-tabe-mini.txt'})


if __name__ == '__main__':
    unittest.main()
