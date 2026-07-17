## Why

ADR-0015 (map #70, ticket #72) decided that a **Format**'s per-Recipe "look" — the **Baseline
Prompt** (card styles, the pill/eyebrow text, logo placement, fonts, a worked structure example, and
samples) — is a **document**, referenced from the Format's own YAML file by a pointer, never inlined.
Following issue #81 (registry gains typed canvas inputs + the descriptive `news-carousel` Recipe) and
issue #82 (the `BrandAssetStore`), nothing yet lets a Format actually DECLARE that pointer, and no
real Baseline Prompt document exists in the repo — the Operator's confirmed prototype
(`baseline-prompt.md`, locked after 3 rounds of iteration and validated by the map's #77 prototype:
7/7 on-contract carousel prompts authored from it) still lives only in a throwaway workspace file
outside the repo. This is the third build slice of the map-#70 replacement chain: it teaches the
`FormatStore` to parse and expose a per-Recipe Baseline Prompt pointer, adds the typed loader that
resolves and reads the referenced document, and lands Straw Motion's first REAL one — the
`unhypped-news` Format's pointer for the `news-carousel` Recipe — importing the locked document
byte-faithfully.

## What Changes

- **`FormatFile` gains `baselinePrompts`** (`src/format/store.ts`): a per-Recipe pointer map — recipe
  slug -> a relative filename for that Recipe's look document (e.g.
  `{ "news-carousel": "news-carousel.md" }`) — parsed by a new pure, defensive `strRecord` helper
  (mirrors `strArray`'s "drop garbled entries, never crash" convention). A Format that declares NO
  pointer at all yields `{}` — a normal, expected shape, not an error (issue #83 AC1). Stays free-
  text/unvalidated against the Recipe registry at parse time, exactly like `defaultRecipes`.
- **A new per-Brand directory, `data/brands/<slug>/baseline-prompts/<formatSlug>/`,** holds a
  Format's referenced Baseline Prompt documents, one level down per Format (mirrors how a Format's
  Ideas already namespace under `ideas/<formatSlug>/`). `src/brand/resolver.ts`'s `BrandPaths` gains
  a `baselinePromptsRoot` field, mirroring how `assetsRoot`/`formatsRoot` were added for their own
  stores. `src/format/store.ts` gains `formatBaselinePromptsRoot(brand, formatSlug, brandsRoot?)`,
  mirroring the existing `formatIdeasRoot`.
- **A new typed loader module, `src/format/baseline-prompt.ts`** (joining ADR-0014's store/loader
  list: ledger, queue, production-spec, format, brand-asset, now format-baseline-prompt):
  - `resolveBaselinePromptPath(brand, formatSlug, pointer, brandsRoot?)` — a PURE, no-I/O guard that
    resolves a declared pointer to an absolute path under that Format's own baseline-prompts
    directory, and REJECTS (returns `{ ok: false, message }`, never throws) an empty pointer, an
    absolute-path pointer, or a path-traversal attempt that would escape the directory — the same
    tenancy-boundary reasoning `assertValidFormatSlug`/`assertValidBrandSlug` apply to slugs, applied
    here to a hand-editable path VALUE.
  - `loadBaselinePrompt(brand, format, recipeSlug, brandsRoot?)` — the async I/O shell. NEVER throws
    for an ordinary "nothing to read" outcome (issue #83 AC1/AC3): it returns a typed
    `BaselinePromptLookup`, either `{ found: true, recipe, pointer, path, content }` or
    `{ found: false, recipe, reason, message }` with `reason` one of `"not-declared"` (the Format has
    no pointer for this Recipe — the ordinary "none"), `"malformed"` (the declared pointer is unsafe
    per `resolveBaselinePromptPath`), or `"dangling"` (a safe, well-formed pointer that resolves to no
    file on disk). Only an invalid Brand/Format SLUG still throws (the pre-existing tenancy boundary
    every store in this repo enforces via `resolveBrand`/`assertValidFormatSlug`) — a different
    concern from "this pointer isn't usable."
  - Interpreting the document's contents (reproducing its fixed clauses, swapping the bracketed
    per-shot parts) stays OUT of scope — that is a Recipe's producer Skill's job (ADR-0018, issue
    #87). This slice only ever finds and reads the raw text.
- **Straw Motion's real `unhypped-news` Format declares the pointer** for the `news-carousel` Recipe
  (`baseline_prompts: { news-carousel: news-carousel.md }`) in
  `data/brands/straw-motion/formats/unhypped-news.yaml`.
- **The locked Operator prototype is imported BYTE-FAITHFUL**, verbatim, from the Operator's
  confirmed workspace file into
  `data/brands/straw-motion/baseline-prompts/unhypped-news/news-carousel.md` — verified via `cmp`/
  `diff` (byte-identical) and pinned by a SHA-256 checksum test
  (`d44c12aaee4fa459a0d0d48f2afb669ea2d55821603b1f493b32bffe4400751f`, 25,434 bytes) so a future
  accidental edit of the committed copy is caught by `npm test`. This is a ONE-TIME import — after
  this slice, the in-repo copy is the source of truth; the external workspace file is never read
  again by any code or test.
- **`CLAUDE.md`'s State section** documents the new `baseline-prompts/<format>/<recipe>.md` directory,
  mirroring how `assets/<key>.<ext>` was documented when the `BrandAssetStore` landed.

## Non-Goals (explicitly deferred to later slices in the map-#70 build chain)

- **Interpreting the Baseline Prompt document** to actually author a media/slide prompt — the
  `produce-news-carousel` Skill, issue #87. This slice only stores + exposes the pointer and reads the
  raw document text; it performs zero parsing of the document's own structure (definitions vs. worked
  example vs. samples).
- **Phase Contracts** (the per-phase checklist the Producer self-audits against) — issue #85.
- **The thin, recipe-generic Producer** that actually drives ANY wired Recipe end-to-end (binding
  media slots, running the Space, composing copy, and — eventually — reading this Baseline Prompt via
  its Skill) — issue #88. Today's attended `producer` agent does not read `FormatFile.baselinePrompts`
  or call `loadBaselinePrompt` anywhere; wiring that read path in is out of scope here.
- **Authoring a Baseline Prompt for the wired `character-explainer-with-cast` Recipe** — Straw Motion
  (and MundoTip) declare a pointer only for `news-carousel`; the character Recipe's own Format(s)
  declare none yet, which is exactly the "none declared" (AC1) shape this slice proves is a normal,
  non-error state.
- **Live-Space verification** of anything — this slice touches zero Space-interaction code; no
  Magnific fake is needed (see Impact).

## Capabilities

### Added Capabilities

- `format-baseline-prompt`: a new typed loader for a Format's per-Recipe Baseline Prompt document —
  resolves a declared pointer safely (rejecting path traversal) and reads the referenced file, with a
  never-throwing typed lookup result distinguishing "none declared" from "malformed" from "dangling".

### Modified Capabilities

- `format-store`: `FormatFile` gains `baselinePrompts` (parsed defensively by a new `strRecord`
  helper); a new `formatBaselinePromptsRoot` path function; Straw Motion's real `unhypped-news.yaml`
  gains a real pointer for `news-carousel`.
- `brand-resolver`: `BrandPaths`/`resolveBrand` gain the `baselinePromptsRoot` path
  (`<brandsRoot>/<slug>/baseline-prompts`).

## Impact

- **New code:** `src/format/baseline-prompt.ts` (+`.test.ts`);
  `data/brands/straw-motion/baseline-prompts/unhypped-news/news-carousel.md` (the byte-faithful
  import).
- **Modified code:** `src/brand/resolver.ts` (+`.test.ts`) — `baselinePromptsRoot` field;
  `src/format/store.ts` (+`.test.ts`) — `FormatFile.baselinePrompts`, `strRecord`,
  `formatBaselinePromptsRoot`; `data/brands/straw-motion/formats/unhypped-news.yaml` — the real
  `baseline_prompts` pointer; `CLAUDE.md` — documents the new directory.
- **Not touched:** `src/recipe/registry.ts` (no change to any Recipe's shape — this slice is the
  Format-side store the future producer Skill will eventually read from, not a Recipe change),
  `src/space-driver/**` (no driver/binding code touched), `.claude/agents/producer.md` (the attended
  Producer does not read this store yet — issue #88), `data/brands/mundotip/**` (MundoTip's Format
  declares no Baseline Prompt in this slice — its `character-explainer-with-cast` Recipe has none
  authored yet, which is the "none declared" shape this slice explicitly proves is normal, not an
  error), CONTEXT.md's "Baseline Prompt" glossary entry (left `*(Decided in map #70; build
  pending.)*` — mirrors how issue #82 left "Brand Asset"'s own annotation unchanged after building
  its store: "build pending" tracks the FULL feature, i.e. a Recipe Skill actually interpreting the
  document, issue #87 — not merely storing/exposing the pointer).
- **Hermetic:** no Magnific fake is needed for this slice — no driver/Space-interaction code is
  touched, so there is nothing new to exercise through the fake boundary. Every new module is a pure/
  async deep module (a path-safety guard + a file-read shell) tested against temp-dir fixtures and the
  real committed document. No live `spaces_*`/`creations_*` call anywhere; this `developer` build was
  never given the Magnific MCP tools.
- **Always-rules upheld:** generate-never-publish (no publish/render code touched); ledger-as-
  source-of-truth (no ledger read/write path touched — a Baseline Prompt is Format-scoped reference
  material, same footing as `brand-profile.yaml`/`formats/*.yaml`); public-metrics-only/relative-
  not-absolute/explicit-attribution are unaffected (no metrics/scoring/attribution code touched). The
  store-boundary discipline (rule 7/ADR-0014) is directly extended: a new kind of per-Brand,
  per-Format state (a referenced document) gains its own typed, never-throwing loader rather than a
  stray `readFile` call, and data-handling rule 4 ("never let one malformed record crash a Run") is
  the design center of the loader's three-reason typed result.
