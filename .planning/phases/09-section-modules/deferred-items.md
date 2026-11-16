# Deferred items (Phase 9)

- 09-08: `tests/undo.spec.mjs` 「復原：只換一格」 fails at HEAD cf59eee (before any 09-08 change): scrollTop after the undo re-render is 3114, expected 3153 (39 px). Verified by reverting js/ and css/ to HEAD and re-running. Not caused by plan 09-08; not touched.

- 09-10: the `tests/undo.spec.mjs` 「復原：只換一格」 flake above is RESOLVED. Root cause: test timing (a leftover Chromium caret-reveal smooth scroll moved the list 20-50 px after the click, before the baseline was read); the product restores the exact scrollTop it had at undo time. Fixed in tests/undo.spec.mjs (scrollRest), 600/600 green under 24 workers (commit d7887cb).
