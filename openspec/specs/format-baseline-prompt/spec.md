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

