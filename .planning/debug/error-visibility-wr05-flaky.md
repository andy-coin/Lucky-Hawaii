---
status: verifying
trigger: "tests/error-visibility.spec.mjs:123 (WR-05 回報送不出去時視窗與輸入的文字都保留) fails ~1 in 3-9 full parallel npm test runs, never in isolation"
created: 2026-10-04T00:40:00+08:00
updated: 2026-10-04T01:20:00+08:00
---

## Current Focus

hypothesis: CONFIRMED - openFeedbackModal's setTimeout(focus #feedbackSubject, 50ms) lands between Playwright fill('#feedbackBody')'s in-page focus()+select() and its separate CDP keyboard.insertText, so the body text is typed into the subject field
test: 5x full npm test with the test-side fix; 3x120 WR-05 runs under 32 CPU hogs
expecting: zero failures
next_action: commit test(01) fix after the 5 full runs are green

reasoning_checkpoint:
  hypothesis: "50ms focus timer in openFeedbackModal fires inside fill(body)'s focus->insertText window under load, moving focus to the subject input, so insertText types the body text into the subject"
  confirming_evidence:
    - "Natural failure captured twice (2/120 under 32 CPU hogs): Received subject '我的主旨我寫了很久的內文' at spec line 131"
    - "Deterministic stub (timer fires at body focusin): original steps corrupt 10/10, with-wait steps 0/10"
  falsification_test: "If the fixed test still fails under the same load with the same signature, or the failure signature were anything else (modal closed, button disabled, toast/console error), the hypothesis is wrong"
  fix_rationale: "Wait for the app's own deferred focus (toBeFocused on #feedbackSubject) before typing, so no pending timer remains while fill() runs; this synchronizes the test on the app effect instead of racing it"
  blind_spots: "Other tests that type right after a deferred focus (none found: grep shows only this test uses openFeedbackModal + fill)"
  candidate_causes:
    - "code: 50ms focus timer vs fill() two-step (confirmed)"
    - "environment: CPU contention stretches the CDP gap between focus and insertText (necessary condition for the race to be hit)"
  and_gate: "yes - timer pending at fill time (code) AND slow roundtrip under load (environment); either alone is benign"

## Symptoms

expected: modal stays open, both inputs keep typed text, send button re-enabled after a 500 from /feedback
actual: intermittent failure ~1/3-9 full parallel runs
errors: expect(locator('#feedbackSubject')).toHaveValue('我的主旨') Received '我的主旨我寫了很久的內文'
reproduction: 32 busy-loop processes + `playwright test tests/error-visibility.spec.mjs -g WR-05 --repeat-each=120 --workers=16` => 2 failed / 118 passed
started: since WR-05 test was added

## Eliminated

- hypothesis: sendBtn stays disabled / settle() too short / toast or console filter in expectQuiet / postFeedback timing
  evidence: failure is at the subject toHaveValue assertion (line 131), before toBeEnabled/expectQuiet; evaluate(submitFeedback) awaits the whole async chain so postFeedback has finished and finally{} re-enabled the button
  timestamp: 2026-10-04

## Evidence

- Playwright 1.63 fill(): evaluateInUtility(checkElementStates + injected.fill [focus+select]) returns 'needsinput', THEN a separate CDP keyboard.insertText (node_modules/playwright-core/lib/coreBundle.js:20394-20407)
- 14 consecutive full-suite runs on a quiet machine were green (cannot repro without extra load)
- Under 32 CPU hogs the isolated test fails 2/120 with the signature above

## Resolution

root_cause: Test did not wait for openFeedbackModal's deferred (50ms) focus on #feedbackSubject; under CPU load the timer fires between fill(#feedbackBody)'s focus and insertText, moving focus to the subject input so the body text is appended to the subject. Not an app bug (a human cannot click into the body within 50ms of opening the modal).
fix: tests/error-visibility.spec.mjs - after openFeedbackModal, await expect(#feedbackSubject).toBeFocused() before the fills
verification: see final report
files_changed: [tests/error-visibility.spec.mjs]
