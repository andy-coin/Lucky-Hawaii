"""NOTICE 內容的測試：每個詞庫包都要說清楚來源、授權、改作與日期。"""
import unittest

from lex import pack

CFG = {'id': 'demo', 'name': '示範詞庫', 'licence_spdx': 'LGPL-2.1-or-later',
       'copyright': ['Copyright (c) 2025 Demo Team', 'Copyright (c) 1999 Other']}
META = {
    'version': '1.0123456789', 'built': '2026-10-04', 'licence': 'LGPL-2.1-or-later',
    'sources': [{'id': 'demo-src', 'repo': 'https://github.com/o/r', 'commit': 'd' * 40,
                 'licence_spdx': 'LGPL-2.1-or-later'}],
    'licence_files': [{'file': 'LICENSE.LGPL-2.1.txt', 'sha256': 'x'}],
}


class PackNoticeTest(unittest.TestCase):
    def test_required_statements_present(self):
        text = pack.pack_notice(CFG, META, '2025.11.17', 7)
        for needle in ('demo', '1.0123456789', 'LGPL-2.1-or-later', 'd' * 40, '改作說明',
                       '改作日期：2026-10-04', '2025.11.17', 'Copyright (c) 2025 Demo Team',
                       'Copyright (c) 1999 Other', 'LICENSE.LGPL-2.1.txt',
                       'tools/lexicon/reports/demo/removed.ndjson', '共刪除 7 筆', 'OpenCC'):
            self.assertIn(needle, text)

    def test_tabe_text_appended_when_configured(self):
        tabe = 'Copyright (c) 1999 TaBE Project.\nRedistribution and use ...\n'
        with_tabe = pack.pack_notice(CFG, META, '2025.11.17', 0, tabe)
        self.assertTrue(with_tabe.endswith(tabe))
        self.assertNotIn('TaBE', pack.pack_notice(CFG, META, '2025.11.17', 0))

    def test_missing_upstream_version_falls_back_to_commit(self):
        text = pack.pack_notice(CFG, META, '', 0)
        self.assertIn('上游未標版本，以 commit 為準', text)

    def test_notice_is_deterministic(self):
        self.assertEqual(pack.pack_notice(CFG, META, 'v', 3), pack.pack_notice(CFG, META, 'v', 3))


class V096NoticeTest(unittest.TestCase):
    def test_states_the_moe_licence_honestly(self):
        text = pack.v096_notice_text()
        for needle in ('CC BY-ND 3.0', '重編國語辭典修訂本', '教育部《重編國語辭典修訂本》',
                       'https://dict.revised.moe.edu.tw/', 'MulanPSL-2.0', 'BSD-3-Clause',
                       'LGPL-2.1-or-later', 'VanguardLexicon', 'libchewing-data', '第 12 階段'):
            self.assertIn(needle, text)


if __name__ == '__main__':
    unittest.main()
