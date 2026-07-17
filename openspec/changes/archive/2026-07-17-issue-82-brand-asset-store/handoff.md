# Slice Handoff — issue-82-brand-asset-store

Bidirectional channel between `developer` and `qa`. Developer writes the Build Report; `qa` appends a
Verdict below it. Retries append `Round-N Build` blocks. Nothing here is ever overwritten.

---

## Build Report (Round 1)

### What changed

Built the **BrandAssetStore** (ADR-0016, ADR-0014) — a new typed store for a Brand's reusable media
(image/video/audio), the media parallel of the existing per-Brand watermark @handle *text* parameter.
This is the second build slice in the map-#70 replacement chain, following issue #81 (which registered
the News Carousel Recipe's `"Brand Logo"` media slot descriptively, with `brandAssetKey: "brand-logo"`).

- **New per-Brand directory, `data/brands/<slug>/assets/`.** `src/brand/resolver.ts`'s `BrandPaths`
  gains an `assetsRoot` field (`<brandsRoot>/<slug>/assets`), mirroring `formatsRoot`. The
  Brand-skeleton template ships an empty `assets/.gitkeep` so every newly-scaffolded Brand gets the
  directory for free, mirroring the existing `formats/.gitkeep`.
- **New `BrandAssetStore`** (`src/brand-asset/store.ts`):
  - `mediaKindForFilename(filename)` — a pure, exported extension → `MediaKind` (`"image" | "video" |
    "audio"`) classifier, returning `null` (never throwing) for an unrecognized/absent extension.
  - `listBrandAssets(brand, brandsRoot?)` — enumerates a Brand's `assets/` directory. The set of Brand
    Assets IS the set of recognized-media files there (mirrors `listFormatSlugs`'s "the set of Formats
    is the set of files" convention); each file's **key** is its basename with the extension stripped
    (the same key a Recipe's `BrandAssetMediaSlot.brandAssetKey` names). Dotfiles, unrecognized
    extensions, unreadable entries, and directories-masquerading-as-files are all skipped defensively;
    a missing `assets/` directory returns `[]`; duplicate keys across extensions are deduplicated
    deterministically (alphabetically-first filename wins).
  - `getBrandAsset(brand, key, brandsRoot?)` — a typed lookup. Returns `{ found: true, asset }` or
    `{ found: false, key, message }` — **never throws** for a missing key or a missing `assets/`
    directory (both degrade to the same not-found shape); only an invalid Brand **slug** still throws
    (the pre-existing tenancy boundary every store in this repo enforces via `resolveBrand`).
  - `brandAssetsRoot(brand, brandsRoot?)` — the path-resolution helper, mirroring `formatFilePath`.
- **CLAUDE.md's State section** documents the new `assets/<key>.<ext>` directory, mirroring how
  `formats/<slug>.yaml` was documented when the FormatStore landed.

### Files touched

**New:**
- `src/brand-asset/store.ts` (+`.test.ts`)
- `templates/brand-skeleton/assets/.gitkeep`
- `openspec/changes/issue-82-brand-asset-store/{proposal.md,tasks.md,handoff.md,specs/**}`

**Modified:**
- `src/brand/resolver.ts` — `assetsRoot` field on `BrandPaths`/`resolveBrand`; updated per-Brand-path
  count in doc comments (six → seven)
- `src/brand/resolver.test.ts` — `assetsRoot` assertions added to the existing `resolveBrand` tests
- `src/brand/scaffold-brand.test.ts` — one new assertion: scaffolding creates `assets/`
- `CLAUDE.md` — documents the new `assets/<key>.<ext>` directory

**Not touched (verified — no scope creep):** `src/recipe/registry.ts` (the `BrandAssetMediaSlot`'s
`brandAssetKey` shape is unchanged — this slice is the store the key will eventually resolve through,
not a change to the slot itself), `src/space-driver/**`, `.claude/agents/producer.md`,
`data/brands/**/assets/**` (no real Brand Asset file — e.g. Straw Motion's logo — is committed by this
slice; that ships in a later, Operator-paired canvas session per the issue's own text).

### How to run

```bash
npx tsc -p tsconfig.json --noEmit         # type-check only — clean
npm test                                  # type-check + full unit suite — 1140/1140 green
npm run test:docs                         # markdown-conformance suite — 25/25 green (unchanged)
npx openspec validate issue-82-brand-asset-store --strict   # green
npx openspec validate --all --strict                        # 21/21 green

# focused runs used while building:
node --import tsx --test src/brand-asset/store.test.ts src/brand/resolver.test.ts
node --import tsx --test src/brand/scaffold-brand.test.ts
```

### Acceptance-criteria self-assessment

| # | Acceptance criterion (issue #82) | Proven by |
|---|---|---|
| 1 | BrandAssetStore reads and lists a Brand's assets by key, with media type; a missing key yields a clear typed "not found", never a crash | `src/brand-asset/store.test.ts` — "listBrandAssets — enumerates a Brand's reusable media, keyed by filename basename" (returns every recognized-media file, media-type aware, with on-disk path); "getBrandAsset — typed found/not-found lookup by key, never throws" (found: true with key/media/path; found: false with a message naming the key, Brand, and available keys; `assert.doesNotReject` for every case); "media-type awareness holds for video and audio keys too" |
| 2 | A Brand with no assets directory behaves as "no assets", not an error | `store.test.ts` — "returns [] for a Brand with NO assets directory at all — 'no assets', not an error (AC2)"; "never throws for a missing assets directory"; `getBrandAsset` — "returns a typed not-found (never a throw) for a Brand with NO assets directory at all (AC2)" |
| 3 | All reads go through the store (no direct filesystem access from callers) — files can later swap for a database | `store.test.ts`'s "architecture: only BrandAssetStore reads a Brand's assetsRoot directory (ADR-0014 store boundary, AC3)" — a repo-wide scan of every `.ts` file under `src/` asserting `.assetsRoot` is referenced ONLY in `src/brand/resolver.ts` (defines it), `src/brand/resolver.test.ts` (tests it), and `src/brand-asset/store.ts`/`store.test.ts` (the store) |
| 4 | Built test-first; strict OpenSpec validate + full suite green | Every test file was written and run-to-red before its implementation (see `tasks.md`, all boxes checked); `npx tsc --noEmit` clean, `npm test` 1140/1140, `npm run test:docs` 25/25, `openspec validate issue-82-brand-asset-store --strict` and `--all --strict` (21/21) both green |

Media-type awareness (image/video/audio, aligned with `src/recipe/registry.ts`'s `MediaKind` union) is
proven across all three kinds in `mediaKindForFilename`'s own describe block (7 image extensions, 4
video, 6 audio, each case-insensitively) and re-proven end-to-end through `listBrandAssets`/
`getBrandAsset` with real fixture files of each kind.

### Fakes / fixtures used

- **No Magnific fake was needed for this slice.** No driver/Space-interaction code is touched or
  exercised — this is pure filesystem + path logic (a directory listing + a typed lookup). This
  `developer` build was never given the Magnific MCP tools; confirmed via
  `grep -rn "spaces_\|creations_" src/brand-asset/ src/brand/resolver.ts` → zero matches.
- **No real Brand Asset file ships in this slice.** Every test uses `mkdtemp`-based temp directories
  with placeholder byte contents (e.g. `writeFile(..., "fake-png-bytes")`) — never a real image/video/
  audio file, and never Straw Motion's real logo (which the issue explicitly defers to a later,
  Operator-paired canvas session). `data/brands/**/assets/` is not created or touched for any real
  Brand by this slice.
- Temp-dir fixtures via `node:fs/promises` (`mkdtemp`/`mkdir`/`writeFile`/`rm`), the same pattern
  `src/format/store.test.ts` and `src/brand/resolver.test.ts` already use.

### Self-review notes

- Considered exporting `MediaKind` from `src/recipe/registry.ts` and importing it here to avoid a
  structural duplicate, but followed the existing repo precedent instead: `src/copy/contract.ts`'s
  `CopyShape` deliberately does NOT import from the registry, to keep a lower-level store/contract
  module free of a dependency on the higher-level Recipe registry. Documented the mirror explicitly in
  both files' docstrings so a future reader isn't surprised the two `MediaKind` types are separate
  declarations.
- Considered making a missing/unreadable `assets/` directory distinguish `ENOENT` from other I/O
  errors (rethrowing e.g. a permission failure, mirroring `brandExists`'s convention), but chose the
  blanket catch instead, matching `listFormatSlugs`'s existing precedent for a missing `formats/`
  directory — this keeps the two sibling stores' "missing directory" behavior consistent, and the
  issue's own AC2 language ("a Brand with no assets directory behaves as 'no assets', not an error")
  reads as an unconditional guarantee, not one that carves out permission errors. Made this decision
  explicit in the module's docstring so it's not accidental.
- Considered whether duplicate keys across extensions (e.g. `brand-logo.png` + `brand-logo.svg`)
  should be an outright error (a "fix your assets folder" signal) rather than a silent
  first-wins dedup. Chose silent, deterministic dedup: the issue's ACs don't call out this case, and a
  thrown error here would make `listBrandAssets` fail loudly for something a `.gitignore`-driven OS
  artifact (e.g. a stray `.DS_Store`-adjacent duplicate) could trigger by accident; a future slice can
  tighten this to a loud warning if it becomes a real operational problem.
- Added the repo-wide `.assetsRoot`-reference scan test deliberately, even though there are currently
  zero other callers (nothing yet binds a Brand Asset into a Recipe's canvas — that's issue #88) — it
  turns AC3 ("all reads go through the store") from a documentation promise into something `npm test`
  actively guards going forward, the same way a new caller would be caught the moment it tried to
  `readdir`/`readFile` the directory directly instead of importing the store.
- Extended the Brand-skeleton template (`assets/.gitkeep`) and `scaffold-brand.test.ts` with one new
  assertion, even though the issue's ACs don't mention scaffolding — this keeps every newly-scaffolded
  Brand's on-disk shape in sync with the now-seven-field `BrandPaths`, mirroring the exact precedent
  `formats/.gitkeep` set when the FormatStore landed. Verified this doesn't break any existing test that
  enumerates the skeleton's exact contents (none does — every existing assertion checks individual
  paths, not a closed list).

### Known limits

- **No binding/uploading code.** Nothing yet reads a Recipe's `canvasInputs.mediaSlots` and resolves a
  `brand-asset` slot through this store into an actual Magnific upload — that is the thin,
  recipe-generic Producer (issue #88), explicitly out of scope here (mirrors how issue #81 registered
  the slot descriptively before this slice, and this slice builds the store before #88 binds it).
- **STOP-when-a-required-slot's-asset-is-missing is NOT built.** This store only ever returns a typed
  `{ found: false, ... }` value; deciding to halt a production run on a missing REQUIRED Brand Asset is
  explicitly the future media-bind phase's contract (ADR-0016, ADR-0017), deferred to issue #88 per the
  issue's own text.
- **No real Brand Asset is committed.** `data/brands/straw-motion/assets/brand-logo.png` (or any other
  real Brand's real media) ships in a later, Operator-paired canvas session (Recipe build 5) — this
  slice ships the store and its fixtures only.
- **A write path is not built.** Brand Assets are hand-committed documents for the MVP (ADR-0014,
  mirroring Format files) — no `saveBrandAsset`/upload shell exists yet; one can be added if a future
  slice needs to author Brand Assets programmatically.

---

## QA Verdict — Round 1: PASS

### Suite result

All three commands were actually run by `qa` (not taken on the developer's word):

- `npx tsc -p tsconfig.json --noEmit` → clean, no output, exit 0.
- `npm test` → **1140/1140 passed**, 315 suites, 0 fail, 0 cancelled, 0 skipped.
- `npm run test:docs` → **25/25 passed**, 5 suites, 0 fail.
- `npx openspec validate issue-82-brand-asset-store --strict` → `Change 'issue-82-brand-asset-store' is valid`.
- `npx openspec validate --all --strict` → **21/21 passed** (0 failed), including
  `change/issue-82-brand-asset-store`, `spec/brand-resolver`.

All green, actually executed, real output captured above — not assumed.

### Per-criterion results (issue #82)

| # | Acceptance criterion | Result | Proving test |
|---|---|---|---|
| 1 | BrandAssetStore reads and lists a Brand's assets by key, with media type; a missing key yields a clear typed "not found", never a crash | PASS | `src/brand-asset/store.test.ts`: `listBrandAssets` describe block ("returns every recognized-media file, keyed by its basename, media-type aware"); `getBrandAsset` describe block ("returns found: true..." / "returns a typed not-found (never a throw) for a missing key..." / "never throws/rejects, for any of the above" — uses `assert.doesNotReject`, a real assertion on the *absence* of a throw, not just an assumption). Verified by reading `src/brand-asset/store.ts` lines 190–211: `getBrandAsset` returns a plain object literal in both branches, no `throw` in that function body except through `brandAssetsRoot`→`resolveBrand` for a bad slug — confirmed this is a **returned value**, not an exception, exactly as required. |
| 2 | A Brand with no assets directory behaves as "no assets", not an error | PASS | `store.test.ts`: "returns [] for a Brand with NO assets directory at all — 'no assets', not an error (AC2)" and "never throws for a missing assets directory" (uses `assert.doesNotReject`); `getBrandAsset`'s "returns a typed not-found (never a throw) for a Brand with NO assets directory at all (AC2)". Code path confirmed: `listBrandAssets` wraps `readdir` in try/catch returning `[]` on any failure (store.ts lines 143–147), so a missing dir and any other unreadable dir both degrade to "no assets" — matches the issue's unconditional AC2 wording. |
| 3 | All reads go through the store (no direct filesystem access from callers) | PASS | `store.test.ts`'s "architecture: only BrandAssetStore reads a Brand's assetsRoot directory" test does a **real repo-wide scan**: it walks every `.ts` file under `src/` (recursively, via `collectTsFiles`) and asserts the substring `.assetsRoot` appears only in the 4 allow-listed files. I independently re-ran `grep -rln "formatsRoot" src --include="*.ts"` to confirm the repo's established access pattern is always `paths.formatsRoot`/`paths.assetsRoot` (dot-access, never destructured into a bare local), so the substring scan is not a weak proxy — there is no destructuring-bypass pattern anywhere else in this codebase that would evade the same grep. I also grepped `src/` for any other file mentioning "assets" (`asset/store.ts`, `ledger/migrate-assets.ts`, etc.) and confirmed those all refer to the unrelated **Asset** domain object (ledger entity), not `BrandPaths.assetsRoot` — no false negative. Confirmed no `data/brands/*/assets` directories exist yet for either real Brand (`mundotip`, `straw-motion`), consistent with nothing else reading/writing there. |
| 4 | Built test-first; strict OpenSpec validate + full suite green | PASS | `tasks.md` shows write-test-then-implement ordering per section, all boxes checked; suite results above (tsc clean, 1140/1140, 25/25, 21/21) were independently re-run by `qa`, not taken from the Build Report. |

### Per-scenario results (spec deltas)

**`specs/brand-asset-store/spec.md` (ADDED capability `brand-asset-store`):**

| Requirement / Scenario | Result | Covering test |
|---|---|---|
| Listing returns every recognized-media file, keyed by basename and media-type aware | PASS | `listBrandAssets` — "returns every recognized-media file, keyed by its basename, media-type aware" (asserts exact `{key, media}` tuples for png/mp3/mp4 fixtures) |
| Dotfiles and unrecognized extensions excluded | PASS | "excludes dotfiles and unrecognized extensions (e.g. README.md, .gitkeep)" |
| A directory entry with a recognized-media extension is skipped, not crashed on | PASS | "listBrandAssets — an unreadable entry is skipped, not crashed on" ("skips a directory entry that happens to carry a recognized-media extension" — creates a real directory named `video.mp4`) |
| Duplicate keys across extensions deduplicated deterministically | PASS | "listBrandAssets — duplicate keys across extensions are deduped defensively" ("keeps exactly one entry per key, picking the alphabetically-first extension") |
| getBrandAsset: a found key returns the matching Brand Asset | PASS | "returns found: true with the asset's key/media/path for an existing key" |
| getBrandAsset: a missing key returns a typed not-found result, never a throw | PASS | "returns a typed not-found (never a throw) for a missing key when the assets dir exists" — asserts `message` matches the key, the Brand, and the available-keys hint |
| getBrandAsset: an invalid Brand slug still throws | PASS | "still throws for an invalid Brand slug (tenancy boundary; a different concern than 'not found')" — `assert.rejects(...,/Invalid Brand slug/)` |
| A Brand with no assets/ directory behaves as "no assets" (listBrandAssets) | PASS | "returns [] for a Brand with NO assets directory at all" |
| A Brand with no assets/ directory behaves as "no assets" (getBrandAsset) | PASS | "returns a typed not-found (never a throw) for a Brand with NO assets directory at all (AC2)" |
| All reads of a Brand's assets directory go through the BrandAssetStore | PASS | "architecture: only BrandAssetStore reads a Brand's assetsRoot directory" repo-wide scan test |

**`specs/brand-resolver/spec.md` (MODIFIED capability `brand-resolver`):**

| Requirement / Scenario | Result | Covering test |
|---|---|---|
| slug→paths resolution returns `assetsRoot` alongside all other per-Brand paths | PASS | `src/brand/resolver.test.ts` — three assertions added: default brands root, custom root, and (existing) per-slug; each checks `paths.assetsRoot` equals `<brandsRoot>/<slug>/assets` |
| scaffoldBrand creates the expected directory structure, including `assets/` | PASS | `src/brand/scaffold-brand.test.ts` — new test "creates the assets/ subdirectory (BrandAssetStore home, ADR-0016)" checks `stat(...).isDirectory()` on the scaffolded `assets/` dir |
| listBrands / brandExists / slugify scenarios (unchanged by this slice) | PASS (pre-existing, unaffected) | pre-existing tests in `resolver.test.ts`, still green in the 1140/1140 run |

### OpenSpec faithfulness check (issue vs proposal/spec deltas)

Read the issue body verbatim against `proposal.md` and both spec deltas:

- The issue's 4 ACs map 1:1 to `proposal.md`'s "What Changes" bullets and the two spec files' Added/Modified
  Requirements — no dropped criterion, no invented one.
- The issue's explicit scope fence ("The store only *finds* assets; the STOP... behaviour lands with the
  producer rework") is honored: `brand-asset-store/spec.md`'s `getBrandAsset` Requirement explicitly states
  the STOP behaviour is OUT of scope, and no STOP/throw-on-required-missing code exists anywhere in
  `src/brand-asset/store.ts`. Confirmed by reading the whole file — `getBrandAsset` never throws except via
  the slug tenancy boundary.
- The issue's explicit fixture-not-real-PNG fence ("this slice ships the store with test fixtures, not the
  real PNG") is honored: no binary media file exists under `data/brands/**/assets/` (confirmed via `find`),
  and every test fixture is a `mkdtemp` temp directory with placeholder text bytes.
- Cross-checked against `CONTEXT.md`'s "Brand Asset" glossary entry and ADR-0016: the store's shape
  (`{key, media, path}`, `BrandAssetLookup`, `data/brands/<slug>/assets/`, no manifest file) matches the ADR's
  decision exactly — no misread found. ADR-0014's store list already carries a forward-pointer to
  `BrandAssetStore` (line 6 of `docs/adr/0014*`), consistent with this slice actually landing it.
- No self-consistent-but-wrong spec found: the spec deltas do not encode anything the issue didn't ask for
  (e.g. no write path, no binding code, no STOP behaviour — all correctly absent, matching both the issue's
  fence and the ADR's phased plan).

### Always-rules + Magnific-fake checks

| Check | Result | Evidence |
|---|---|---|
| Generate-never-publish | PASS (N/A — untouched) | No render/publish code path touched; `git diff main --stat` confirms only `resolver.ts`/`.test.ts`, `scaffold-brand.test.ts`, `CLAUDE.md`, plus new `brand-asset/` + `templates/brand-skeleton/assets/.gitkeep` files. |
| Public-metrics-only | PASS (N/A — untouched) | No Apify/metrics code touched. |
| Relative-not-absolute | PASS (N/A — untouched) | No scoring/comparison code touched. |
| Explicit-attribution | PASS (N/A — untouched) | No Post/Idea/Recipe attribution code touched. |
| Ledger-as-source-of-truth | PASS | No ledger read/write path touched; Brand Assets are documented as hand-committed files parallel to `brand-profile.yaml`, not ledger state — consistent with ADR-0014/0016. Confirmed no `ledger.json` write appears anywhere in the diff. |
| Store-boundary discipline (ADR-0014) | PASS | New `BrandAssetStore` follows the exact established pattern (`resolveBrand` tenancy check, typed return, no manifest file) as `FormatStore`; repo-wide scan test (AC3) actively guards it going forward. |
| Defensive parsing (data-handling rule 4) | PASS | Missing dir → `[]` / typed not-found (never throws); unreadable entry / directory-masquerading-as-file → skipped, not crashed; malformed extension → `null`, never throws. All three degenerate cases have a dedicated, passing test. |
| No live Magnific / Magnific-fake check | PASS | `grep -rn "spaces_\|creations_" src/brand-asset/ src/brand/resolver.ts templates/brand-skeleton/assets/` → **zero matches** (re-run independently by `qa`, not just taken from the Build Report). Also ran `git diff main --unified=0 . ':!openspec' \| grep -n "spaces_\|creations_"` → **none found** across the entire diff. This slice touches no driver/Space code at all — no fake was even required, and none of the forbidden call patterns exist. |
| No real logo/media binary committed | PASS | `find data -iregex '.*\.\(png\|jpe?g\|gif\|webp\|svg\|mp4\|mov\|mp3\|wav\)$'` → no results. `find data/brands -iname assets -type d` → no results (neither `mundotip` nor `straw-motion` has an `assets/` dir yet — correctly deferred to the Operator-paired slice). |
| Scope check: STOP-on-missing-required-asset correctly out of scope | PASS | Confirmed absent from `src/brand-asset/store.ts` (only a typed not-found value is ever returned) and explicitly called out as deferred in both `proposal.md`'s Non-Goals and the spec's `getBrandAsset` Requirement text — matches the issue's own scope fence exactly. No over-reach, no under-delivery. |

### Defect list

None. No defects found in this round.
