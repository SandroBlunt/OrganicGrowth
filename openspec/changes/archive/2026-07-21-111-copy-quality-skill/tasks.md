## 1. Ground the current copy step + Skill precedents before touching anything (test-first prep)

- [x] 1.1 Read `src/copy/{contract,compose,draft,validate,inject}.ts` + their tests in full: confirm
  `composeCopy`'s injectable `drafter?: CopyDrafter` seam already exists and is unmodified-safe to
  extend; confirm `defaultDraftCopy`'s behavior/tests so `skillDraftCopy` can be purely additive.
- [x] 1.2 Read `.claude/skills/produce-news-carousel/SKILL.md` and
  `.claude/skills/produce-character-explainer/SKILL.md` in full (the author-Skill precedent to mirror
  for shape: Inputs / Steps / "What this Skill does not do").
- [x] 1.3 Read `.claude/agents/idea-strategist.md` and `.claude/agents/producer.md` in full; read
  `src/recipe/registry.ts` + `registry.test.ts` in full (confirm no existing `copySkill`-like field);
  read `src/production-spec/producer-agent.docs-test.ts` in full and run it standalone to capture the
  EXACT pre-existing failure (the "thin, recipe-generic conductor" phrase, issue #88) — confirmed
  pre-existing, unrelated to this slice, 82 pass / 1 fail baseline for `npm run test:docs`.
- [x] 1.4 Read `data/brands/straw-motion/baseline-prompts/unhypped-news/news-carousel.md` in full
  (confirms #108/#109/#110 are already applied); read `news-carousel-author-checklist.ts` +
  `format/baseline-prompt.ts` to confirm the "7-slide narrative" section is NOT parsed/pinned by any
  mechanical check (only the "★ THE BASELINE PROMPT" fixed-clauses section is) — safe to rewrite in
  isolation. Grepped `src/` for the OLD narrative section's illustrative quotes/prose: zero hits —
  confirmed nothing pins them.
- [x] 1.5 Read `src/asset/asset.ts` (Copy storage shape — confirms `copy: Copy` is `{caption,
  hashtags}` only; no per-slide field exists or is needed for this slice's scope) and
  `src/recipe/phase-contract.ts` (`auditCopyPhase` — confirms it calls `validateCopy` via
  `recipe.copyShape`, unaffected by a new `copySkill` field).
- [x] 1.6 Confirm no end-to-end test (`src/producer/two-recipes-end-to-end.test.ts`) passes a custom
  `drafter` to `composeCopy` (it relies on the default) — so adding `skillDraftCopy` as a NEW,
  additional export cannot regress it.

## 2. (a) Upstream — richer idea-strategist briefs (test-first)

- [x] 2.1 Write `src/format/idea-strategist-brief-richness.test.ts` FIRST (failing): pins the NOT-YET-
  written guidance strings (angle states a specific tension/contrast; hook concept names the exact
  surprise; talking points minimum count + "concrete, specific fact"/"not acceptable"; Process step's
  "concrete, not generic" instruction; the new Guardrails bullet).
- [x] 2.2 Strengthen `.claude/agents/idea-strategist.md`: Hard Boundary (angle/hook concept/talking
  points richness), Process step 3 (concrete-not-generic instruction, minimum talking-point count),
  Guardrails (new "Be concrete, never generic" bullet). Never touch the hard "no finished
  content"/"declines to just write it" boundary.
- [x] 2.3 Run the new test file: green. Run `src/format/format-docs.test.ts` (the pre-existing
  idea-strategist.md pins from issue #53): still green, unmodified assertions.

## 3. (b) Downstream — the swappable copywriting Skill (test-first)

- [x] 3.1 Write NEW `describe` blocks in `src/copy/draft.test.ts` FIRST (failing): `skillDraftCopy` is
  deterministic; always satisfies `validateCopy` for the shape it was drafted for; respects an
  arbitrary `CopyShape`; when `slideNarrative` is supplied, the caption contains the hook/shift/cta
  beats' own text (proves "sharpens the ACTUAL produced narrative", not the brief alone); falls back
  to title/angle/mediaContext cleanly when `slideNarrative` is absent (single-media Recipe); never
  joins any of its parts with an em dash/en dash/spaced hyphen (issue #108, mirrors
  `defaultDraftCopy`'s own existing test).
- [x] 3.2 Add `CopySlideBeat` + optional `CopyInput.slideNarrative` and implement `skillDraftCopy` in
  `src/copy/draft.ts` (additive only — `CopyInput`'s existing fields, `defaultDraftCopy`, and
  `CopyDrafter`'s signature are all unchanged). Run 3.1's tests: green.
- [x] 3.3 Write a NEW `describe` block in `src/copy/compose.test.ts` FIRST (failing): composes Copy via
  `skillDraftCopy` against BOTH wired Recipes' own `copyShape` (180/1-3 via
  `getRecipe("character-explainer-with-cast")`, 2200/0-2 via `getRecipe("news-carousel")`) and the
  Brand rules fixture (`RULES_PROFILE` — banned words + required CTA/hashtags); asserts `ok: true`,
  the required CTA/hashtags present, a banned word in the drafted caption still rejected (never
  bypassed), and the composed caption contains the supplied `slideNarrative`'s hook/cta text. This is
  AC4's concrete proof.
- [x] 3.4 Confirm 3.3 passes against the ALREADY-implemented `skillDraftCopy` (no new production code
  needed beyond 3.2 — `composeCopy`/`validateCopy`/`inject.ts` are unmodified).
- [x] 3.5 Add `copySkill: string` to the `Recipe` interface (`src/recipe/registry.ts`) and set both
  seeded Recipes' `copySkill: "write-social-copy"`. Add assertions to `registry.test.ts` (both
  Recipes' `copySkill` equals `"write-social-copy"`).
- [x] 3.6 Write `.claude/skills/write-social-copy/SKILL.md` (Inputs / Steps / "What this Skill does not
  do", mirroring the two author Skills' shape): composes the caption + sharpens the produced on-slide
  narrative into it; hands off to `injectRequiredParts` + `validateCopy`; reject-only banned-word/dash
  handling; states it is swappable via `Recipe.copySkill`; never runs the Space; never publishes.
- [x] 3.7 Write `src/copy/write-social-copy-skill.docs-test.ts` (mirrors
  `produce-news-carousel-skill.docs-test.ts`'s structure exactly): exists/readable, front-matter
  `name: write-social-copy`, references the exact modules/functions it points at
  (`composeCopy`/`injectRequiredParts`/`validateCopy`/`skillDraftCopy`/`Recipe.copySkill`), STOP/
  reject-only semantics for a banned word AND a dash tell, no `spaces_*`/`creations_*` call, never
  publishes, no hardcoded Brand/Format string (pill text, logo name, required CTA).
- [x] 3.8 Update `.claude/agents/producer.md`: intro paragraph (both Skills mentioned: author +
  copywriting) and the Copy-phase section (load the Skill named by `Recipe.copySkill`, sharpen the
  produced on-slide narrative into the caption once the media exists) — additive/rewording only,
  every existing pinned reference (`auditCopyPhase`, `src/copy/inject.ts`, `injectRequiredParts`,
  `src/copy/validate.ts`, `validateCopy`, ADR-0012, the banned-word/dash reject-only language) stays
  present. Incidentally add the literal phrase "thin, recipe-generic conductor" to the intro (already
  true of the agent, just not previously spelled out this way) — never introduce "Selected Character"
  or "Slides Prompts"/quoted "Brand Logo" anywhere.
- [x] 3.9 Write `src/production-spec/producer-agent-copy-skill.test.ts` FIRST (failing, before 3.8's
  edit lands... in practice written alongside since this is prose, not code, but validated red-first
  against the ORIGINAL producer.md before editing): pins that producer.md references `Recipe.copySkill`
  and the Skill tool for the copy step, and cross-checks the doc's own example slug against the LIVE
  registry (`getRecipe("news-carousel")!.copySkill`/`getRecipe("character-explainer-with-cast")!.copySkill`)
  so a future rename can't silently drift (mirrors the carousel node-name regression-guard pattern in
  `producer-agent.docs-test.ts`).
- [x] 3.10 Run `node --import tsx --test src/production-spec/producer-agent.docs-test.ts` standalone:
  confirm it is now 83/83 (the pre-existing "thin, recipe-generic conductor" failure incidentally
  fixed) OR unchanged at 82/1 if the added phrase alone doesn't flip it — either is acceptable per this
  slice's own guardrails (never WORSE); record the actual outcome in the Build Report.

## 4. (c) The 7-slide narrative formula, reengineered for comprehension (test-first)

- [x] 4.1 Write the new `describe` block in `src/production-spec/news-carousel-straw-motion-fixture.test.ts`
  FIRST (failing): reads the real, committed document; asserts it states the standing "what happened
  and what it means" comprehension rule, names the mood-only anti-pattern by the issue's own examples
  ("Same week.", "You still check."), and still contains the fixed role order
  hook/then/shift/proof/different/next/cta (unchanged) plus the pre-existing #108/#109/#110 facts
  (still present, composed with, not reverted).
- [x] 4.2 Rewrite ONLY `data/brands/straw-motion/baseline-prompts/unhypped-news/news-carousel.md`'s
  "## The 7-slide narrative — a copy formula per role" section: the standing instruction + anti-pattern
  callout, and each of the 7 roles' formula split into what the `stat_callout` must name (the fact) vs.
  what the `text` must state (the plain-language meaning). Leave the "★ THE BASELINE PROMPT" fixed
  clauses, the reusable template, and the 7 worked JSON Examples byte-for-byte untouched.
- [x] 4.3 Run 4.1's new block: green. Re-run the WHOLE file (every pre-existing describe block from
  issues #83/#85/#108/#109/#110): all still green, unmodified assertions — proves the doc/fixture sync
  checks (`STRAW_MOTION_BASELINE`, `strawMotionIdeaOneCarouselSpec()`) are unaffected by a change
  confined to the OTHER section.
- [x] 4.4 Re-run `src/producer/carousel-end-to-end.test.ts` + `two-recipes-end-to-end.test.ts` (both
  import `STRAW_MOTION_BASELINE`/`strawMotionIdeaOneCarouselSpec`): confirm still green, unmodified —
  proves the doc rewrite doesn't regress the FAKE-Space-driven end-to-end paths.

## 5. OpenSpec

- [x] 5.1 Author `proposal.md` (Why / What Changes for (a)(b)(c) / Non-Goals / Capabilities / Impact),
  this `tasks.md`, and six spec deltas: `idea-strategist-briefs` (ADDED capability),
  `copy-composition` (MODIFIED), `recipe-registry` (MODIFIED), `producer-skill` (MODIFIED),
  `producer-conductor` (MODIFIED), `format-baseline-prompt` (MODIFIED).
- [x] 5.2 `openspec validate 111-copy-quality-skill --strict` green.

## 6. Self-review

- [x] 6.1 `npm test` green (type-check + full suite; baseline 1393 pass / 0 fail → record the new
  total, net delta, zero regressions).
- [x] 6.2 `npm run test:docs` — confirm no NEW failure introduced; record whether the pre-existing
  `producer-agent.docs-test.ts` failure is now fixed (incidental) or unchanged (acceptable either way
  per this slice's guardrails).
- [x] 6.3 Simplify pass: confirm every issue #111 acceptance criterion maps to a named, passing test;
  confirm no `spaces_*`/`creations_*` call anywhere in the diff; confirm the leftover
  W29/ledger files were never opened this session; confirm no git command was run; remove any dead
  code/unused import introduced along the way.
- [x] 6.4 Write the Build Report into `handoff.md`: what changed for (a)/(b)/(c), files touched, how to
  run, per-AC self-assessment mapping each AC to its proving test, the swappable copy-Skill hook's
  design (how the producer selects it per Recipe), fakes/fixtures used (explicitly: no Magnific fake
  needed — the copy step has none of its own), self-review notes, known limits (the Non-Goals above,
  restated for qa).
