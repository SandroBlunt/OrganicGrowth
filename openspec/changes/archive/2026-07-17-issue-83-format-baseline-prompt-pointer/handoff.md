# Slice Handoff — issue-83-format-baseline-prompt-pointer

Bidirectional channel between `developer` and `qa`. Developer writes the Build Report; `qa` appends a
Verdict below it. Retries append `Round-N Build` blocks. Nothing here is ever overwritten.

---

## Build Report (Round 1)

### What changed

Built the **per-Recipe Baseline Prompt pointer** (ADR-0015, map #70 ticket #72) — the third build slice
in the map-#70 replacement chain, following issue #81 (registry gains typed canvas inputs + the
descriptive `news-carousel` Recipe) and issue #82 (`BrandAssetStore`). A **Format** now DECLARES, per
Recipe it produces through, a pointer to its own look document (never inline YAML); the `FormatStore`
parses and exposes it; a new typed loader resolves the pointer safely and reads the document; and
Straw Motion's real `unhypped-news` Format lands the first real one, for the `news-carousel` Recipe,
importing the Operator's locked prototype byte-faithfully.

- **`FormatFile` gains `baselinePrompts`** (`src/format/store.ts`): a per-Recipe pointer map — recipe
  slug -> a relative filename (e.g. `{ "news-carousel": "news-carousel.md" }`) — parsed by a new pure,
  defensive `strRecord` helper (mirrors `strArray`'s "drop garbled entries, never crash" convention).
  A Format that declares no pointer at all (or whose `baseline_prompts` is entirely garbled) yields
  `{}` — a normal, expected shape, not an error.
- **New per-Brand directory root, `data/brands/<slug>/baseline-prompts/<formatSlug>/`.**
  `src/brand/resolver.ts`'s `BrandPaths` gains `baselinePromptsRoot`, mirroring `assetsRoot`/
  `formatsRoot`. `src/format/store.ts` gains `formatBaselinePromptsRoot(brand, formatSlug,
  brandsRoot?)`, mirroring the existing `formatIdeasRoot`.
- **New typed loader, `src/format/baseline-prompt.ts`:**
  - `resolveBaselinePromptPath(brand, formatSlug, pointer, brandsRoot?)` — a PURE, no-I/O guard.
    Resolves a pointer under the Format's own Baseline Prompt directory; REJECTS (returns
    `{ ok: false, message }`, never throws) an empty pointer, an absolute-path pointer, or a
    path-traversal attempt that would escape the directory. Still throws for an invalid Brand/Format
    SLUG — the pre-existing tenancy boundary, a different concern.
  - `loadBaselinePrompt(brand, format, recipeSlug, brandsRoot?)` — the async I/O shell. NEVER throws
    for an ordinary "nothing to read" outcome. Returns a typed `BaselinePromptLookup`:
    `{ found: true, recipe, pointer, path, content }`, or `{ found: false, recipe, reason, message }`
    with `reason` one of `"not-declared"` (the ordinary "none"), `"malformed"` (an unsafe pointer), or
    `"dangling"` (a safe pointer resolving to no file on disk).
- **Straw Motion's real `unhypped-news.yaml`** now declares
  `baseline_prompts: { news-carousel: news-carousel.md }`.
- **The locked Operator prototype is imported BYTE-FAITHFUL** into
  `data/brands/straw-motion/baseline-prompts/unhypped-news/news-carousel.md` (verified — see below).
- **`CLAUDE.md`'s State section** documents the new `baseline-prompts/<format>/<recipe>.md` directory.

Interpreting the document's contents (the `produce-news-carousel` Skill, ADR-0018) is explicitly OUT
of scope — issue #87. This slice only stores, exposes, and reads the raw document text.

### Files touched

**New:**
- `src/format/baseline-prompt.ts` (+`.test.ts`)
- `data/brands/straw-motion/baseline-prompts/unhypped-news/news-carousel.md` (byte-faithful import)
- `openspec/changes/issue-83-format-baseline-prompt-pointer/{proposal.md,tasks.md,handoff.md,specs/**}`

**Modified:**
- `src/brand/resolver.ts` (+`.test.ts`) — `baselinePromptsRoot` field; per-Brand-path count doc
  comment (seven → eight)
- `src/format/store.ts` (+`.test.ts`) — `FormatFile.baselinePrompts`, `strRecord`,
  `formatBaselinePromptsRoot`
- `data/brands/straw-motion/formats/unhypped-news.yaml` — the real `baseline_prompts` pointer
- `CLAUDE.md` — documents the new directory

**Not touched (verified — no scope creep):** `src/recipe/registry.ts` (no Recipe shape changed —
this is the Format-side store a future producer Skill will eventually read from), `src/space-driver/**`
(no driver/binding code touched), `.claude/agents/producer.md` (the attended Producer does not read
this store yet — issue #88), `data/brands/mundotip/**` (MundoTip declares no Baseline Prompt in this
slice — proving "none declared" is the normal, non-error shape), CONTEXT.md's "Baseline Prompt"
glossary annotation (`*(Decided in map #70; build pending.)*` left as-is — mirrors how issue #82 left
"Brand Asset"'s own annotation unchanged after building its store; "build pending" tracks the FULL
feature, i.e. a Recipe Skill actually interpreting the document, not merely storing/exposing the
pointer).

### How to run

```bash
npx tsc -p tsconfig.json --noEmit         # type-check only — clean
npm test                                  # type-check + full unit suite — 1166/1166 green
npm run test:docs                         # markdown-conformance suite — 25/25 green (unchanged)
npx openspec validate issue-83-format-baseline-prompt-pointer --strict   # green
npx openspec validate --all --strict                                     # 22/22 green

# focused runs used while building:
node --import tsx --test src/format/baseline-prompt.test.ts
node --import tsx --test src/format/store.test.ts src/brand/resolver.test.ts src/brand/scaffold-brand.test.ts

# byte-faithfulness verification (re-run any time):
cmp "/Users/CaxtonTaylor/conductor/workspaces/OrganicGrowth/valencia/.context/prototypes/baseline-prompt.md" \
    data/brands/straw-motion/baseline-prompts/unhypped-news/news-carousel.md
shasum -a 256 data/brands/straw-motion/baseline-prompts/unhypped-news/news-carousel.md
```

### Acceptance-criteria self-assessment

| # | Acceptance criterion (issue #83) | Proven by |
|---|---|---|
| 1 | A Format file can declare a per-Recipe baseline-prompt pointer; FormatStore exposes it, and a Format with none declared yields a clear "none" result (not an error) | `src/format/store.test.ts` — "parseFormatFile — baseline_prompts (per-Recipe Baseline Prompt pointers, ADR-0015)" (fully-populated map parses verbatim, keys/values trimmed; supports multiple Recipe pointers on one Format; `{}` when the key is entirely absent); "defaults every field sensibly for an empty object" (`baselinePrompts` equals `{}`, annotated "a clear 'none', never an error"). At the loader layer: `src/format/baseline-prompt.test.ts` — "AC1: found — reads the declared document's real content"; "AC1: 'none' result — a Recipe this Format never declares a pointer for yields a clear not-declared reason, not an error"; "AC1: a Format with baseline_prompts entirely absent also yields not-declared, not an error" |
| 2 | Straw Motion's unhypped-news declares the pointer for news-carousel, and the locked baseline document is imported byte-faithful | `src/format/store.test.ts` — "straw-motion's real unhypped-news.yaml declares the Baseline Prompt pointer for news-carousel (issue #83 AC2)" (real YAML file, real parse). `src/format/baseline-prompt.test.ts` — "straw-motion's real unhypped-news Format carries a real, byte-faithful Baseline Prompt for news-carousel" describe block: "loadFormat + loadBaselinePrompt together resolve the real document" (reads the real committed file end-to-end) and "the imported document is BYTE-FAITHFUL to the locked Operator prototype" (pins the committed file's exact byte length, 25,434, and SHA-256, `d44c12aaee4fa459a0d0d48f2afb669ea2d55821603b1f493b32bffe4400751f`, computed from the ORIGINAL prototype at import time). **Manually verified during the build** (not just unit-tested): `cmp` and `diff` both report the committed copy byte-identical to `/Users/CaxtonTaylor/conductor/workspaces/OrganicGrowth/valencia/.context/prototypes/baseline-prompt.md` (same repo, older checkout at a different local path); both files are exactly 25,434 bytes with the identical SHA-256 checksum |
| 3 | A malformed or dangling pointer never crashes a run — defensive parsing with a clear message | `src/format/baseline-prompt.test.ts` — "resolveBaselinePromptPath — pure path resolution + traversal guard" (rejects empty/whitespace-only/absolute/path-traversal pointers, returning `{ ok: false, message }`, never throwing; still throws only for an invalid Format/Brand SLUG — the pre-existing tenancy boundary); "loadBaselinePrompt — typed lookup..." — "AC3: dangling pointer... never crashes, clear message" and "AC3: malformed pointer (path traversal)... never crashes, clear message, never reads outside the directory" (both wrapped in `assert.doesNotReject`); "never throws even when the Brand's baseline-prompts directory does not exist at all". At the parse layer: `src/format/store.test.ts`'s "drops non-string values instead of crashing", "drops empty-string keys/values after trimming", and "never throws when baseline_prompts itself is garbled (not an object)" |
| 4 | Built test-first; docs-tests updated if Format docs change; strict validate + full suite green | Every new test was written and run-to-red before its implementation (see `tasks.md`, all boxes checked — e.g. the byte-length assertion caught a real bug during development: `.length` on a decoded UTF-8 string undercounts true byte count for a document containing multi-byte characters, fixed to use `Buffer.byteLength`/a raw `Buffer` read). `npx tsc --noEmit` clean; `npm test` 1166/1166; `npm run test:docs` 25/25 (CLAUDE.md's State-section addition is not pinned by any existing docs-test, so it could not regress one, but the full docs-conformance suite was re-run to confirm); `openspec validate issue-83-format-baseline-prompt-pointer --strict` and `--all --strict` (22/22) both green |

### Fakes / fixtures used

- **No Magnific fake was needed.** This slice touches zero Space-interaction / driver code — it is a
  pure filesystem store + a thin async file-read loader. No `spaces_*`/`creations_*` call anywhere;
  this `developer` build was never given the Magnific MCP tools, and nothing in this slice needed
  them.
- **Temp-directory fixtures** (`mkdtemp`/`mkdir`/`writeFile`/`rm` from `node:fs/promises`) for the
  synthetic Format/document fixtures in `baseline-prompt.test.ts` and `store.test.ts` — the same
  pattern every other store test in this repo uses (`format/store.test.ts`, `brand-asset/store.test.ts`).
- **The real, committed repo state** — `data/brands/straw-motion/formats/unhypped-news.yaml` and its
  newly-committed `data/brands/straw-motion/baseline-prompts/unhypped-news/news-carousel.md` — read
  directly (default `brandsRoot`) in the "real migrated Brand" describe blocks, mirroring how
  `format/store.test.ts` already reads the real `data/brands/**` files for issue #53 AC2.
- **The Operator's locked prototype**, read ONCE at import time (outside any test) from
  `/Users/CaxtonTaylor/conductor/workspaces/OrganicGrowth/valencia/.context/prototypes/baseline-prompt.md`
  — a separate local clone of this same GitHub repo, not a path any test or product code references
  (it is machine-local and outside the repo, so no test depends on it existing; the committed copy +
  its pinned checksum are what `npm test` verifies going forward).

### Self-review notes

- Kept the loader's error-reason taxonomy to exactly three (`not-declared` / `malformed` / `dangling`)
  because those are the three genuinely distinct causes a caller would act on differently (a future
  producer Skill can render "no look yet" very differently from "a Brand editor typo'd a filename").
  Considered collapsing `malformed` into `not-declared` (since a garbled YAML value is dropped to `{}`
  at parse time either way) but kept them separate because a syntactically-valid-but-unsafe pointer
  (path traversal, caught at LOAD time, after parsing) is a materially different, security-relevant
  case worth its own label and its own test.
- Added a repo-wide architecture-scan test (mirroring the one `brand-asset/store.test.ts` already has
  for `.assetsRoot`) proving no source file outside the resolver/store reaches
  `.baselinePromptsRoot` directly — this wasn't explicitly requested by the issue but follows the same
  store-boundary discipline (ADR-0014) the immediately-preceding slice (#82) established, so I added it
  for consistency rather than let this new root be the one without the proof.
- Caught and fixed a real bug in my own first draft: comparing a decoded UTF-8 JS string's `.length`
  against the file's on-disk byte count (`wc -c`) fails whenever the document contains multi-byte
  characters (this one does — em dashes, arrows, etc.) — `.length` undercounts by exactly the number
  of multi-byte characters. Fixed by reading the file as a raw `Buffer` and asserting
  `Buffer.byteLength`, not `string.length`.
- No dead code: every new export (`resolveBaselinePromptPath`, `loadBaselinePrompt`,
  `formatBaselinePromptsRoot`, `strRecord` is intentionally NOT exported — it's a parse-time-only
  helper, consistent with `strArray`/`str`/`positiveInt` staying module-private) is exercised by at
  least one test.

### Known limits

- **Document interpretation is out of scope.** This slice never parses the Baseline Prompt document's
  own internal structure (definitions vs. worked example vs. samples) — it only stores the pointer and
  reads the raw text. Interpreting it to author an actual media/slide prompt is the
  `produce-news-carousel` Skill, issue #87.
- **Nothing reads `loadBaselinePrompt` yet in production code.** The attended `producer` agent
  (`.claude/agents/producer.md`) does not call it — that wiring lands with the recipe-generic Producer,
  issue #88.
- **MundoTip / the wired `character-explainer-with-cast` Recipe have no Baseline Prompt authored.**
  This is intentional (see Non-Goals in `proposal.md`) and is exactly the "none declared" shape AC1
  requires be handled cleanly, not an oversight.
- **No Brand-skeleton scaffolding change.** Unlike `assets/.gitkeep` (issue #82), this slice does not
  add a `baseline-prompts/.gitkeep` to `templates/brand-skeleton/` — a freshly-scaffolded Brand simply
  has no `baseline-prompts/` directory until its first Format declares a pointer, which is handled
  identically to a missing `assets/`/`formats/` directory elsewhere in this repo (defensive: "no
  directory" degrades the same as "no entries", never an error). Can be added trivially in a later
  slice if scaffolding parity becomes a concern.

---

## QA Verdict — Round 1: PASS

### Suite result

All three commands were actually run by QA (not taken on faith), on the checked-out branch
`issue-83-format-baseline-prompt-pointer`, from a clean working tree matching the Build Report's stated
file list:

- `npx tsc -p tsconfig.json --noEmit` → clean, exit 0.
- `npm test` → **1166/1166 pass, 0 fail** (320 suites; `# tests 1166 / # pass 1166 / # fail 0`).
- `npm run test:docs` → **25/25 pass, 0 fail** (5 suites).
- `npx openspec validate --all --strict` → **22/22 passed, 0 failed** (includes
  `change/issue-83-format-baseline-prompt-pointer` ✓).
- `npx openspec validate issue-83-format-baseline-prompt-pointer --strict` → "Change
  'issue-83-format-baseline-prompt-pointer' is valid".

All green, actually run, not assumed.

### Byte-faithfulness — independently re-verified by QA

Ran directly (not trusting the Build Report's numbers):

```
cmp -s "/Users/CaxtonTaylor/conductor/workspaces/OrganicGrowth/valencia/.context/prototypes/baseline-prompt.md" \
       "data/brands/straw-motion/baseline-prompts/unhypped-news/news-carousel.md" && echo IDENTICAL
→ IDENTICAL

wc -c on both → 25434 bytes, both files, exact match.

shasum -a 256 on both →
d44c12aaee4fa459a0d0d48f2afb669ea2d55821603b1f493b32bffe4400751f  (source, valencia workspace)
d44c12aaee4fa459a0d0d48f2afb669ea2d55821603b1f493b32bffe4400751f  (in-repo committed copy)
```

Byte-identical, matching checksum, matching the Build Report's claimed value exactly. The checksum is
pinned in `src/format/baseline-prompt.test.ts` ("the imported document is BYTE-FAITHFUL to the locked
Operator prototype (verbatim import, not rewritten)"), asserting both `committedBytes.byteLength ===
25434` and `sha256(committed) === "d44c12aaee4fa459a0d0d48f2afb669ea2d55821603b1f493b32bffe4400751f"`
against a raw `Buffer` read (correctly using `Buffer.byteLength`, not JS string `.length`, avoiding the
multi-byte-character undercount the Build Report's self-review flags it caught) — so a future accidental
edit of the committed file will be caught by `npm test`.

### Per-criterion results (issue #83)

| # | Acceptance criterion | Result | Proving test(s) |
|---|---|---|---|
| 1 | A Format file can declare a per-Recipe baseline-prompt pointer as a **document pointer, not inline YAML**; FormatStore parses and exposes it; a Format with none declared yields a clear "none" result, not an error | **PASS** | `src/format/store.test.ts` — "parseFormatFile — baseline_prompts (per-Recipe Baseline Prompt pointers, ADR-0015)" (verbatim parse, multi-Recipe support, `{}` when key absent); `src/format/baseline-prompt.test.ts` — "AC1: found...", "AC1: 'none' result...", "AC1: a Format with baseline_prompts entirely absent also yields not-declared...". Confirmed the pointer type is a bare filename string (`"news-carousel.md"`), never an inline object carrying the document's own content — `strRecord` only accepts string values, so an attempt to inline a document would be dropped as a malformed (non-string) entry. |
| 2 | Straw Motion's unhypped-news declares the pointer for news-carousel, and the locked baseline document is imported byte-faithful | **PASS** | `src/format/store.test.ts` — "straw-motion's real unhypped-news.yaml declares the Baseline Prompt pointer for news-carousel (issue #83 AC2)"; `src/format/baseline-prompt.test.ts` — "loadFormat + loadBaselinePrompt together resolve the real document" + "the imported document is BYTE-FAITHFUL..." (checksum-pinned). Independently re-verified byte-for-byte by QA (see above) — genuinely identical, not merely asserted. |
| 3 | A malformed or dangling pointer never crashes a run — defensive parsing with a clear message (typed failure result: not-declared / malformed / dangling) | **PASS** | `src/format/baseline-prompt.test.ts` — "resolveBaselinePromptPath — pure path resolution + traversal guard" (empty/whitespace/absolute/traversal all rejected without throwing; invalid slug still throws — a deliberate, documented, different boundary); "loadBaselinePrompt — typed lookup..." AC3 dangling + AC3 malformed tests, both wrapped in `assert.doesNotReject`; "never throws even when the Brand's baseline-prompts directory does not exist at all". Read the source (`src/format/baseline-prompt.ts`) directly: confirmed the three-reason `BaselinePromptNotFoundReason` type (`"not-declared" \| "malformed" \| "dangling"`) is exhaustive and every code path returns a typed result rather than throwing, except the pre-existing Brand/Format-slug tenancy guard (a different, deliberate concern, itself tested). |
| 4 | Built test-first; docs-tests updated if Format docs change; strict validate + full suite green | **PASS** | `tasks.md` all boxes checked; suite results above, independently reproduced by QA. Docs-tests (`npm run test:docs`, 25/25) were re-run and pass; confirmed via grep that no `.docs-test.ts` file references CLAUDE.md's State-section text (`producer-agent.docs-test.ts`, `report.docs-test.ts` are the only two that reference `CLAUDE.md` at all, and neither pins the State section), so there was genuinely nothing to update — consistent with the Build Report's claim, not merely trusted. |

### Per-scenario results (spec deltas)

**`specs/format-baseline-prompt/spec.md`** (new capability):

| Scenario | Result | Covering test |
|---|---|---|
| A repo-wide scan finds no direct `baselinePromptsRoot` access outside the store/resolver | PASS | `baseline-prompt.test.ts` — "architecture: only formatBaselinePromptsRoot callers reach baselinePromptsRoot (ADR-0014 store boundary)" |
| A plain relative filename resolves under the Format's own Baseline Prompt directory | PASS | `baseline-prompt.test.ts` — "resolves a plain relative filename under the Format's baseline-prompts directory" |
| An empty or whitespace-only pointer is rejected without throwing | PASS | "rejects an empty pointer" / "rejects a whitespace-only pointer" |
| An absolute-path pointer is rejected without throwing | PASS | "rejects an absolute-path pointer" |
| A path-traversal pointer that would escape the Format's directory is rejected without throwing | PASS | "rejects a path-traversal pointer..." + "rejects a traversal pointer that stays a valid-looking relative path but still escapes" |
| An invalid Format or Brand slug still throws | PASS | "still throws for an invalid Format slug..." / "...Brand slug..." |
| A declared, existing document is found and its content is read verbatim | PASS | "AC1: found — reads the declared document's real content" |
| A Recipe with no declared pointer yields a clear "not-declared" result | PASS | "AC1: 'none' result..." + "AC1: a Format with baseline_prompts entirely absent..." |
| A malformed (path-traversal) pointer yields "malformed", never reading outside the directory | PASS | "AC3: malformed pointer (path traversal)..." |
| A dangling pointer yields "dangling", never crashing | PASS | "AC3: dangling pointer..." + "never throws even when the Brand's baseline-prompts directory does not exist at all" |
| loadFormat + loadBaselinePrompt together resolve the real document | PASS | "loadFormat + loadBaselinePrompt together resolve the real document" |
| The committed document is byte-identical to the locked prototype | PASS | "the imported document is BYTE-FAITHFUL to the locked Operator prototype..."; independently re-verified by QA via `cmp`/`shasum` |

**`specs/format-store/spec.md`** (modified capability):

| Scenario | Result | Covering test |
|---|---|---|
| A fully-populated Format file parses to the typed shape verbatim (incl. `baselinePrompts`) | PASS | `store.test.ts` — "parses every field verbatim" |
| Off-niche seed pages normalize via the shared readiness helper | PASS (pre-existing, untouched) | `store.test.ts` seed-normalization tests |
| parseFormatFile never throws on garbled input | PASS | "defaults every field sensibly for an empty object" + garbled-input tests |
| deriveSourceMode infers curated only when populated | PASS (pre-existing, untouched) | existing `deriveSourceMode` tests |
| baseline_prompts yields `{}` when absent or garbled | PASS | "yields an empty {}... (AC1 'none')" + "never throws when baseline_prompts itself is garbled" |
| baseline_prompts drops a malformed entry instead of crashing | PASS | "drops non-string values..." + "drops empty-string keys/values after trimming" |
| formatFilePath resolves under the Brand's formats/ directory | PASS (pre-existing, untouched) | existing path tests |
| formatBaselinePromptsRoot resolves the Format-namespaced root | PASS | "resolves the Format-namespaced Baseline Prompt root (ADR-0015)" |
| A path-traversal Format slug is rejected before any I/O (now incl. formatBaselinePromptsRoot) | PASS | "rejects a path-traversal Format slug before touching the filesystem" (extended to cover the new function) |
| Both real Brands' Format files load through the FormatStore | PASS (pre-existing, untouched) | existing real-Brand tests |
| Straw Motion's real Format declares the news-carousel Baseline Prompt pointer | PASS | "straw-motion's real unhypped-news.yaml declares the Baseline Prompt pointer for news-carousel (issue #83 AC2)" |

**`specs/brand-resolver/spec.md`** (modified capability):

| Scenario | Result | Covering test |
|---|---|---|
| slug→paths resolution returns all per-Brand paths, incl. `baselinePromptsRoot` | PASS | `resolver.test.ts` — three updated assertions (default root, custom root, and the field-presence check), all confirmed by diff read directly |
| listBrands / brandExists / slugify (untouched) | PASS (pre-existing) | existing tests, unaffected |

### Always-rules + Magnific-fake checks

| Rule | Result | Evidence |
|---|---|---|
| Generate-never-publish | PASS | No render/publish code touched at all; this slice is a filesystem store + loader, confirmed by reading every touched file's diff |
| Public-metrics-only | N/A / holds | No metrics/Apify code touched |
| Relative-not-absolute | N/A / holds | No scoring/comparison code touched |
| Explicit-attribution | N/A / holds | No Post/attribution code touched |
| Ledger-as-source-of-truth | N/A / holds | No ledger read/write path touched — a Baseline Prompt is Format-scoped reference material, same footing as `brand-profile.yaml`/`formats/*.yaml`, confirmed correct per ADR-0014's existing precedent |
| Store-boundary discipline (ADR-0014) | PASS | Dedicated architecture-scan test (`baseline-prompt.test.ts`) proves no source file outside `resolver.ts`/`store.ts` (and their own tests) references `.baselinePromptsRoot` directly; ran the full suite and confirmed this test passes |
| Defensive parsing (data-handling rule 4) | PASS | `strRecord` never throws on garbled `baseline_prompts`; `resolveBaselinePromptPath`/`loadBaselinePrompt` never throw for empty/absolute/traversal/dangling — confirmed by reading the implementation and its tests, and by the malformed/dangling test results above |
| Brand/Format specifics stay in the document, never hardcoded downstream (ADR-0015) | PASS | Read the imported document (`news-carousel.md`) directly — confirmed the pill text ("Unhypped News"), the logo reference name (`Straw_Motion_Logo`), and card styles (`3.1-final`/`3.2-final`) live only inside the document's prose. Grepped `src/**/*.ts` (excluding tests) for `pill\|logo reference\|card style`: only found in `src/production-spec/news-carousel-contract.ts` (pre-existing, from issue #81, NOT touched by this slice) and `src/format/baseline-prompt.ts`'s own module doc — both reference the *concept* generically (`card_style` as a free string field, "the pill/eyebrow text" as prose describing what the document carries) and never hardcode an actual value like `"Unhypped News"` or `Straw_Motion_Logo`. No violation. |
| All reads go through the store/loader | PASS | Confirmed via the repo-wide architecture-scan test plus a manual grep — no caller outside `src/format/store.ts`/`src/format/baseline-prompt.ts` reads the baseline-prompts directory or hardcodes its path |
| No live-Space calls (Magnific fake / hermetic) | PASS | Grepped every new/modified file for `spaces_\|creations_`: the only hit is a prose sentence inside `handoff.md` itself explaining that *no* such calls exist. Confirmed no Magnific MCP tool is invoked anywhere in this slice — correctly, since the slice touches zero Space-interaction code (filesystem store + loader only) |

### Defect list

None. No defects found in this round.

### Verdict rationale

Every acceptance criterion traces to a real, passing test that actually exercises the behavior (not
merely a claim) — independently confirmed by reading the implementation and, for AC2, independently
re-running the byte/checksum comparison myself rather than trusting the Build Report's numbers. The
OpenSpec proposal and all three spec deltas (`format-baseline-prompt`, `format-store`, `brand-resolver`)
match issue #83 verbatim in substance — no scope creep, no dropped criterion, and full alignment with
ADR-0015 (the document-not-inline-YAML decision, and Brand/Format specifics staying in the document).
The Non-Goals section correctly and explicitly defers document-interpretation (issue #87) and Producer
wiring (issue #88) without silently narrowing any AC. Store-boundary discipline (ADR-0014) is upheld and
proven by a dedicated architecture-scan test. No live Magnific Space call anywhere. Full suite green,
independently reproduced: `npm test` 1166/1166, `npm run test:docs` 25/25, `openspec validate --all
--strict` 22/22.

**QA Verdict — Round 1: PASS.**
