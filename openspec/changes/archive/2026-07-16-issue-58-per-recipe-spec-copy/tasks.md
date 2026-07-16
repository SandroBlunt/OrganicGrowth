## 1. Retire post_copy from the Production-Spec contract + validator (test-first)

- [x] 1.1 Write failing tests: `production-spec/validate.test.ts` proves a well-formed Spec with no
  `post_copy` field validates `ok: true`, and a stray `post_copy` field present on a Spec is simply
  ignored (not scanned/required); `generate.test.ts` proves `generate()` never emits `post_copy`.
- [x] 1.2 Implement: `contract.ts` drops the `post_copy` field from `ProductionSpec` and deletes
  `MAX_POST_COPY_CHARS`/`MIN_POST_COPY_EMOJIS`/`MAX_POST_COPY_EMOJIS`; `validate.ts` drops the four
  `post_copy_*` checks/codes and the local `countEmojis`; `generate.ts` drops `buildPostCopy`/
  `countEmojis`/`POST_COPY_EMOJI_TAIL` and the `post_copy` field of `Brief`.
- [x] 1.3 Update `fixtures/specs.ts` (drop `post_copy` from `validSpec()` and the now-meaningless
  `longPostCopy`/`zeroEmojis`/`fourEmojis`/`nestedPostCopy` fixtures) and `compose.test.ts` (re-target
  the banned-word-smuggling test to a media field; drop `post_copy` from the injected-bad-generator
  fixture) so `composeSpec` STILL writes a valid Spec end-to-end.

## 2. Re-point the banned-word scan onto composed Copy, share the matching core (test-first)

- [x] 2.1 Write failing tests: `brand-safety.test.ts` proves the Spec-shape scan no longer reads a
  `post_copy` field even when one is present on the raw object.
- [x] 2.2 Implement: factor `brand-safety.ts`'s matching loop into an exported `scanTextFields(fields,
  bannedWords)`; `scanForBannedWords` becomes `scanTextFields(collectTextFields(spec), bannedWords)`;
  `collectTextFields` drops its `post_copy` collection.

## 3. Bring `required_cta`/`required_hashtags` live (test-first)

- [x] 3.1 Write failing tests (`production-spec/brand-profile.test.ts`, new file):
  `requiredCtaFrom`/`requiredHashtagsFrom` are pure/defensive (blank/absent/non-string/non-array all
  degrade safely, mirroring `bannedWordsFrom`); `loadCopyRules` bundles all three rules from one file
  read, and defaults safely when the file is missing.
- [x] 3.2 Implement `production-spec/brand-profile.ts`: `requiredCtaFrom`, `requiredHashtagsFrom`,
  `BrandCopyRules`, `loadCopyRules` (refactored to share one `readProfile` I/O helper with
  `loadBannedWords`).

## 4. The Copy step's deep modules — `src/copy/` (test-first)

- [x] 4.1 Write failing tests + implement `contract.ts`: `Copy` (`{ caption, hashtags }`), `CopyShape`
  (`{ maxChars, minEmojis, maxEmojis }` — structurally identical to `Recipe.copyShape`, no import from
  the registry).
- [x] 4.2 Write failing tests (`inject.test.ts`) + implement `inject.ts`: `injectRequiredCta` (append if
  absent, dedupe case-insensitively if present, no-op when `requiredCta` is `null`/blank);
  `injectRequiredHashtags` (append missing required hashtags in configured order, normalized to carry a
  leading `#`, dedupe `#`/case-agnostically against what's already present, preserve existing
  order/entries); `injectRequiredParts` combines both.
- [x] 4.3 Write failing tests (`validate.test.ts`) + implement `validate.ts`: `validateCopy(copy, shape,
  rules)` — pure, hermetic — checks caption presence/length/emoji-count against the CALLER-supplied
  `shape` (proven against the real wired Recipe's `180/1/3` AND a deliberately different shape, so the
  values are provably per-Recipe, not hard-coded), required-CTA presence, required-hashtag presence, and
  a banned-word scan (reusing `scanTextFields`) — reject-only, never rewrites.
- [x] 4.4 Write failing tests (`draft.test.ts`) + implement `draft.ts`: `CopyDrafter` (the injectable
  seam), `defaultDraftCopy` — deterministic (no model call/I-O/clock), always produces Copy passing
  `validateCopy` for the SAME shape it drafted for, respects an arbitrary `CopyShape` (not hard-coded to
  180/1-3), and folds an optional `mediaContext` into the caption (proving copy CAN reference the
  realised media — composed late).
- [x] 4.5 Write failing tests (`compose.test.ts`, the SINGLE-RECIPE PATH) + implement `compose.ts`:
  `composeCopy(input, shape, options)` wires draft → inject → validate; proven against the REAL wired
  *Character Explainer with Cast* Recipe's own `copyShape` (`getRecipe(...)!.copyShape`, never a
  hand-rolled shape) and a deterministic FAKE drafter standing in for the producer's LLM job (never a
  live model): injects required parts when the fake omits them, dedupes when the fake already included
  them, REFUSES (never rewrites) a fake-drafted banned word, REFUSES a shape violation, composes
  referencing `mediaContext`, degrades safely on a missing Brand Profile, and never leaks a
  watermark/handle field.

## 5. The seeded Recipe's copy shape becomes its own literal params (test-first)

- [x] 5.1 Write failing tests: `recipe/registry.test.ts` asserts `copyShape.maxChars/minEmojis/maxEmojis`
  against literal `180`/`1`/`3` (no longer importing the deleted Spec-contract constants) and that the
  Spec no longer carries `post_copy`.
- [x] 5.2 Implement `recipe/registry.ts`: drop the `MAX_POST_COPY_CHARS`/etc. import; declare
  `CHARACTER_EXPLAINER_COPY_MAX_CHARS`/`_MIN_EMOJIS`/`_MAX_EMOJIS` as this Recipe's OWN local constants
  (same values); update `specShape.description`/`copyShape.description` prose.

## 6. Copy stored structured on the Asset, surfaced verbatim at Publish (test-first)

- [x] 6.1 Write failing tests: `asset/asset.test.ts` — `parseCopy` (well-formed, defaults `hashtags` to
  `[]`, drops non-string hashtag entries, returns `null` on missing/blank `caption` or non-object input);
  `parseAssetRecord`'s existing "every optional field" test updated to a structured `copy` object.
- [x] 6.2 Implement `asset/asset.ts`: `LedgerAssetRecord.copy` becomes `Copy | undefined`; add
  `parseCopy`; `parseAssetRecord` uses it.
- [x] 6.3 Write failing tests: `commands/run-pipeline.test.ts` — Gate 3 (Publish) surfaces a produced
  Asset's `copy.caption`/`copy.hashtags` VERBATIM, and the `/log-post` hint names the Recipe explicitly.
- [x] 6.4 Implement `commands/run-pipeline.ts`: the publish-phase message iterates each produced Idea's
  produced Assets, printing the Recipe-explicit `/log-post` hint plus the Copy (when present) verbatim.

## 7. Docs

- [x] 7.1 Update `.claude/agents/producer.md`: Phase B gains a "Compose the Copy" step (draft late, in
  the Format's voice; deterministic required-CTA/hashtag injection; the pure per-Recipe check; banned
  words are reject-only — STOP, never silently rewrite); the Hard-boundary/Guardrails sections restate
  that Copy leaves the Space entirely and the watermark stays a Space parameter, never copy.

## 8. OpenSpec

- [x] 8.1 Author `proposal.md`, this `tasks.md`, and spec deltas: ADDED `copy-composition`; MODIFIED
  `production-spec` (post_copy retired — same headers, no rename needed); MODIFIED `recipe-registry`
  (copyShape sourcing — same header); MODIFIED `asset-store` (structured `copy` — same header); MODIFIED
  `run-pipeline-conductor` (Gate 3 surfaces Copy — same header).
- [x] 8.2 `npx openspec validate issue-58-per-recipe-spec-copy --strict` green.

## 9. Self-review

- [x] 9.1 `npm test` green (type-check + full suite, 929 baseline → verify no regressions, only
  additions/faithful updates).
- [x] 9.2 Simplify / dead-code pass; confirm every issue #58 acceptance criterion maps to a named test;
  grep the full diff for `spaces_*`/`creations_*` — none added (Copy never touches the Magnific port).
- [x] 9.3 Write the Build Report into `handoff.md`, explicitly flagging the fake drafter used in
  `compose.test.ts` (never a live model) and the pre-existing `FakeSpace` (untouched by this slice —
  Copy leaves the Space, so no test in `src/copy/` drives it at all).
