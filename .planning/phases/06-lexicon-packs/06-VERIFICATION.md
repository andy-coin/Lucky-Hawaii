---
phase: 06-lexicon-packs
verified: 2026-10-09T00:00:00Z
status: human_needed
score: 3/5 must-haves verified
covered_files:
  - data/packs/index.json
  - js/search-ui.js
  - js/wordlist.js
  - tools/lexicon/lex/judge.py
  - tools/lexicon/lex/pack.py
  - tools/lexicon/lex/report.py
  - tools/lexicon/lex/rules.py
covered_digest: "v2:sha256:137b3d263848cf488a5887b96fbccecb6ac1082a484f2f0309a195b45c043351"
behavior_unverified: 2
overrides_applied: 0
behavior_unverified_items:
  - truth: "SC3: 灰色地帶由免費 AI 依「可理解性」標準判斷（實際跑一次 AI 並以結果重建詞庫包）"
    test: "設好免費 Gemini 金鑰，先跑 npm run lexicon:eval（目標一致率 >= 90%），再跑 npm run lexicon:judge"
    expected: "三個詞庫包的 gray_pending 降為 0；judgments.tsv 有大量 K/D 判斷；重建後 REPORT.md 出現 R5-ai-incomprehensible 的刪除與樣本；總 token 在估算內（約 147k 輸入 + 40k 輸出 / 90 次請求，每包）"
    why_human: "離線只用錄好的判斷與假供應商測過流程（judge.py、test_judge.py、test_providers.py）；真模型的判斷品質、金鑰、免費額度都只有 Andy 能驗。目前 judgments.tsv 是空的，三個包的灰色詞（13,370 / 13,400 / 6,867）全部「待 AI 判斷」並照規則保留。"
  - truth: "SC4: 「三酸甘油酯」保留、「聚乙烯醇縮丁醛」與「分散式雜湊表」刪除（可理解性標準本身有效）"
    test: "跑 npm run lexicon:eval，確認 60 詞校準表一致率 >= 90%，且三個指標詞的實際 AI 判斷為 K/D/D"
    expected: "指標詞判斷符合；校準報告一致率 >= 90%"
    why_human: "範例詞表測試（test_samples.py + fixtures/recorded-judgments.tsv）斷言的是「錄好的判斷」經規則管線後的去留，證明管線接線正確，但不能證明真 AI 會照標準判。這兩個詞在目前三個詞庫包裡本來就不存在（來源沒收），三酸甘油酯只在小麥包 c00 裡。"
gaps: []
human_verification:
  - test: "提供免費 AI 金鑰並跑 AI 判斷（見上方 SC3/SC4 兩項）"
    expected: "lexicon:eval >= 90%；lexicon:judge 完成後 npm run lexicon:verify 與 npm test 仍全過；詞庫包版本號跟著變（舊快取自動失效）"
    why_human: "需要 Andy 的金鑰與免費額度"
  - test: "抽查三個包的刪除報告樣本（tools/lexicon/reports/*/REPORT.md）"
    expected: "樣本沒有明顯誤刪；重點看 WR-04 剛放行的字（裏、銹、鐧、獴、菓、肽、歐拉）是否合 Andy 的台灣語感"
    why_human: "ROADMAP Human check；允許名單是對台灣用法的主觀判斷"
  - test: "決定高頻中國用語要不要也處理"
    expected: "目前規則只刪「與對照表完全吻合且詞頻 < 100」的中國用語；高頻者保留並列為 china_kept（新酷音 79、小麥 42、唯音 64）。實測仍留有 軟件(p=330)、信息(975)、網絡(500)、菜單(242)；唯音包的 硬盤、內存、光盤、鼠標、優盤 因 TaBE 來源詞頻統一是 114 也躲過門檻"
    why_human: "這是設計取捨（高頻＝台灣也在用），不是漏做；但 ROADMAP 寫「中國專用詞被移除」，是否要把門檻改成按詞逐一判斷，或做 handoff 提到的「中國用語標記可切換」，由 Andy 決定（可併入 Phase 12）"
  - test: "在偏好設定切換四個詞庫包實際寫詞比較手感"
    expected: "切換後查韻與 AI 建議立刻只用新包的詞；打開「關於」看得到該包來源與授權"
    why_human: "ROADMAP Human check，結果供 Phase 12（LEX-08）決定"
---

# Phase 6: Lexicon Packs 台灣詞庫包 Verification Report

**Phase Goal:** 用全自動流程把多個台灣來源詞庫清洗成統一格式的「詞庫包」，網站上可以切換比較；查到的詞更符合台灣日常語感，簡體、中國用語與冷僻詞大幅減少。
**Verified:** 2026-10-09
**Status:** human_needed
**Re-verification:** No, initial verification
**Mode:** mvp (ROADMAP goal is not in User Story form; verified against the stated goal and five success criteria)

## Goal Achievement

### Observable Truths (ROADMAP success criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | 每個來源都通過授權檢查並有 NOTICE，各自產出同一格式的獨立詞庫包 | VERIFIED | `tools/lexicon/sources.lock.json` 釘 commit、sha256、licence 證據；`redistribute` 旗標把 OpenCC 與字表只當規則輸入、不再散布。`data/packs/{chewing,mcbopomofo,vanguard-tw}/` 各有 meta.json、c00..c05.json、NOTICE.txt 與授權全文（LGPL-2.1、MIT、MulanPSL-2.0、TaBE BSD-3）；v096 有 NOTICE.txt。教育部 CC BY-ND 辭典沒有被當成包出貨，唯音包的 NOTICE 明寫排除。三包我逐行掃過：格式皆為 `{w,z,p}`、字數等於音節數、無重複詞（壞列 0）。`npm run lexicon:verify`：「驗證通過：4 個詞庫包」。 |
| 2 | 設定可切換詞庫包，切換後查韻與 AI 建議改用該包；新版發布後舊快取自動失效 | VERIFIED | `js/wordlist.js`：`resolveLexiconPack`、`switchLexiconPack`（世代計數 `_wlGen`、清空 AI 字卡、失敗退回 `_lastGoodPack`）、快取鍵 `p:<id>:<i>` 與 `p:<id>:ver`、meta 版本不符或缺段就整包重抓、`?v=` 帶版本、登記簿 `p:index` 只留目前加一包。v096 沿用舊數字鍵，舊使用者零變動。`js/search-ui.js` 的 `lexiconPackList` radiogroup 與 `aboutPackName/aboutPackNotice` 已接線；`lh:lexiconPack` 已登記在 `js/safety.js` LH_KEYS。`js/candidates.js`（查韻詞候選）與 `js/ai-generate.js` 都讀 `wordlistData`，所以換包即生效。我另跑 `npx playwright test tests/lexicon-packs.spec.mjs tests/wordlist-cache.spec.mjs tests/lexicon-build.spec.mjs`：30 passed，涵蓋換包、連點換包、載入失敗退回、快取上限、版本更新只換該包。 |
| 3 | 清洗腳本一個指令跑完、不需人工逐條審核；簡體／罕用字為零、中國用語被移除；單一來源進灰色而非直接刪除；灰色由免費 AI 依可理解性判斷，token 在免費額度內 | PRESENT_BEHAVIOR_UNVERIFIED（AI 那一段）；其餘 VERIFIED | 已驗證部分：`npm run lexicon:build`（fetch + build + verify --strict）單一指令；`rules.classify` 的 R0 格式、R1 簡體、R2 罕用字、R3 中國用語（完全吻合且詞頻 < 100）、單一來源 -> `G-single-source` 灰色（新酷音 13,364 個）、`resolve` 保留未判斷者並標待判斷。我用自備簡體字表掃三包：沒有簡體專用字（命中的只有 晚、游、零、云、挂、虫、范、痒 等合法異體或姓氏）。`cmd_verify` 內含免費額度斷言（`FREE_QUOTA_TOKENS`／`FREE_QUOTA_REQUESTS`），目前估算每包約 90 次請求、147k 輸入 + 40k 輸出 token；`judge.py` 有請求上限、先估算再執行、每批存檔、可續跑。未達成部分：真正的 AI 判斷從未執行，`judgments.tsv` 只有表頭，三包 gray_pending 等於 gray（13,370／13,400／6,867），`judged_with` 為空。這是等 Andy 金鑰的項目，不是程式缺漏。注意：中國用語並非全數移除，見下方 Anti-Patterns 與人工項目。 |
| 4 | 範例詞表驗證可理解性：三酸甘油酯保留、聚乙烯醇縮丁醛與分散式雜湊表刪除 | PRESENT_BEHAVIOR_UNVERIFIED | `tools/lexicon/tests/test_samples.py` 與 `fixtures/samples.tsv`（含 15 筆以上）全部通過（`lexicon:test` 256 OK）。但兩個「刪除」詞靠的是 `recorded-judgments.tsv` 的錄好判斷，且 samples.tsv 註明是「合成證據列」。這證明管線把 D 判斷轉成 `R5-ai-incomprehensible` 刪除，不證明真模型會判 D。`lexicon:eval`（60 詞校準，WR-05 後已無與提示範例重疊）也沒跑過。 |
| 5 | 刪除報告：每個被刪的詞有原因、附原因統計與樣本；誤刪可回報加回 | VERIFIED | `tools/lexicon/reports/<id>/{REPORT.md,removed.ndjson,stats.json}`；三份 removed.ndjson 共 410 列（121／140／149），逐列檢查 `w`、`rule`、`reason` 皆非空（缺漏 0）。REPORT.md 有總覽、原因統計表、每原因最多 20 筆固定抽樣、待判斷數與 token 估算。`build.py rescue` 把詞加進 `rules/keep.json`（K0-allowlist，下次重建仍保留）並印出可貼進 `wordlist-overrides.json` 的一行；`test_report.py` 涵蓋，Playwright「刪除清單的詞放進修正檔就會回來」通過。報告不在網站執行時載入。 |

**Score:** 3/5 truths verified (2 present and wired, but real-AI behavior not exercised; routed to human verification, none FAILED)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `tools/lexicon/build.py` + `lex/{sources,parse,rules,pack,report,judge}.py` | 一鍵建置、驗證、救回、判斷、校準 | VERIFIED | 子指令 fetch/build/verify/rescue/judge/eval/all；npm scripts 齊全 |
| `tools/lexicon/sources.lock.json`, `packs.json` | 釘版來源與包設定 | VERIFIED | commit + sha256 + licence 證據 |
| `data/packs/index.json` + 3 個新包 + v096 NOTICE | 清單與包 | VERIFIED | 預設仍為 v096；清單與 packs.json 一致（verify 檢查） |
| `tools/lexicon/rules/*` | 字表、中國用語、保留、灰色 | VERIFIED | keep.json 16 筆、r3-gray 12 筆、char-allow 已補 6 字 |
| `tools/lexicon/judgments/{judgments,calibration}.tsv` | AI 判斷快取、校準表 | STUB（刻意）：judgments.tsv 只有表頭 | 等 AI 執行；calibration.tsv 60 詞 |
| `js/wordlist.js`, `js/search-ui.js`, `index.html`, `js/safety.js` | 載入、切換、關於、設定儲存 | VERIFIED | 見 SC2 |
| `tests/lexicon-packs.spec.mjs`, `tests/lexicon-build.spec.mjs`, `tools/lexicon/tests/*` | 自動驗證 | VERIFIED | 30 項 Playwright 子集通過；lexicon:test 256 OK |

### Key Link Verification

| From | To | Via | Status |
|------|----|-----|--------|
| 偏好設定 radiogroup | `switchLexiconPack` | change 事件 -> `switchLexiconPack(radio.value)` | WIRED |
| `switchLexiconPack` | `loadWordlist` -> `wordlistData` -> `candidates.js`／`ai-generate.js` | 重置全域、重載、重跑搜尋 | WIRED |
| `data/packs/index.json` | `loadLexiconManifest` | fetch no-cache，逐項格式檢查 | WIRED |
| 包 meta.version | IndexedDB 快取與 `?v=` | `useCache` 需版本相同且各段齊全 | WIRED |
| `build.py build` | `data/packs/*` 與 `reports/*` | 兩階段：解析全部再套規則 | WIRED（verify 通過） |
| 灰色詞 -> `judge.py` -> `judgments.tsv` -> 重建 | `resolve()` | 程式接線完整，但資料端尚無判斷 | WIRED, DATA EMPTY |

### Requirements Coverage

| Requirement | Description | Status | Evidence |
|-------------|-------------|--------|----------|
| LEX-01 | 多個台灣來源、授權相容、NOTICE | SATISFIED | SC1 |
| LEX-02 | 移除簡體／罕用字與中國專用詞 | SATISFIED（有保留意見） | 簡體與罕用字掃描為零；中國用語僅移除低頻完全吻合者，高頻者列入 china_kept，見人工項目 |
| LEX-03 | 可理解性標準 | SATISFIED in pipeline, NEEDS HUMAN for real-AI | 提示與校準表就位；未用真模型驗證 |
| LEX-04 | 全自動、單一來源降灰、免費 AI 批次、token 在額度內 | SATISFIED in code and estimate, NEEDS HUMAN to execute | SC3 |
| LEX-05 | 刪除原因、報告、救回 | SATISFIED | SC5 |
| LEX-06 | 新版本發布、舊快取自動失效 | SATISFIED | SC2 與 wordlist-cache 測試 |
| LEX-07 | 統一格式、獨立包、可切換 | SATISFIED | SC1／SC2 |

REQUIREMENTS.md 中 LEX-01..07 皆已勾選且對應 Phase 6，無遺漏的 ID；LEX-08 屬 Phase 12，不在本階段範圍。計畫 frontmatter 宣告的 ID 與 REQUIREMENTS 對照無孤兒。

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| 已提交詞庫包通過離線驗證 | `python3 -B tools/lexicon/build.py verify` | 驗證通過：4 個詞庫包 | PASS |
| 管線單元測試 | `python3 -B -m unittest discover -s tools/lexicon/tests -t tools/lexicon` | OK（256） | PASS |
| 換包、快取、版本失效 | `npx playwright test tests/lexicon-packs.spec.mjs tests/wordlist-cache.spec.mjs tests/lexicon-build.spec.mjs` | 30 passed | PASS |
| 包內資料完整性 | 自寫腳本掃 `data/packs/*/c*.json` | 壞列 0；重複 0；字數對音節數 | PASS |
| 刪除原因完整 | 自寫腳本掃 `removed.ndjson` | 410 列皆有 w／rule／reason | PASS |
| 工作區乾淨 | `find tools -name __pycache__`；`git status` | 無 `__pycache__`；僅 handoff.md 已修改、.gsd/ 未追蹤（本次驗證未動原始碼） | PASS |

Probe Execution: none declared; SKIPPED.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `tools/lexicon/lex/rules.py` | 294 | 中國用語只在詞頻 < 100 時刪 | WARNING | 新酷音留有 軟件(330)、信息(975)、網絡(500)、菜單(242)；唯音包 硬盤、內存、光盤、鼠標、優盤 全是 p=114（TaBE 來源預設詞頻），門檻攔不到。是文件記載的設計取捨且列入報告，未違反「大幅減少」，但與 SC3 字面「被移除」有落差 |
| `tools/lexicon/judgments/judgments.tsv` | n/a | 無判斷資料 | INFO | 等金鑰；三包全部灰色詞待判斷並保留 |
| debt marker (TBD/FIXME/XXX) | n/a | 未逐檔掃出無參照標記 | INFO | review 已跑過，IN-01..IN-08 為 Info |

### Human Verification Required

見檔頭 `human_verification`：

1. **AI 金鑰與判斷**：`npm run lexicon:eval`（>= 90%）-> `npm run lexicon:judge` -> `lexicon:verify`、`npm test`。
2. **抽查刪除報告**：特別看 WR-04 放行的 裏、銹、鐧、獴、菓、肽、歐拉。
3. **高頻中國用語取捨**：軟件、信息、網絡、菜單、硬盤、鼠標等是否要處理。
4. **實際切換詞庫包寫詞**，結果供 Phase 12。

### Gaps Summary

沒有 FAILED 的真值，也沒有缺失或空殼的程式。程式端的詞庫包流程、離線測試、網站切換與快取失效都有實證（30 項瀏覽器測試與 256 項 Python 測試實跑通過）。剩下的兩項不是程式缺口：真 AI 灰色判斷與可理解性標準的真實驗證，需要 Andy 的免費 Gemini 金鑰；範例詞表測試目前只證明管線接線，不證明模型判斷。另有一項建議 Andy 決定：高頻中國用語目前依設計保留。

---

_Verified: 2026-10-09_
_Verifier: Claude (gsd-verifier)_
