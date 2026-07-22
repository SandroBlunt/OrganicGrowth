## Why

Issue #106 (the "carrousel improvements" epic), round 3, item 9: rendered News Carousel copy — both
the composed caption and each slide's on-card `stat_callout`/`text` — leans heavily on em dashes
("word — word") and, occasionally, a hyphen used the same way ("word - word"). This is a well-known
AI-writing "tell": it hurts scannability, and Straw Motion's own real idea-01 fixture
(`src/production-spec/fixtures/news-carousel-straw-motion-specs.ts`) already exhibits it in 4 of its 7
slides' `text` fields — proof this is a live, reproducible defect, not a hypothetical one. The fix
mirrors how the codebase already handles banned words end-to-end: a pure, deterministic scanner,
REJECT-ONLY (flag + stop, never a silent substitution), wired into BOTH of the two places OrganicGrowth
already enforces content rules on News Carousel output — the author-phase checklist
(`auditNewsCarouselAuthorPhase`) for on-slide copy, and the shared, per-Recipe copy validator
(`validateCopy`) for the composed caption/hashtags.

## What Changes

- **A new pure `dash-safety.ts` module** (`src/production-spec/dash-safety.ts`) exports
  `scanTextFieldsForDashes(fields)`, generic over the SAME `TextField[]` shape `scanTextFields` (the
  banned-word core) already shares between the News Carousel Spec-shape scan and the composed-Copy
  scan. It flags three things, each a well-known "sentence dash" tell: an em dash ("—"), an en dash
  ("–"), and a hyphen with whitespace on BOTH sides (" - ", the typewriter stand-in for an em dash). An
  ORDINARY hyphenated compound word ("state-of-the-art", "task-assistant") has no whitespace touching
  its hyphen, so it is never matched — nor is a bare negative number ("-3.7x"), since nothing follows
  its hyphen but a digit, never whitespace. REJECT-ONLY: the module only ever reports hits, exactly
  mirroring `scanTextFields`'s own "never rewrite, only report" contract (always-rule 9's spirit,
  extended here to a style rule).
- **The News Carousel author-phase checklist gains a new mechanical item**
  (`auditNewsCarouselAuthorPhase`, `id: "no-dash-tells"`): scans each slide's `stat_callout` and `text`
  — the Baseline Prompt document's own "Card text" fields (news-carousel.md: "Card text: stat callout +
  supporting line") — for a dash tell. Deliberately does NOT scan `image_prompt`: the Baseline Prompt's
  own FIXED, verbatim-required clauses legitimately contain em dashes (e.g. "no wider than roughly a
  third of the frame width — so it stays a quiet brand mark"), so it is a media instruction fed to the
  image model, never itself reader-facing "Copy" (CONTEXT.md "Copy") — scanning it would make the
  checklist self-contradictory. `items.length` grows from 9 to 10 (with `baselineDocumentText`
  supplied, 10 to 11).
- **The shared, per-Recipe copy validator gains the same check** (`copy/validate.ts`'s `validateCopy`):
  scans the composed `caption` and every `hashtags[]` entry (the SAME `fields` array already built for
  the banned-word scan) for a dash tell, pushing a new `dash_in_copy` error per hit. This applies to
  BOTH wired Recipes (Copy is a single, Recipe-agnostic shared step, ADR-0012) — not only the News
  Carousel Recipe named in the issue title.
- **Two pre-existing, now-surfaced real bugs fixed, test-first:**
  - `src/copy/draft.ts`'s `defaultDraftCopy` joined `title`/`mediaContext` with an em dash — the
    DEFAULT fallback Copy drafter was itself producing the exact "tell" this issue forbids. Rewritten
    to join with a period (separate short sentences), per the issue's own instruction.
  - Straw Motion's real committed fixture (`fixtures/news-carousel-straw-motion-specs.ts`) has em
    dashes in 4 of its 7 slides' `text` (the "shift", "proof", "different", "next" roles) — this is a
    live reproduction of the issue's own motivating defect. Rewritten as separate short sentences,
    staying within the 140-char limit, meaning preserved.
  - One end-to-end test literal (`src/producer/carousel-end-to-end.test.ts`) asserted a caption
    containing an em dash; rewritten dash-free (the underlying `validateCopy` behavior it exercises is
    otherwise untouched).
- **Documented, reject-only, in two places** (issue AC5): the Format's Baseline Prompt document
  (`data/brands/straw-motion/baseline-prompts/unhypped-news/news-carousel.md`'s "Card text" bullet) and
  the `produce-news-carousel` Skill's own author-phase checklist bullet list
  (`.claude/skills/produce-news-carousel/SKILL.md`) both state the rule in prose; `brand-profile.yaml`
  gets a documenting comment (not a new parsed field — the rule is universal, not a per-Brand toggle,
  so there is nothing to configure).

## Non-Goals (explicitly deferred)

- **The character-explainer Recipe's OWN Spec-shape banned-word scan / author checklist**
  (`production-spec/brand-safety.ts`, `production-spec/validate.ts`) is untouched — this issue is
  scoped to News Carousel's on-slide copy plus the SHARED copy step, not that Recipe's own
  media-prompt fields.
- **`image_prompt` dash-scanning** — explicitly out of scope; the reason is part of this change (see
  "What Changes" above) — never a bug to fix later, a deliberate exclusion.
- **Rewriting `registry.ts`'s STATIC, declarative `PhaseContract` checklist prose** for either Recipe —
  the issue's acceptance criteria name the Baseline Prompt doc and/or Brand copy rules, not this
  registry-level documentation; the existing static list is already not kept 1:1 with the dynamic
  audit's item count (it predates the "companies-cited" item too), so leaving it as-is is consistent
  with current practice, not a new gap this change introduces.
- **Retroactively touching the real, in-progress `data/brands/straw-motion/ideas/2026-W29/*` run** —
  those files (and the Brand's `ledger.json`) belong to a separate, in-progress HITL run and are
  explicitly left untouched.

## Capabilities

### Modified Capabilities

- `production-spec`: `auditNewsCarouselAuthorPhase` gains the `no-dash-tells` mechanical checklist item.
- `copy-composition`: `validateCopy` gains the `dash_in_copy` reject-only check on `caption`/`hashtags`.

## Impact

- **New code:** `src/production-spec/dash-safety.ts` (+`.test.ts`).
- **Modified code:** `src/production-spec/news-carousel-author-checklist.ts` (+`.test.ts`),
  `src/production-spec/fixtures/news-carousel-author-checklist-specs.ts`,
  `src/production-spec/fixtures/news-carousel-straw-motion-specs.ts` (+
  `news-carousel-straw-motion-fixture.test.ts`'s item-count assertion), `src/copy/validate.ts`
  (+`.test.ts`), `src/copy/draft.ts` (+`.test.ts`), `src/producer/carousel-end-to-end.test.ts` (one
  literal fixed).
- **Docs:** `.claude/skills/produce-news-carousel/SKILL.md`,
  `data/brands/straw-motion/baseline-prompts/unhypped-news/news-carousel.md`,
  `data/brands/straw-motion/brand-profile.yaml` (a documenting comment only, no new parsed field).
- **Not touched:** `src/production-spec/brand-safety.ts`, `src/production-spec/validate.ts`
  (character-explainer Recipe's own Spec-shape checks — out of scope); `src/recipe/registry.ts` (the
  static declarative `PhaseContract` checklist prose — see Non-Goals);
  `data/brands/straw-motion/ideas/2026-W29/**`, `data/brands/straw-motion/ledger.json` (a separate
  in-progress run — left exactly as-is); `.claude/agents/producer.md` (the content `producer` agent
  definition — a different, content-loop file, out of scope for this engineering slice).
- **Hermetic:** no Magnific fake is needed for this slice's new/changed production code — every
  touched module is a pure, deterministic deep module (a scanner, a validator, a fixture builder)
  tested with in-memory fixtures. `src/producer/carousel-end-to-end.test.ts` DOES drive the existing
  `FakeCarouselSpace` fake, but only its ALREADY-PASSING scenario with one literal string corrected —
  no new fake behavior needed. No live `spaces_*`/`creations_*` call anywhere; no credits, no board
  mutation.
- **Always-rules upheld:** generate-never-publish (no publish code touched); the new dash rule is
  REJECT-ONLY, mirroring rule 9's "never a silent swap" for banned words exactly; public-metrics-only/
  relative-not-absolute are unaffected (no metrics code touched); explicit-attribution is unaffected (no
  Post/attribution code touched); ledger-as-source-of-truth is unaffected (no ledger-write code path
  touched).
