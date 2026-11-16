---
phase: 10-rhyme-map
plan: 06
subsystem: ui
tags: [rhyme-map, polyphonic, readings, selection-bar, backup-import, a11y, playwright]
status: complete

requires:
  - phase: 10-rhyme-map
    provides: "10-05: #rhymeSelBar and its show-time snapshot, lhMapHideBar; 10-01: lhRhymeTarget / lhRhymeReading / lhRhymeAnalyze with the readings argument"
provides:
  - "lhRhymeManual(t, readings), row.manual in lhRhymeAnalyze, lhRhymeCleanReadings(raw) in js/rhyme-core.js"
  - "「指定讀音」 button + reading row (.rm-bar-reading, .rm-chip) in #rhymeSelBar; lhMapReadingToggle(), lhMapSetReading(secId, tail, reading)"
  - "song field readings (inside lh:songs, no new storage key); lhNormalizeSong keeps cleaned readings on import"
  - ".rm-hl.rm-manual dotted underline cue"
affects: [10-07 stats (rows may read row.manual), 10-08 UAT list]

actuals:
  tokens: 9000
  tasks: 2
  commits: 2
plan_head_before: dd4af64592ae6b36ddc237f1737df3c621e4f839
plan_head_after: 605e43d5f46198fc9f1485b190cf172837af57f5

tech-stack:
  added: []
  patterns:
    - "Manual reading = per-song object keyed by the line tail (<= 4 consecutive Han chars ending at the effective tail char); applies only while the key matches exactly and the value is a legal reading of that char (lhRhymeManual is the single gate, used by both the reading lookup and the cue)"
    - "Import whitelist in one function (lhRhymeCleanReadings) called from lhNormalizeSong at run time; the field is written only when something survives"

key-files:
  created: []
  modified:
    - js/rhyme-core.js
    - js/rhyme-map.js
    - js/safety.js
    - css/panels.css
    - tests/rhyme-core.spec.mjs
    - tests/rhyme-map-ui.spec.mjs

key-decisions:
  - "Button condition as implemented: the selection's last Han char must be isPolyphonic AND must be exactly the line's effective tail (lhRhymeTarget with the current skipParticles) at the same code-point index; computed once at show time and kept in the snapshot as rd = { tail, char }"
  - "Key format: the tail string ending at the target char, up to 4 consecutive Han characters (e.g. 們一起行), exactly what lhRhymeTarget returns as t.tail"
  - "aria-pressed marks the reading that is currently in effect (manual if set and legal, otherwise the automatic one); the 「自動」 chip is never pressed. Focus goes to the pressed chip when opened by keyboard"
  - "Import is lenient for characters the dictionary cannot answer for (dictionary not loaded yet, or a rare char with no readings): such an entry is kept, because lhRhymeManual re-checks legality at use time and can never apply a wrong reading; strictly dropping would lose Andy's data if an import ran before the dictionary was ready"
  - "lhMapSetReading ignores a reading that is not a legal reading of the tail's last char (defence in depth, UI never offers one)"

requirements-completed: []

coverage:
  - id: D1
    description: "Selecting the effective tail char (行 in 我們一起行) shows 「指定讀音」; the row lists 自動 + dictionary readings in order; choosing one recolors the band at once (data-f of the new rhyme family), adds rm-manual, writes song.readings, announces in #lhLive, closes the bar, and survives a reload"
    requirement: MAP-08
    verification:
      - kind: e2e
        ref: "tests/rhyme-map-ui.spec.mjs#讀音：破音字句尾可以指定讀音"
        status: pass
    human_judgment: false
  - id: D2
    description: "「自動」 removes the key and the whole readings field when empty, returns the automatic color, no rm-manual, announces 「行」讀音改回自動"
    requirement: MAP-08
    verification:
      - kind: e2e
        ref: "tests/rhyme-map-ui.spec.mjs#讀音：自動改回字典讀音"
        status: pass
    human_judgment: false
  - id: D3
    description: "The button does not appear for a mid-line char, a polyphonic char in the middle of a line, a non-polyphonic tail, or a trailing particle skipped by 忽略語助詞"
    requirement: MAP-08
    verification:
      - kind: e2e
        ref: "tests/rhyme-map-ui.spec.mjs#讀音：不是句尾或不是破音字就沒有指定讀音"
        status: pass
    human_judgment: false
  - id: D4
    description: "Keyboard path (Alt+Down, arrows, Enter) lands focus on the pressed chip; Enter on a chip applies and returns focus and selection to the textarea; button and every chip are >= 44x44 on phone, tablet, landscape tablet"
    requirement: MAP-08
    verification:
      - kind: e2e
        ref: "tests/rhyme-map-ui.spec.mjs#讀音：鍵盤打開時焦點先到目前的讀音，Enter 選定後焦點回輸入框; #讀音：觸控時指定讀音按鈕與每個晶片至少 44×44"
        status: pass
    human_judgment: false
  - id: D5
    description: "Editing the line so the tail key changes silently stops applying the reading (cue gone, automatic color back, other lines untouched, no toast, stored readings untouched)"
    requirement: MAP-08
    verification:
      - kind: e2e
        ref: "tests/rhyme-map-ui.spec.mjs#讀音：改了句尾就自動失效"
        status: pass
    human_judgment: false
  - id: D6
    description: "Backups carry readings; import keeps only valid entries (key 1-4 Han, value zhuyin + optional tone and a legal reading of the key's last char, <= 2000 per song), drops the rest while the song still imports, writes the field only when something survives; no prototype pollution"
    requirement: MAP-08
    verification:
      - kind: e2e
        ref: "tests/rhyme-map-ui.spec.mjs#備份：手動讀音跟著備份走; #備份：不合法的讀音被丟掉，歌照常匯入; #備份：每首歌最多留 2000 筆讀音"
        status: pass
      - kind: unit
        ref: "tests/rhyme-core.spec.mjs#讀音：清洗——合法的原樣留下; #壞的鍵與值整個丟掉; #混合時只留合法的，回傳全新的普通物件; #一首歌最多 2000 筆"
        status: pass
    human_judgment: false
  - id: D7
    description: "A Phase 9 song without readings: lh:songs raw string byte-identical after boot and first paint, no readings in its backup; another tab's reading change recolors this tab and clearing it restores"
    requirement: MAP-08
    verification:
      - kind: e2e
        ref: "tests/rhyme-map-ui.spec.mjs#讀音：舊歌沒有讀音時開機不寫入; #讀音：別的分頁指定的讀音"
        status: pass
    human_judgment: false
---

# Phase 10 Plan 06: Manual Reading (指定讀音) Summary

在歌詞句尾反白一個破音字（例如「我們一起行」的「行」），選取下方的浮動列多一顆「指定讀音」；展開後選「自動」或字典裡的某個讀音，該段顏色馬上換、句尾字多一條虛線底線，選擇存進這首歌的 `readings`，重新整理、別的分頁、備份都跟著走，而且不會套到別的字或別的句子。

## Performance

- **Tasks:** 2 (1 tracer, 1 auto/tdd); **commits:** 2 (`7cd1b5f`, `605e43d`)
- **Files:** 6 modified (`js/rhyme-map.js` +~100, `js/rhyme-core.js` +~30, `js/safety.js` +6, `css/panels.css` +17, `tests/rhyme-core.spec.mjs` +33, `tests/rhyme-map-ui.spec.mjs` +~270)
- **`npm test`:** 937 passed, 28 skipped, 0 failed (10-05 baseline 922 / 28); `package.json` / `package-lock.json` untouched

## Accomplishments

- **Tracer (`7cd1b5f`).** `row.manual` in `lhRhymeAnalyze` (via a new single gate `lhRhymeManual`), the button + reading row inside `#rhymeSelBar`, `lhMapSetReading`, `.rm-manual` / `.rm-chip` CSS, three UI specs plus keyboard and touch-size specs.
- **Boundaries (`605e43d`).** `lhNormalizeSong` runs `lhRhymeCleanReadings` on import; specs for key invalidation, no write at boot, cross-tab, backup round trip, hostile import, 2000-entry cap, and the Node cleaning matrix.

## As implemented

- **Button condition.** At show time the line around the selection's last Han char is run through `lhRhymeTarget(line, skipParticles)`. The button appears only if that target is the same char at the same code-point index and `isPolyphonic(char)`. The result `{ tail, char }` rides in the show-time snapshot, so buttons never re-read the selection.
- **Key format.** `t.tail` from `lhRhymeTarget`: the up-to-4 consecutive Han chars ending at the effective tail char (`們一起行`). `song.readings = { '們一起行': 'ㄏㄤˊ' }`; the object is removed entirely when its last key is cleared.
- **Reading row.** Label 「「{字}」讀音」, chip 「自動」, then one chip per `getCharAllReadings(char)` in dictionary order. The chip of the reading currently in effect is `aria-pressed="true"` (700 weight, accent stripe); opened by keyboard, focus goes to it. Choosing a chip: write or delete the key, `markDirty` + `flushSongs`, bump `_lhMapReadVer`, repaint that section, `lhAnnounce`, hide the bar. Not an undo step, never goes through `lhSecApply`.
- **Applies only while valid.** `lhRhymeManual` requires the exact key and a value that is a legal reading of the tail char; an edit that changes the key (or a char swap) makes it silently stop applying while the stored entry stays untouched (typing the char back would apply it again).
- **Import whitelist (`lhRhymeCleanReadings`).** Own keys only; key `/^\p{Script=Han}{1,4}$/u` (so `__proto__`, `constructor`, 5 chars, Latin, digits are out); value `/^[ㄅ-ㄩ]{1,4}[ˊˇˋ˙]?$/` and a legal reading of the key's last char; at most 2,000 per song; returns a fresh plain object or `null`. Dropped: bad keys, non-string values (numbers, arrays, null), values with stray spaces, readings that are not legal for the char (ㄅㄚ for 樂), anything over the cap; a whole `readings` that is an array / string / null / `{}` / all-invalid disappears and the song still imports.

## Deviations from Plan

### Auto-fixed Issues

None needed code fixes beyond the plan; two small test-harness slips were corrected while writing the specs (a missing `activeSongRaw` import, and `#copyToast` not existing in the DOM until first used, so the "no toast" check counts `#copyToast.show`).

### Notes on plan execution

- `lhRhymeCleanReadings` was written in Task 1's commit (it lives in `js/rhyme-core.js` next to the other change to that file); Task 2's commit wires it into `lhNormalizeSong` and adds its tests. TDD for Task 2 was therefore test + implementation together rather than a separate RED commit.
- **Judgment call (documented above):** characters the dictionary has no readings for do not fail the legality check on import. See key-decisions; use-time validation still protects every coloring path.
- The Chinese label is 「指定讀音」 (orchestrator copy decision), not the UI-SPEC's 「讀音」.

## Known Stubs

None.

## Threat Flags

None new. T-10-12 mitigated as listed (own keys, 1-4 Han key regex, value regex + dictionary legality, 2000 cap, fresh object; covered by Node and import specs, including `({}).polluted` and prototype checks). T-10-13: chips, label and announcements use `textContent` only (acorn HTML-sink scan in the full suite passes). T-10-SC: no package installed.

## Items for Andy (not done unattended)

- UAT (10-08): A3 「手動讀音綁定句尾 4 字」, the narrower button condition (only at the effective tail), readings not being an undo step, the stale-but-kept entry after a tail edit, real-device feel of the second row in the floating bar (phone keyboard open).
- No `?v=` cache-busting bump; bump at release time. `-linux` and `-darwin` baselines untouched (no screenshots changed).
- `requirements-completed` left empty on purpose: MAP-08 is also declared by a later plan in this phase (10-08), so it is not marked complete in REQUIREMENTS.md yet.

## Self-Check: PASSED

- Files exist: `js/rhyme-core.js`, `js/rhyme-map.js`, `js/safety.js`, `css/panels.css`, `tests/rhyme-core.spec.mjs`, `tests/rhyme-map-ui.spec.mjs`, this SUMMARY.
- Commits `7cd1b5f`, `605e43d` in `git log`; `rev-list --count` since the ledger base is 2.
- Acceptance greps: `指定讀音` in `js/rhyme-map.js` 3, `rm-manual` in `css/panels.css` 1, `讀音：` in the UI spec 7 (core spec 1+), `lhRhymeCleanReadings(` in `js/safety.js` 1, `備份：` in the UI spec 5.
- Full `npm test`: 937 passed, 0 failed; `git diff --stat HEAD -- package.json package-lock.json` empty.
