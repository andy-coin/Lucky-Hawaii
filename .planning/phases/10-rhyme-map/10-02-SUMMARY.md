---
phase: 10-rhyme-map
plan: 02
subsystem: ui
tags: [rhyme-map, lookup-parity, lexicon-pack, playwright, node-vm]
status: complete

requires:
  - phase: 10-rhyme-map
    provides: "10-01: lhRhymeMatch / lhRhymeAnalyze in js/rhyme-core.js, lhMapOnLexiconChange in js/rhyme-map.js, rhyme-core.js in tests/node-core.mjs CORE"
provides:
  - "查韻 AI 詞篩選與驗證、詞庫篩選的四處家族／嚴格比較全部呼叫 lhRhymeMatch（與韻腳地圖同一個判定）"
  - "tests/rhyme-parity.spec.mjs：9,800 組字對三邊一致、字卡 ㄣ／ㄥ 例外、空韻請求鎖定"
  - "switchLexiconPack 換包成功與退回載入後呼叫 lhMapOnLexiconChange"
affects: [10-03 alignment/perf, 10-08 UAT list (OQ1, OQ2)]

actuals:
  tokens: 14000
  tasks: 2
  commits: 2
plan_head_before: d9c816c306043b4de1706125abe7a11660e4062a
plan_head_after: 343f8725842fd21b042c8353a6d87399d292310a

tech-stack:
  added: []
  patterns:
    - "Equivalence refactor guarded by a test that passes on the old and the new code"
    - "typeof-guarded call from wordlist.js into rhyme-map.js (load order independent)"

key-files:
  created:
    - tests/rhyme-parity.spec.mjs
  modified:
    - js/candidates.js
    - js/wordlist.js
    - tests/lexicon-packs.spec.mjs

key-decisions:
  - "validateWordRhyme keeps its `fam === undefined -> false` guard (AI-only rule); filterWordsByRhymeSingle gets an explicit `if (!searchRhyme) continue` so an empty rhyme still always rejects"
  - "Card-lookup invariant is checked with the polyphonic reading pinned (as a chip click does); unpinned, searchRhyme lists every reading and the invariant does not apply"

requirements-completed: []

coverage:
  - id: D1
    description: "查韻篩選／驗證與韻腳地圖對 9,800 組字對給同一個答案（寬韻與嚴格），重構前後都通過，查韻結果沒有任何變動"
    requirement: MAP-01
    verification:
      - kind: e2e
        ref: "tests/rhyme-parity.spec.mjs#共用：九千八百組字對三邊一致; tests/golden.spec.mjs and tests/core-node.spec.mjs unchanged and green"
        status: pass
    human_judgment: false
  - id: D2
    description: "字卡查韻只多出 ㄣ／ㄥ 借韻例外；空韻母請求永遠沒有候選（重構前後同為空）"
    requirement: MAP-01
    verification:
      - kind: e2e
        ref: "tests/rhyme-parity.spec.mjs#共用：字卡查韻只多出 ㄣ／ㄥ 這個已知例外, #共用：空的韻母請求永遠沒有候選"
        status: pass
    human_judgment: true
    rationale: "Whether the ㄣ／ㄥ difference between 字卡 and 地圖 colors is acceptable is Andy's UAT call (OQ2)"
  - id: D3
    description: "換詞庫包後句尾讀音重讀並重畫（成功與退回兩條路）"
    requirement: MAP-01
    verification:
      - kind: e2e
        ref: "tests/lexicon-packs.spec.mjs#詞庫包：換包後韻腳地圖用新包的詞讀音, #詞庫包：換包失敗退回原包時，韻腳地圖也重畫一次"
        status: pass
    human_judgment: false
---

# Phase 10 Plan 02: Lookup Parity Summary

查韻的 AI 詞篩選、驗證、詞庫篩選現在和韻腳地圖呼叫同一個 `lhRhymeMatch`，用 9,800 組字對證明三邊答案逐組一致；另外換詞庫包後地圖會自動重讀句尾。

## Performance

- **Duration:** about 10 min (executed unattended)
- **Tasks:** 2 (1 tracer, 1 auto)
- **Files:** 1 created, 3 modified (4 files, +173 / -14)
- **Commits:** `258e232` refactor (Task 1), `343f872` feat (Task 2)

## Accomplishments

- **Parity spec first, on the old code.** `tests/rhyme-parity.spec.mjs` 「共用：九千八百組字對三邊一致」: 70 query chars (50 single-reading + 20 polyphonic) x 70 single-reading candidates x {寬韻, 嚴格} = 9,800 pairs; per pair `validateWordRhyme('一'+c)`, membership in `filterWordsByRhymeSingle` over a temporary one-entry-per-candidate wordlist, and `lhRhymeAnalyze(q+'\n'+c).letters === 'AA'` must agree. Passed before the refactor and after it, unchanged. It also asserts both rhyming and non-rhyming pairs exist (more than 300 of each) so it cannot pass vacuously.
- **Four edit sites** (all with a 「與韻腳地圖共用同一個判定（MAP-01）」 comment): `js/candidates.js` `filterWordsByRhymeSingle` (strict / family comparison, `searchFamilyId` removed as unused), `validateWordRhyme` single-character branch and multi-character branch; `js/wordlist.js` `filterWordsByRhyme` single and multi-character branches. `grep -c "lhRhymeMatch("` is 3 and 2; `fam === undefined` guard still present once.
- **Nothing in 查韻 moved.** `tests/golden.spec.mjs`, `tests/fixtures`, `tests/golden` have no diff; golden and core-node pass. Full `npm test`: 874 passed, 27 skipped, 0 failed (10-01 baseline 869; +5 new tests).
- **Unreachable edge locked.** `currentRhymes = [{ rhyme: '', initial: '' }]` returns `[]` in both modes; verified against the pre-refactor `candidates.js` / `wordlist.js` (loaded from `258e232~1` in a scratch vm run) as well as the new code.
- **Lexicon switch repaint (CONTEXT A5).** `switchLexiconPack` calls `lhMapOnLexiconChange()` before returning true and inside the rollback `back.then(...)` (same guard as the existing refresh). Test: line ending 甲一 is `data-f 0` with the v0.96 stub and `9` right after `switchLexiconPack('alpha')` resolves true; a failing alpha switch repaints at least once after the rollback load and the colors return to `0`.

## UAT notes for Andy (go on the 10-08 list)

- **OQ2 (ㄣ／ㄥ):** 字卡 lookup uses `BORROW_MAP`, which borrows ㄣ↔ㄥ one way; the family table does not. So a query on 人 lists ㄥ-rhyme cards, but the map (寬韻) colors 人 and 風 differently. The spec 「共用：字卡查韻只多出 ㄣ／ㄥ 這個已知例外」 pins this as the only difference when the polyphonic reading is pinned. Decide whether that is acceptable.
- **OQ1 (空韻 grouping):** rhymeless tails group per the existing filter; excluded from the three-way parity because `validateWordRhyme` rejects family-less requests by its AI-only guard.
- A polyphonic query character with no chip chosen shows the cards of every reading, so card results can legitimately contain other families; this is pre-existing behavior and not part of the invariant.

## Deviations from Plan

None - plan executed exactly as written. Two details beyond the text, neither a deviation: the card-lookup test pins `_polyphonic` to the first reading (otherwise searchRhyme unions all readings of a polyphonic character and the invariant would not apply), and the parity spec adds the hit-count guard.

## Known Stubs

None.

## Threat Flags

None. No new endpoint, storage key, or fetch; `package.json` / `package-lock.json` unchanged (T-10-SC); T-10-04 mitigated by the parity spec passing before and after plus unchanged golden / core-node expectations.

## Items for Andy (not done unattended)

- No `-linux` or `-darwin` visual baselines were touched (none needed).
- Nothing was pushed or deployed.

## Next Phase Readiness

Ready for 10-03. MAP-01 is shared with later plans and is not marked complete in REQUIREMENTS.md.

## Self-Check: PASSED

- `tests/rhyme-parity.spec.mjs` exists; commits `258e232` and `343f872` found in `git log`; `rev-list` count since the ledger base is 2.
- Acceptance: `lhRhymeMatch(` 3 / 2, `fam === undefined` 1, `lhMapOnLexiconChange()` 2, `共用：` 3, golden/fixtures/package diffs empty, plan-level `npm test` 874 passed 0 failed.
