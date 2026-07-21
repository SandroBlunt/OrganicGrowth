# format-baseline-prompt Specification

## Purpose
TBD - created by archiving change issue-83-format-baseline-prompt-pointer. Update Purpose after archive.
## Requirements
### Requirement: All reads of a Brand's baseline-prompts directory go through this loader

`BrandPaths.baselinePromptsRoot` SHALL be referenced only by `src/format/store.ts` (which defines
`formatBaselinePromptsRoot`, deriving from `resolveBrand(...).baselinePromptsRoot`) and
`src/format/baseline-prompt.ts` (which calls that function) — no other source file SHALL read or
construct a Brand's `baseline-prompts/` path directly (ADR-0014's store-boundary discipline, mirrors
the same discipline already proven for `BrandAssetStore.assetsRoot`).

#### Scenario: A repo-wide scan finds no direct baselinePromptsRoot access outside the store/resolver

- **GIVEN** every `.ts` source file under `src/`
- **WHEN** a scan checks each file's text for the literal `.baselinePromptsRoot`
- **THEN** it is found only in `src/brand/resolver.ts` (defines it), `src/format/store.ts` (derives
  `formatBaselinePromptsRoot` from it), and their own test files — never elsewhere

### Requirement: resolveBaselinePromptPath resolves a declared pointer safely, rejecting path traversal before any I/O

The system SHALL expose a pure, no-I/O function `resolveBaselinePromptPath(brand, formatSlug,
pointer, brandsRoot?)` (`src/format/baseline-prompt.ts`) that resolves a Format's declared Baseline
Prompt pointer (a relative filename, e.g. `"news-carousel.md"`) to an absolute path under that
Format's own Baseline Prompt directory (`formatBaselinePromptsRoot(brand, formatSlug, brandsRoot)`).
It SHALL return `{ ok: false, message }` — NEVER throw — for a pointer that is not a non-empty
string, that is an absolute path, or that normalizes to a location OUTSIDE that directory (a
path-traversal attempt). An invalid Brand or Format SLUG SHALL still throw (delegated to
`resolveBrand`/`assertValidFormatSlug` via `formatBaselinePromptsRoot`) — the pre-existing tenancy
boundary every store in this repo enforces, a different concern from "this pointer value is unusable."

#### Scenario: A plain relative filename resolves under the Format's own Baseline Prompt directory

- **GIVEN** Brand `"straw-motion"`, Format slug `"unhypped-news"`, and pointer `"news-carousel.md"`
- **WHEN** `resolveBaselinePromptPath` is called
- **THEN** it returns `{ ok: true, path }` where `path` equals
  `"data/brands/straw-motion/baseline-prompts/unhypped-news/news-carousel.md"`

#### Scenario: An empty or whitespace-only pointer is rejected without throwing

- **GIVEN** a pointer of `""` or `"   "`
- **WHEN** `resolveBaselinePromptPath` is called
- **THEN** it returns `{ ok: false, message }` naming the pointer as empty — it does not throw

#### Scenario: An absolute-path pointer is rejected without throwing

- **GIVEN** a pointer of `"/etc/passwd"`
- **WHEN** `resolveBaselinePromptPath` is called
- **THEN** it returns `{ ok: false, message }` stating the pointer must be relative — it does not throw

#### Scenario: A path-traversal pointer that would escape the Format's directory is rejected without throwing

- **GIVEN** a pointer of `"../../../../etc/passwd"` (or `"../other-format/secret.md"`, escaping via a
  sibling Format's own directory)
- **WHEN** `resolveBaselinePromptPath` is called
- **THEN** it returns `{ ok: false, message }` stating the pointer escapes its Format's Baseline
  Prompt directory — it does not throw, and no filesystem read is ever attempted for it

#### Scenario: An invalid Format or Brand slug still throws — the pre-existing tenancy boundary

- **GIVEN** a Format slug of `"../evil"` (or a Brand slug of `"../evil"`)
- **WHEN** `resolveBaselinePromptPath` is called with it
- **THEN** it throws an error naming the invalid slug, before touching the filesystem

### Requirement: loadBaselinePrompt reads a Format's per-Recipe Baseline Prompt, never throwing for an ordinary not-found outcome

The system SHALL expose an async function `loadBaselinePrompt(brand, format, recipeSlug,
brandsRoot?)` (`src/format/baseline-prompt.ts`) that looks up and reads one Recipe's Baseline Prompt
document for an already-loaded `FormatFile`. It SHALL return a typed `BaselinePromptLookup` and SHALL
NEVER throw for any of the following ordinary outcomes (issue #83 AC1, AC3):

- `{ found: true, recipe, pointer, path, content }` — the Format declares a pointer for this Recipe,
  it resolves safely, and a file exists at the resolved path; `content` is the file's raw text.
- `{ found: false, recipe, reason: "not-declared", message }` — the Format's `baselinePrompts` has no
  entry for this Recipe at all (including when `baselinePrompts` is entirely empty). This is the
  ordinary "none" result (issue #83 AC1) — NOT an error.
- `{ found: false, recipe, reason: "malformed", message }` — the declared pointer is rejected by
  `resolveBaselinePromptPath` (empty, absolute, or path-traversal).
- `{ found: false, recipe, reason: "dangling", message }` — the declared pointer resolves safely but
  no file exists at that path (including when the Brand's `baseline-prompts/` directory does not
  exist at all).

Every `message` SHALL be clear and actionable, naming the Format, the Recipe, and (for `malformed`/
`dangling`) the pointer and/or resolved path — mirroring the data-handling convention that a
malformed or dangling reference must never crash a Run (data-handling rule 4).

#### Scenario: A declared, existing document is found and its content is read verbatim

- **GIVEN** a `FormatFile` whose `baselinePrompts["news-carousel"]` is `"news-carousel.md"`, and a
  real file at the resolved path
- **WHEN** `loadBaselinePrompt(brand, format, "news-carousel")` is called
- **THEN** it returns `{ found: true, recipe: "news-carousel", pointer: "news-carousel.md", path,
  content }` where `content` is the file's exact text

#### Scenario: A Recipe with no declared pointer yields a clear "not-declared" result, not an error

- **GIVEN** a `FormatFile` whose `baselinePrompts` has no entry for `"some-other-recipe"` (including
  a `FormatFile` whose `baselinePrompts` is `{}` entirely)
- **WHEN** `loadBaselinePrompt(brand, format, "some-other-recipe")` is called
- **THEN** it returns `{ found: false, reason: "not-declared", message }` without throwing

#### Scenario: A malformed (path-traversal) pointer yields a "malformed" result, never crashing and never reading outside the directory

- **GIVEN** a `FormatFile` whose `baselinePrompts["bad-recipe"]` is `"../../../../etc/passwd"`
- **WHEN** `loadBaselinePrompt(brand, format, "bad-recipe")` is called
- **THEN** it returns `{ found: false, reason: "malformed", message }` without throwing, and no
  filesystem read outside the Format's own Baseline Prompt directory is ever attempted

#### Scenario: A dangling pointer (safe path, missing file) yields a "dangling" result, never crashing

- **GIVEN** a `FormatFile` whose `baselinePrompts["missing-recipe"]` is `"does-not-exist.md"`, and no
  file exists at the resolved path (including when the Brand has no `baseline-prompts/` directory at
  all)
- **WHEN** `loadBaselinePrompt(brand, format, "missing-recipe")` is called
- **THEN** it returns `{ found: false, reason: "dangling", message }` without throwing

### Requirement: Straw Motion's real unhypped-news Format has a real, byte-faithfully-imported Baseline Prompt for news-carousel

Straw Motion's real `data/brands/straw-motion/formats/unhypped-news.yaml` SHALL declare
`baseline_prompts: { news-carousel: news-carousel.md }`, and the referenced document SHALL exist at
`data/brands/straw-motion/baseline-prompts/unhypped-news/news-carousel.md`, imported BYTE-FAITHFUL
(verbatim, never rewritten) from the Operator's locked prototype
(`.context/prototypes/baseline-prompt.md` — 25,434 bytes, SHA-256
`d44c12aaee4fa459a0d0d48f2afb669ea2d55821603b1f493b32bffe4400751f`). This is a ONE-TIME import: after
this slice, the in-repo copy is the canonical source of truth for the document's content.

#### Scenario: loadFormat + loadBaselinePrompt together resolve the real, real document

- **GIVEN** the repo's real `data/brands/straw-motion/formats/unhypped-news.yaml` and its referenced
  `baseline-prompts/unhypped-news/news-carousel.md`
- **WHEN** `loadFormat("straw-motion", "unhypped-news")` is called, then `loadBaselinePrompt` is
  called with the result for Recipe `"news-carousel"`
- **THEN** it returns `{ found: true, ... }` whose `content` is the real, substantial (well over
  1,000 characters) document text

#### Scenario: The committed document is byte-identical to the locked prototype it was imported from

- **GIVEN** the committed
  `data/brands/straw-motion/baseline-prompts/unhypped-news/news-carousel.md`
- **WHEN** its byte length and SHA-256 checksum are computed
- **THEN** the byte length equals `25434` and the SHA-256 equals
  `d44c12aaee4fa459a0d0d48f2afb669ea2d55821603b1f493b32bffe4400751f` — the exact values computed from
  the Operator's locked prototype at import time, proving the import was verbatim and pinning against
  future accidental edits

### Requirement: Straw Motion's news-carousel Baseline Prompt instructs render-fidelity guardrails (real names, minimum body-text size, full-bleed every card style, soft vignette never a solid box)

The system SHALL keep Straw Motion's real, committed
`data/brands/straw-motion/baseline-prompts/unhypped-news/news-carousel.md` instructing four
render-fidelity guardrails (epic #106 items 8, 10, 11, 12), each verified as a literal, normalized
substring of the document's own prose (never asserted by fiat):

1. **Real names over fine fake-UI text.** The document SHALL instruct preferring a real, recognizable
   product/screen over describing small invented UI text, SHALL name the failure mode (fine invented
   UI text renders as misspelled gibberish), and SHALL instruct keeping any on-screen text minimal
   where no real screen can be shown.
2. **Minimum body-text size.** The document SHALL instruct that the on-card supporting line beneath the
   stat callout renders at a minimum of roughly 13-14px equivalent, never shrunk to a small
   caption-sized afterthought.
3. **Full-bleed, no letterboxing, for every card style — including the top card.** The document SHALL
   instruct that every card style, INCLUDING the top card placement (photo below the card), fills its
   own photo region edge to edge with no black margins or letterboxing at any edge.
4. **Soft vignette, never a solid box.** The document SHALL instruct that the logo's own backing, and
   any floating card's own backing, is always a soft (gradient) vignette, and SHALL explicitly forbid a
   hard-edged solid black bar or filled box.

`src/production-spec/fixtures/news-carousel-straw-motion-specs.ts`'s `STRAW_MOTION_BASELINE.fixedClauses`
and the graduated `strawMotionIdeaOneCarouselSpec()` fixture it builds SHALL stay byte-for-byte in sync
with the document's own updated logo-vignette clause, so the fixture continues to demonstrate a
genuinely on-contract example, not a stale one.

#### Scenario: The document instructs preferring real names over fine fake-UI text

- **GIVEN** the real, committed Straw Motion news-carousel Baseline Prompt document, loaded via
  `loadFormat("straw-motion", "unhypped-news")` then `loadBaselinePrompt(..., "news-carousel")`
- **WHEN** its content is normalized (blockquote markers stripped, lines joined with a space, repeated
  whitespace collapsed)
- **THEN** it contains a phrase naming fine invented UI text rendering as misspelled gibberish, and a
  phrase instructing on-screen text be kept minimal where no real screen can be shown

#### Scenario: The document instructs a minimum, readable supporting-line size

- **GIVEN** the same normalized document content
- **WHEN** it is checked for the supporting-line size instruction
- **THEN** it contains "13-14px equivalent" and a phrase naming a small "caption-sized afterthought" as
  what to avoid

#### Scenario: The document instructs full-bleed, edge-to-edge, no black margins, for every card style including the top card

- **GIVEN** the same normalized document content
- **WHEN** it is checked for the full-bleed instruction
- **THEN** it contains the phrase "including the top card", the phrase "no black margins", and the
  phrase "edge to edge"

#### Scenario: The document instructs a soft vignette and explicitly forbids a hard-edged solid box

- **GIVEN** the same normalized document content
- **WHEN** it is checked for the logo/card backing instruction
- **THEN** it contains "soft dark gradient vignette" and explicitly forbids "a hard-edged solid black
  bar or box" (or "filled box")

#### Scenario: The graduated Straw Motion fixture's vignette clause stays in sync with the document's updated wording

- **GIVEN** `strawMotionIdeaOneCarouselSpec()`'s 7 slides
- **WHEN** each slide's `image_prompt` is checked
- **THEN** every one carries the document's UPDATED logo-vignette sentence verbatim — "A soft dark
  gradient vignette sits behind it for legibility against the photo, never a hard-edged solid black bar
  or box." — proving the doc and the graduated fixture were updated together, not independently

### Requirement: Straw Motion's news-carousel Baseline Prompt instructs a logo negative-prompt guardrail and slide-position pill/logo scale

The system SHALL keep Straw Motion's real, committed
`data/brands/straw-motion/baseline-prompts/unhypped-news/news-carousel.md` instructing (epic #106
items 5, 7), each verified as a literal, normalized substring of the document's own prose (never
asserted by fiat):

1. **A negative-prompt logo guardrail.** The document SHALL instruct that the connected reference
   image is rendered unaltered (no redraw/restyle/recolor/reshape — composing with, not replacing,
   the pre-existing "render exactly as provided" clause), AND SHALL instruct that the logo's
   reference name, file name, or any underscored/technical token that identifies it is NEVER rendered
   as visible text anywhere in the image. Because no in-repo negative-prompt canvas field exists for
   this Recipe (verified — no such field in `src/recipe/registry.ts`'s typed canvas inputs or
   `src/space-driver/port.ts`'s `SpaceMcpPort`), this guardrail is stated as an explicit prohibitory
   clause inside the image prompt text itself, present in the document's top bullets, its reusable
   template, and all 7 worked JSON examples (so the `produce-news-carousel` Skill, which "starts from
   the document's own worked example for the `card_style` you chose", can never pick up a
   pre-#110, unguarded example).
2. **Slide-position pill/logo scale.** The document SHALL instruct that the "Unhypped News" pill and
   the logo render at a noticeably SMALLER scale on every slide after the hook (`slide_index` 1-6)
   than on the hook slide itself (`slide_index` 0), so the copy/subject carry more of each non-hook
   slide's visual weight. The hook slide MAY keep the pre-existing larger scale.

`src/production-spec/fixtures/news-carousel-straw-motion-specs.ts`'s `STRAW_MOTION_BASELINE` and the
graduated `strawMotionIdeaOneCarouselSpec()` fixture it builds SHALL carry the document's own negative
guardrail instruction verbatim, so the fixture continues to demonstrate a genuinely on-contract
example.

#### Scenario: The document instructs the negative-prompt logo guardrail

- **GIVEN** the real, committed Straw Motion news-carousel Baseline Prompt document, loaded via
  `loadFormat("straw-motion", "unhypped-news")` then `loadBaselinePrompt(..., "news-carousel")`
- **WHEN** its content is normalized (blockquote markers stripped, lines joined with a space, repeated
  whitespace collapsed) and checked for the guardrail instruction
- **THEN** it contains the phrase "negative-prompt instruction", a phrase matching "never render
  (this|its) reference image's name or file name", and the phrase "as visible text anywhere in the
  image"

#### Scenario: The document still instructs the logo rendered unaltered — composed with, not replacing, the pre-existing clause

- **GIVEN** the same normalized document content
- **WHEN** it is checked for the pre-existing "render unaltered" instruction
- **THEN** it contains a phrase matching "render(ed)? unaltered" and the pre-existing sentence "do not
  change its shape, proportions, or color in any way, and do not restyle it to match the scene"

#### Scenario: The document instructs a smaller pill + logo on every slide after the hook, larger allowed on the hook slide

- **GIVEN** the same normalized document content
- **WHEN** it is checked for the slide-position sizing instruction
- **THEN** it contains the phrase "scale varies by slide position", the phrase "hook slide
  (slide_index 0)", the phrase "no wider than ~⅙ frame width", and the phrase "noticeably smaller"

#### Scenario: The pre-existing logo/pill checklist facts remain genuine substrings of the document

- **GIVEN** the same normalized document content
- **WHEN** it is checked for `STRAW_MOTION_BASELINE`'s pre-existing `logoReferenceName`,
  `neverAllCapsInstruction`, and `pillText`
- **THEN** all three remain present, verbatim — the new guardrail/sizing instructions compose with
  the existing logo/pill facts, never replacing or contradicting them

#### Scenario: The graduated Straw Motion fixture carries the document's negative guardrail instruction verbatim

- **GIVEN** `strawMotionIdeaOneCarouselSpec()`'s 7 slides
- **WHEN** each slide's `image_prompt` is checked
- **THEN** every one carries the document's negative-prompt logo guardrail sentence verbatim,
  proving the document and the graduated fixture were updated together, not independently

### Requirement: Straw Motion's news-carousel Baseline Prompt's 7-slide narrative formula advances real comprehension, not just mood

The system SHALL keep Straw Motion's real, committed
`data/brands/straw-motion/baseline-prompts/unhypped-news/news-carousel.md`'s "The 7-slide narrative"
section (epic #106 item 6) instructing, verified as a literal, normalized substring of the document's
own prose (never asserted by fiat):

1. **A standing comprehension rule.** Every role's on-slide line — the `stat_callout` AND the `text` —
   SHALL state plainly what happened and what it means; a short, punchy phrase is acceptable ONLY when
   it is ALSO informative.
2. **An explicit anti-pattern callout, by example.** A bare mood/vibe line that names no fact a reader
   could repeat back is named as the anti-pattern to avoid, using the issue's own reproduced examples
   ("Same week.", "You still check.") as the illustration of what NOT to write.
3. **The fixed role order, unchanged.** The 7 roles SHALL remain in the exact order hook → then → shift
   → proof → different → next → cta — this change reengineers each role's FORMULA, never the role list
   or its order.
4. **Per-role guidance split into what the `stat_callout` must name vs. what the `text` must state**,
   for every one of the 7 roles, so the short callout is never left to drift into mood-only content
   while only the longer supporting line stays informative.

This is a documentation-only change confined to this ONE section — the "★ THE BASELINE PROMPT" fixed
clauses, the reusable template, and the 7 worked JSON Examples elsewhere in the same document are
UNCHANGED, so `src/production-spec/fixtures/news-carousel-straw-motion-specs.ts`'s
`STRAW_MOTION_BASELINE`/`strawMotionIdeaOneCarouselSpec()` and every pre-existing #83/#85/#108/#109/#110
fact pinned against this document SHALL remain genuine, unmodified substrings.

#### Scenario: The document states the standing comprehension rule

- **GIVEN** the real, committed Straw Motion news-carousel Baseline Prompt document, loaded via
  `loadFormat("straw-motion", "unhypped-news")` then `loadBaselinePrompt(..., "news-carousel")`
- **WHEN** its content is normalized (blockquote markers stripped, lines joined with a space, repeated
  whitespace collapsed)
- **THEN** it contains a phrase stating every role's on-slide line must state what happened and what it
  means, and that a short phrase is acceptable only when it is also informative

#### Scenario: The document names the mood-only anti-pattern by the issue's own reproduced examples

- **GIVEN** the same normalized document content
- **WHEN** it is checked for the anti-pattern callout
- **THEN** it contains both `"Same week."` and `"You still check."` as the named illustration of what
  NOT to write

#### Scenario: The fixed role order is unchanged

- **GIVEN** the same normalized document content
- **WHEN** the 7 role names are checked, in order
- **THEN** they appear as `hook`, `then`, `shift`, `proof`, `different`, `next`, `cta`, in that exact
  order (matching `production-spec/news-carousel-contract.ts`'s `CAROUSEL_ROLES`)

#### Scenario: Every pre-existing #108/#109/#110 fact remains a genuine substring, composed with, not reverted

- **GIVEN** the same normalized document content
- **WHEN** it is checked for the pre-existing no-dash rule (#108), the four render-fidelity guardrails
  (#109), and the logo negative-prompt guardrail + slide-position sizing (#110)
- **THEN** all remain present, verbatim — this change composes with them, never replacing or
  contradicting any of them

#### Scenario: The graduated Straw Motion fixture is unaffected — this change touches only the narrative section

- **GIVEN** `strawMotionIdeaOneCarouselSpec()`'s 7 slides (`src/production-spec/fixtures/
  news-carousel-straw-motion-specs.ts`)
- **WHEN** each slide's `image_prompt` is checked against `STRAW_MOTION_BASELINE`'s fixed clauses
- **THEN** every one still passes — proving the narrative-section rewrite is isolated from the fixed
  clauses / template / worked Examples the fixture is built from

