"""自建潮流詞庫（tools/lexicon/slang/*.tsv → data/slang/words.json）。"""
import json
import sys
import tempfile
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(HERE))
import slang  # noqa: E402

WORDS = {e['w']: e for e in json.loads(slang.OUT_PATH.read_text(encoding='utf-8'))['added']}


class SlangDataTest(unittest.TestCase):
    def test_site_file_matches_tsv(self):
        problems, entries = slang.run(write=False)
        self.assertEqual(problems, [])
        self.assertGreater(len(entries), 2000)

    def test_examples_have_correct_reading(self):
        expect = {
            '芙莉蓮': 'ㄈㄨˊ ㄌㄧˋ ㄌㄧㄢˊ',
            '雙標': 'ㄕㄨㄤ ㄅㄧㄠ',
            '情緒價值': 'ㄑㄧㄥˊ ㄒㄩˋ ㄐㄧㄚˋ ㄓˊ',
            '暈碳': 'ㄩㄣ ㄊㄢˋ',
            '統神': 'ㄊㄨㄥˇ ㄕㄣˊ',
            '超派鐵拳': 'ㄔㄠ ㄆㄞˋ ㄊㄧㄝˇ ㄑㄩㄢˊ',
            '尊嘟假嘟': 'ㄗㄨㄣ ㄉㄨ ㄐㄧㄚˇ ㄉㄨ',
            '沈伯洋': 'ㄕㄣˇ ㄅㄛˊ ㄧㄤˊ',
            '兵長': 'ㄅㄧㄥ ㄓㄤˇ',
        }
        for w, z in expect.items():
            self.assertIn(w, WORDS, w)
            self.assertEqual(WORDS[w]['z'], z, w)

    def test_every_entry_is_well_formed(self):
        for w, e in WORDS.items():
            self.assertIsNone(slang.check_row(w, e['z'], '台'), w)
            self.assertEqual(e['p'], slang.P_DEFAULT)

    def test_notice_has_no_simplified_chars(self):
        text = (slang.OUT_DIR / 'NOTICE.txt').read_text(encoding='utf-8')
        self.assertIn('自建', text)
        try:
            import build as buildlib
            from lex import cache_dir, rules as ruleslib, sources
            ctx = ruleslib.load_rule_context(buildlib.rule_paths(sources.load_lock(buildlib.LOCK_PATH), cache_dir()))
        except Exception:   # noqa: BLE001 — 沒有規則輸入快取就只檢查存在
            self.skipTest('沒有規則輸入快取')
        self.assertEqual(ruleslib.simplified_chars_in(text, ctx), [])


class AutoReadingTest(unittest.TestCase):
    LEX = {'情緒': 'ㄑㄧㄥˊ ㄒㄩˋ', '價值': 'ㄐㄧㄚˋ ㄓˊ', '長大': 'ㄓㄤˇ ㄉㄚˋ'}
    CHARS = {'暈': ['ㄩㄣ', 'ㄩㄣˋ'], '碳': ['ㄊㄢˋ'], '長': ['ㄔㄤˊ', 'ㄓㄤˇ'], '兵': ['ㄅㄧㄥ']}

    def test_segments_into_pack_words(self):
        self.assertEqual(slang.auto_reading('情緒價值', self.LEX, self.CHARS, set()), ('ㄑㄧㄥˊ ㄒㄩˋ ㄐㄧㄚˋ ㄓˊ', []))

    def test_polyphonic_single_char_is_reported(self):
        z, doubts = slang.auto_reading('兵長', self.LEX, self.CHARS, {'長'})
        self.assertEqual(doubts, ['長'])

    def test_unknown_char_gives_none(self):
        self.assertEqual(slang.auto_reading('碳碳𠀀', self.LEX, self.CHARS, set())[0], None)

    def test_build_fills_reading_and_stops_on_doubt(self):
        with tempfile.TemporaryDirectory() as d:
            src = Path(d) / 'x.tsv'
            src.write_text('# 註解\n雙標\t\t台\t備註\n暈碳\t\t台\n', encoding='utf-8')
            out = Path(d) / 'words.json'
            problems, _ = slang.run(write=True, slang_dir=d, out_path=out)
            self.assertTrue(any('暈碳' in p and '破音字' in p for p in problems), problems)
            self.assertFalse(out.exists())
            # 自動補上的注音寫回 TSV，註解原樣保留
            self.assertIn('雙標\tㄕㄨㄤ ㄅㄧㄠ\t台\t備註', src.read_text(encoding='utf-8'))
            self.assertTrue(src.read_text(encoding='utf-8').startswith('# 註解\n'))

    def test_duplicates_and_bad_origin_are_reported(self):
        with tempfile.TemporaryDirectory() as d:
            (Path(d) / 'a.tsv').write_text('雙標\tㄕㄨㄤ ㄅㄧㄠ\t台\n', encoding='utf-8')
            (Path(d) / 'b.tsv').write_text('雙標\tㄕㄨㄤ ㄅㄧㄠ\t台\n魯蛇\tㄌㄨˇ ㄕㄜˊ\t火星\n', encoding='utf-8')
            problems, _ = slang.run(write=False, slang_dir=d, out_path=Path(d) / 'w.json')
            self.assertTrue(any('重複' in p for p in problems), problems)
            self.assertTrue(any('源要是' in p for p in problems), problems)


if __name__ == '__main__':
    unittest.main()
