## Why

Issue #120's triage found a real, decision-free gap inside a much bigger epic (multi-channel captions,
per-channel Copy variants, LinkedIn account tagging — all correctly deferred, tracked on the parent
issue). The News Carousel Recipe's Production Spec already carries a structured, checkable
`companies: string[]` field per slide (`CarouselSlide.companies`,
`src/production-spec/news-carousel-contract.ts` — the real companies/products whose logos render on
that slide, added for issue #102 finding #1). Today that field is used ONLY for on-slide artwork: it is
never threaded into the Copy step's own per-slide narrative input (`CopySlideBeat`,
`src/copy/draft.ts` — `role`/`text`/`statCallout` only). The composed caption can therefore only name a
company/product by accident, when the copywriter happens to restate it from the brief's prose — it has
no access to the Spec's own, already-verified ground truth of what the rendered slides actually name.

This is a genuine prerequisite for the whole multi-channel epic: every future per-channel caption
variant will still want the REAL company/product ground truth, not a re-guess from prose. It is also
entirely mechanical — no product decision is needed to thread an already-existing field one step
further downstream.

## What Changes

**Thread `CarouselSlide.companies` into the Copy step's `CopySlideBeat`, end to end.**

- `src/copy/draft.ts`'s `CopySlideBeat` gains a THIRD optional field, `companies?: readonly string[]`,
  mirroring exactly how `statCallout` is already an optional, additive field on the same type. Purely
  additive: `CopyInput`, `CopyDrafter`, `defaultDraftCopy`, `skillDraftCopy`'s signature, and every
  existing caller that omits `companies` are all unaffected.
- A new, pure wiring module, `src/copy/news-carousel-slide-narrative.ts`, exports
  `newsCarouselSlideNarrative(spec: NewsCarouselSpec): readonly CopySlideBeat[]` — the ONE place a
  saved News Carousel Spec's `slides` become the Copy step's `CopyInput.slideNarrative`: `role`/`text`
  carried through verbatim, `stat_callout` renamed to `statCallout`, and `companies` passed through
  UNCHANGED, including an empty array (never invented, never dropped). No I/O, no model call, no clock,
  never mutates its input.
- `.claude/skills/write-social-copy/SKILL.md` (the copywriting step's own instructions — an agent runs
  this Skill, it is not a fixed template) is updated to draw on `companies` when naming companies/
  products: name the real ones a slide's own `companies` list actually records, wherever the Format's
  voice naturally allows it; an empty/absent `companies` field contributes NO mention — never invent or
  re-guess one from the title/angle/mediaContext. This mirrors the SAME "grounded, never invented"
  standard the News Carousel author phase's own `companies-cited` checklist item already holds the
  on-slide `image_prompt` to (`production-spec/news-carousel-author-checklist.ts`).
- The deterministic drafting proof (`skillDraftCopy`, already the testable, non-LLM stand-in for the
  Skill) is extended with tests proving `companies` is genuinely AVAILABLE on a beat passed to a
  drafter — mechanically provable — WITHOUT asserting any specific caption wording drew on it (that
  half, "is the caption genuinely well-written", stays agent-judged, the same pattern already used for
  the News Carousel author phase's own "grounded subject" checklist item, `kind: "agent-judged"`).

**What is mechanically provable vs. agent-judged, made explicit (per the issue's own framing):** the
DATA threading through correctly — the field exists on the type, the wiring function carries it
through unchanged including empty arrays, and it survives being passed into a drafter without breaking
anything — is fully covered by tests. "The caption reads well and names the companies naturally" is an
LLM/agent judgment call, never hard-coded into a template; this slice does not attempt to mechanically
grade caption prose.

## Non-Goals (explicitly deferred / out of scope)

- **The *Character Explainer with Cast* Recipe.** It has no per-clip "companies" concept today; none is
  invented for it here (the issue's own Agent Brief scopes this to News Carousel only).
- **Multiple Channels per Brand, per-channel Copy variants, per-channel `CopyShape`/validation rules,
  LinkedIn handle lookup/tagging.** All correctly deferred to future design + build slices, tracked on
  the parent issue #120 (kept open as the epic tracker).
- **Rewriting or migrating any already-produced Asset's Copy.** No ledger data is touched; this is a
  forward-only wiring change for future runs.
- **Changing what `companies` means or how it is populated on the News Carousel Spec itself.** That is
  the author step's existing job (`produce-news-carousel` Skill, `news-carousel-author-checklist.ts`'s
  `companies-cited` item), unchanged by this slice — this slice only threads the EXISTING field one
  step further downstream, into the Copy step's input.
- **`.claude/agents/producer.md`.** Its Copy-phase prose already describes sharpening "the saved
  Production Spec's own per-slide narrative" generically (never an exhaustive field enumeration it
  promises to keep in lock-step with `CopySlideBeat`'s exact field list); the issue's own Agent Brief
  scopes the instruction update to "the copywriting step's own instructions" — i.e. the
  `write-social-copy` Skill specifically, not the conductor doc. Left untouched to keep this slice
  tightly scoped and avoid unnecessary risk to producer.md's own heavily-pinned docs-test suite.
- **A mechanical "caption cites every named company" checklist item.** Mirrors the author phase's own
  precedent (`grounded-subject` is `kind: "agent-judged"`, never computed) — caption QUALITY stays
  agent-judged; only data AVAILABILITY is mechanically proven.

## Capabilities

### Modified Capabilities

- `copy-composition`: `CopySlideBeat` gains an optional `companies` field; a new pure wiring function,
  `newsCarouselSlideNarrative`, threads a saved News Carousel Spec's per-slide `companies` (and
  `role`/`text`/`stat_callout`) into `CopyInput.slideNarrative` unchanged.
- `producer-skill`: the `write-social-copy` Skill's documented Inputs/Steps are updated to read and
  draw on a beat's `companies` field, grounded in the Spec, never invented.

## Impact

- **Added:**
  - `src/copy/news-carousel-slide-narrative.ts`
  - `src/copy/news-carousel-slide-narrative.test.ts`
- **Modified:**
  - `src/copy/draft.ts` — `CopySlideBeat.companies?: readonly string[]` (additive).
  - `src/copy/draft.test.ts` — new test proving `companies` is available to `skillDraftCopy` without
    changing its deterministic output.
  - `src/copy/compose.test.ts` — new end-to-end test: a saved Spec's `companies` threaded via
    `newsCarouselSlideNarrative` through `composeCopy`/`skillDraftCopy`/`validateCopy`.
  - `.claude/skills/write-social-copy/SKILL.md` — Inputs item 4 and Steps section 1 updated.
  - `src/copy/write-social-copy-skill.docs-test.ts` — new pinned assertions for the companies guidance.
- **Not touched:** `src/copy/compose.ts`, `src/copy/inject.ts`, `src/copy/validate.ts`,
  `src/copy/contract.ts`, `src/recipe/registry.ts`, `.claude/agents/producer.md`,
  `production-spec/news-carousel-contract.ts` (the `companies` field itself is unchanged — only read),
  `production-spec/news-carousel-author-checklist.ts`, any Character-Explainer-Recipe code, any
  ledger/Asset-storage code, any Channel/Brand-profile code, the live Magnific canvas.
- **Hermetic:** no Space/MCP call anywhere in this diff (the copy step and its wiring have none of
  their own — `compose.ts`'s own module doc: "No Magnific, no Apify, no network"). The `developer` agent
  was not given the Magnific MCP tools and did not use them. No live `spaces_*`/`creations_*` call.
- **Always-rules upheld:** generate-never-publish (no publish-path file touched); public-metrics-only /
  relative-not-absolute (no metrics code touched); explicit-attribution (no Post/attribution code
  touched); ledger-as-source-of-truth (no ledger-write code path touched); never-fabricate (the whole
  point of this slice — an empty/absent `companies` field is carried through as such, never invented
  into a mention).
