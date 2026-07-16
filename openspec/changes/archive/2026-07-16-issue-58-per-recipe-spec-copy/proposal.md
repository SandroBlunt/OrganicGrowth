## Why

Today the post's copy is a throwaway: `buildPostCopy` (the Idea title truncated + a fixed ` ☀️✨` tail),
a **required top-level field of the Production Spec** (`post_copy`, injected straight into the Space),
checked against **global** constants (`MAX_POST_COPY_CHARS`/`MIN_POST_COPY_EMOJIS`/`MAX_POST_COPY_EMOJIS`
= 180/1/3), the only Brand rule actually enforced against it (`banned_words`), and `required_cta`/
`required_hashtags` are configured in every real `brand-profile.yaml` but never read — dead config. The
Space renders media; it should never own copy. ADR-0012 (depending on ADR-0009–0011, all merged) decided
the shape: Copy leaves the Space and the Spec entirely, becomes a shared, parameterized, out-of-Space
step the producer composes LATE (after the media exists), and the dead Brand rules go live. Issue #56's
own proposal named this exact slice as its deferred scope ("Per-Recipe Copy composed outside the Space —
Issue #58").

## What Changes

- **`post_copy` is removed from the Production-Spec contract and its validator, in this ONE change.**
  `ProductionSpec` drops the `post_copy` field (media instructions only); `validate()` drops the four
  `post_copy_*` checks/codes; `generate()` drops `buildPostCopy`; the 180-char/1-3-emoji global constants
  (`MAX_POST_COPY_CHARS`/`MIN_POST_COPY_EMOJIS`/`MAX_POST_COPY_EMOJIS`) are deleted from
  `production-spec/contract.ts`. `composeSpec` still writes a valid, brand-safe Spec — its own tests are
  updated to smuggle a banned word through a media field instead of the retired `post_copy`.
- **The Spec shape stays selected per Recipe** — `Recipe.specShape.validate` (`src/recipe/registry.ts`,
  issue #54) is unchanged in mechanism, but its description no longer promises a `post_copy` field.
- **A new `src/copy/` module composes Copy — split into WRITING and CHECKING (ADR-0012).**
  - **Drafting** (`draft.ts`) is the producer's LLM job in production; the injectable `CopyDrafter` seam
    (mirroring `production-spec/compose.ts`'s injectable `generator`) lets tests exercise it against a
    deterministic FAKE — never a live model. `defaultDraftCopy` is a deterministic default (no model
    call), parameterized by WHATEVER `CopyShape` the caller passes — the 180/1-3-emoji values are now the
    wired *Character Explainer with Cast* Recipe's OWN params (`Recipe.copyShape`), not global constants;
    a different Recipe declares its own bounds. Composing can reference `mediaContext` (e.g. the picked
    Character's name) — proving Copy composes LATE, after the media exists.
  - **Checking** (`validate.ts`) is a PURE, hermetic, per-Recipe-parameterized validator: length, emoji
    count (against the Recipe's own `CopyShape`), required CTA present, required hashtags present, and a
    banned-word scan — REJECT-ONLY (a banned word fails the whole compose; it is never auto-edited).
  - **Injection** (`inject.ts`) deterministically brings `required_cta`/`required_hashtags` LIVE: appends
    the CTA to the caption when absent (dedupes when already present, case-insensitively); appends each
    missing required hashtag to the hashtag list (dedupes against existing entries, `#`-agnostic and
    case-insensitive) — a bounded backstop, never an unbounded model loop.
  - **`compose.ts`** wires draft → inject → validate into one `composeCopy(input, shape, options)`,
    returning only a Copy that has actually passed validation (mirrors `production-spec/compose.ts`'s
    "nothing except a valid, brand-safe artifact is ever produced" gate).
- **The banned-word scan is re-pointed onto the composed Copy.** `production-spec/brand-safety.ts`'s
  scanning core is factored into a shared `scanTextFields(fields, bannedWords)` (case-insensitive,
  whole-word); `scanForBannedWords` (Spec-shape) and `src/copy/validate.ts`'s own scan (Copy-shape: the
  caption + each hashtag) both build on it, so the two can never drift on the matching rule. The Spec's
  own scan no longer looks at a `post_copy` field (retired).
- **`required_cta`/`required_hashtags` are loaded, live.** `production-spec/brand-profile.ts` gains
  `requiredCtaFrom`/`requiredHashtagsFrom` (pure, defensive — mirroring the existing `bannedWordsFrom`)
  and `loadCopyRules(path)`, which bundles all three composed-Copy rules (required CTA, required
  hashtags, banned words) in one read.
- **Copy is stored structured on the Asset, and surfaced verbatim at Publish.**
  `LedgerAssetRecord.copy` (`src/asset/asset.ts`) changes from a bare string to a structured
  `Copy = { caption, hashtags }` (`src/copy/contract.ts`); `parseAssetRecord` gains a defensive
  `parseCopy`. `/run-pipeline`'s Gate-3 (Publish) message now prints each produced Asset's `copy.caption`
  and `copy.hashtags` VERBATIM alongside the Recipe-explicit `/log-post` hint — never a summary.
- **The watermark stays a Space parameter, never copy.** `Copy` (`src/copy/contract.ts`) has no
  watermark/handle field; `composeCopy`'s tests assert one never leaks in. `producer.md` is updated to
  document the new copy-composition step in Phase B (drafting, deterministic injection, the pure
  per-Recipe check, reject-only banned-word handling) and to restate that the `@handle` watermark stays
  the Space parameter set in the render step, never folded into the caption or hashtags.

## Non-Goals (explicitly deferred)

- **A second wired Recipe with a different copy shape.** Only one Recipe is wired
  (*Character Explainer with Cast*); its copy-shape params (180 chars, 1-3 emojis) are unchanged in
  VALUE — only where they live changes (the Recipe's own params, not a Spec-contract global). A second
  Recipe declaring different bounds is issue #60/HITL, proven at the deep-module layer here (the copy
  validator/drafter accept ANY `CopyShape`, not hard-coded to 180/1-3 — `draft.test.ts`/`validate.test.ts`
  exercise a deliberately different shape to prove this).
- **Wiring `composeCopy` into a live, code-orchestrated "commit the finished Asset" shell.** Production
  is attended (ADR-0008): the `producer` content agent composes Copy in the Operator's own session, using
  `src/copy/`'s deep modules as its checker/injector, exactly as it already composes the Production Spec
  today. There is no code-level "commit an Asset" orchestrator to hang a `composeCopy` call off today
  (confirmed: no caller of `AssetStore.writeAsset` writes `asset_url`/`produced_at` anywhere in the
  codebase — only `/log-post` writes `post_url` post-publication) — adding one is out of this slice's
  scope (it would be new orchestration surface, not the per-Recipe Spec/Copy shape this issue is about).
- **Mentions as a distinct Copy field.** CONTEXT.md's Copy definition lists "caption, hashtags, mentions,
  CTA"; this slice's structured `Copy` covers caption (CTA folded in) + hashtags, matching the issue's
  explicit acceptance criteria (length/emoji/required-CTA/required-hashtags/banned-words). A dedicated
  `mentions` field is future work if a Recipe needs it.

## Capabilities

### New Capabilities

- `copy-composition`: the out-of-Space Copy step — `Copy`/`CopyShape` contract, the injectable
  `CopyDrafter` seam + deterministic default drafter, deterministic required-CTA/hashtag injection, the
  pure per-Recipe copy validator (length/emoji/required-parts/banned-words), and the `composeCopy`
  orchestration shell.

### Modified Capabilities

- `production-spec`: `post_copy` removed from the contract, the validator, and the brand-safety scan
  (same requirement headers — body/scenarios updated, no rename).
- `recipe-registry`: the seeded Recipe's `copyShape` values are now its OWN literal params, not sourced
  from the (now-deleted) Spec-contract constants (same header, body updated).
- `asset-store`: `LedgerAssetRecord.copy` becomes the structured `Copy` type (same header, body updated).
- `run-pipeline-conductor`: Gate 3 (Publish) surfaces each produced Asset's composed Copy verbatim (same
  header, body/scenario updated).

## Impact

- **New code:** `src/copy/contract.ts`, `draft.ts` (+`draft.test.ts`), `inject.ts` (+`inject.test.ts`),
  `validate.ts` (+`validate.test.ts`), `compose.ts` (+`compose.test.ts` — the single-recipe path, proven
  against a deterministic fake drafter), plus `src/copy/fixtures/*.yaml`.
- **Modified:** `src/production-spec/contract.ts`, `validate.ts` (+`validate.test.ts`), `generate.ts`
  (+`generate.test.ts`), `brand-safety.ts` (+`brand-safety.test.ts`, shares `scanTextFields`),
  `brand-profile.ts` (+new `brand-profile.test.ts`), `fixtures/specs.ts`, `compose.test.ts`;
  `src/recipe/registry.ts` (+`registry.test.ts`); `src/asset/asset.ts` (+`asset.test.ts`);
  `src/commands/run-pipeline.ts` (+`run-pipeline.test.ts`); `.claude/agents/producer.md`.
- **Hermetic:** no `spaces_*`/`creations_*` call, no credits, no board mutation anywhere in this slice —
  Copy leaves the Space entirely, so the copy step touches no Magnific port at all; drafting is exercised
  against a deterministic in-memory FAKE drafter (`fakeDrafter` in `compose.test.ts`), never a live
  model.
- **Always-rules upheld:** generate-never-publish holds (composing/storing Copy is not publishing);
  banned words remain a hard, reject-only filter (rule 9), now re-pointed onto the composed Copy;
  ledger-as-source-of-truth holds (Copy is read/written only through `AssetStore`); explicit-attribution
  and relative-not-absolute are unaffected (no attribution or metrics code touched).
