"""排版必須和現有資料檔逐位元組相同，第一次寫回才不會整檔都是 diff。"""
import unittest
from pathlib import Path

import writeback

DATA = Path(__file__).resolve().parents[3] / 'data'


class FormatRoundTrip(unittest.TestCase):
    def test_current_wordlist_file_round_trips(self):
        raw = (DATA / 'wordlist-overrides.json').read_text(encoding='utf-8')
        self.assertEqual(writeback.format_word(writeback.load_overrides(DATA / 'wordlist-overrides.json')), raw)

    def test_current_rhyme_file_round_trips(self):
        raw = (DATA / 'rhyme-dict-overrides.json').read_text(encoding='utf-8')
        self.assertEqual(writeback.format_rhyme(writeback.load_overrides(DATA / 'rhyme-dict-overrides.json')), raw)

    def test_filled_buckets_use_the_old_script_layout(self):
        doc = {'version': 2, 'removed': ['甲'], 'hidden': [], 'fixed': {'好運': 'ㄏㄠˇ ㄩㄣˋ', '二心': 'ㄦˋ ㄒㄧㄣ'},
               'added': [{'w': '乙', 'z': 'ㄧˇ', 'tier': 'normal', 'source': 'manual'}], 'updated_at': 'T'}
        self.assertEqual(
            writeback.format_word(doc),
            '{\n  "version": 2,\n\n  "removed": ["甲"],\n\n  "hidden": [],\n\n'
            '  "fixed": {\n    "好運": "ㄏㄠˇ ㄩㄣˋ",\n    "二心": "ㄦˋ ㄒㄧㄣ"\n  },\n\n'
            '  "added": [\n    {"w": "乙", "z": "ㄧˇ", "tier": "normal", "source": "manual"}\n  ],\n\n'
            '  "updated_at": "T"\n}\n')

    def test_more_than_ten_words_wrap_ten_per_line(self):
        words = ['詞%d' % i for i in range(11)]
        out = writeback.format_word({'version': 2, 'removed': words, 'hidden': [], 'fixed': {}, 'added': [], 'updated_at': 'T'})
        self.assertIn('  "removed": [\n    ' + ', '.join('"%s"' % w for w in words[:10]) + ',\n    "詞10"\n  ],', out)


if __name__ == '__main__':
    unittest.main()
