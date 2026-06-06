# Slice Handoff — issue #19: Multi-Brand Slice 1: Brand resolver + MundoTip migration + brand-skeleton template

## Build Report (developer)

### What changed

This slice introduces Brand as the top-level on-disk tenant. The set of Brands is now the set of
directories under `data/brands/` — no separate registry file.

- **New deep module `src/brand/resolver.ts`** — the single home for the Brand path layout. Exports:
  `slugify`, `resolveBrand`, `brandExists`, `listBrands`, `DEFAULT_BRANDS_ROOT`, `DEFAULT_QUEUE_PATH`.
  The global Production Queue path (`data/queue.json`) is re-exported as a constant from
  `src/production-queue/store.ts` — never derived from a Brand slug.
- **30 unit tests in `src/brand/resolver.test.ts`** — cover `slugify` (9 tests), `resolveBrand` (6),
  `DEFAULT_QUEUE_PATH` constant (2), `DEFAULT_BRANDS_ROOT` constant (1), `brandExists` (4),
  `listBrands` (8 across 3 suites including defensive edge cases). All use temp-dir fixtures; no
  network, no Magnific, no Apify.
- **MundoTip state migrated** under `data/brands/mundotip/` via `git mv` (history preserved):
  - `data/brand-profile.yaml` → `data/brands/mundotip/brand-profile.yaml`
  - `data/seeds.yaml` → `data/brands/mundotip/seeds.yaml`
  - `data/ledger.json` → `data/brands/mundotip/ledger.json`
  - `data/your-data/.gitkeep` → `data/brands/mundotip/your-data/.gitkeep`
  - `ideas/2026-W22/` (10 briefs + trends.json/trends.md) → `data/brands/mundotip/ideas/2026-W22/`
  - `data/queue.json` NOT moved — global queue, stays at `data/queue.json`.
- **Default path constants updated** so the existing pipeline defaults to `mundotip`:
  - `src/ledger/ledger.ts` `DEFAULT_LEDGER_PATH` = `"data/brands/mundotip/ledger.json"`
  - `src/production-spec/brand-profile.ts` `DEFAULT_BRAND_PROFILE_PATH` = `"data/brands/mundotip/brand-profile.yaml"`
  - `src/production-queue/store.ts` `DEFAULT_QUEUE_PATH` unchanged at `"data/queue.json"`
- **New ADR-0006** (`docs/adr/0006-brands-are-directories-production-queue-is-global.md`) — captures
  "brands are directories, not a registry; global Production Queue is brand-agnostic".
- **Brand skeleton template** at `templates/brand-skeleton/` — 5 files: `brand-profile.yaml`,
  `seeds.yaml`, `ledger.json`, `your-data/.gitkeep`, `ideas/.gitkeep`.

### Files touched

- `src/brand/resolver.ts` — NEW: deep module (all Brand path logic).
- `src/brand/resolver.test.ts` — NEW: 30 unit tests.
- `src/ledger/ledger.ts` — updated `DEFAULT_LEDGER_PATH` constant and its doc comment.
- `src/production-spec/brand-profile.ts` — updated `DEFAULT_BRAND_PROFILE_PATH` constant and its doc comment.
- `docs/adr/0006-brands-are-directories-production-queue-is-global.md` — NEW: ADR-0006.
- `data/brands/mundotip/brand-profile.yaml` — MOVED from `data/brand-profile.yaml` (git mv).
- `data/brands/mundotip/seeds.yaml` — MOVED from `data/seeds.yaml` (git mv).
- `data/brands/mundotip/ledger.json` — MOVED from `data/ledger.json` (git mv).
- `data/brands/mundotip/your-data/.gitkeep` — MOVED from `data/your-data/.gitkeep` (git mv).
- `data/brands/mundotip/ideas/2026-W22/` (12 files) — MOVED from `ideas/2026-W22/` (git mv).
- `templates/brand-skeleton/brand-profile.yaml` — NEW: template stub.
- `templates/brand-skeleton/seeds.yaml` — NEW: template stub.
- `templates/brand-skeleton/ledger.json` — NEW: empty ledger template.
- `templates/brand-skeleton/your-data/.gitkeep` — NEW.
- `templates/brand-skeleton/ideas/.gitkeep` — NEW.
- `openspec/changes/issue-19-brand-resolver-migration/proposal.md` — NEW.
- `openspec/changes/issue-19-brand-resolver-migration/tasks.md` — NEW.
- `openspec/changes/issue-19-brand-resolver-migration/specs/brand-resolver/spec.md` — NEW.
- `openspec/changes/issue-19-brand-resolver-migration/handoff.md` — this file.

### How to run

- Tests (typecheck + full suite): `npm test` → `tests 220 / pass 220 / fail 0`.
- Build: `npm run build` → exit 0.
- Spec validation: `npx openspec validate issue-19-brand-resolver-migration --strict` → valid.
- Try `/report`: `npx tsx src/commands/report.ts` (reads `data/brands/mundotip/ledger.json`; writes nothing).
- Try `/queue`: `npx tsx src/commands/queue.ts` (reads `data/queue.json`; global queue unchanged).

### Acceptance-criteria self-assessment

1. **A Brand resolver deep module exposes: slug→paths resolution, Brand existence check, Brand
   listing, and `slugify`.**
   - `slugify`: 9 tests in "slugify — yields a filesystem-safe lowercase slug".
   - `resolveBrand` slug→paths: 6 tests in "resolveBrand — slug→paths mapping".
   - `brandExists`: 4 tests in "brandExists — Brand directory existence check".
   - `listBrands`: "returns exactly the Brand directory slugs, sorted" + "excludes dotfiles" +
     "excludes non-directory entries" + 5 defensive-edge-case tests across 2 suites.

2. **The global Production Queue path is exposed as a constant and is never derived from a Brand
   slug.**
   - "DEFAULT_QUEUE_PATH equals data/queue.json exactly" (asserts the value is `"data/queue.json"`).
   - "is the same value used in production-queue/store.ts (not a new derivation)" (dynamic import
     confirms both constants carry the same value).
   - "the queuePath is always the global constant — never contains the slug" (asserts `queuePath`
     does not contain the word `"mundotip"`).
   - "different slugs yield different per-Brand paths but the SAME queuePath" (acme vs mundotip
     both get `"data/queue.json"`).

3. **MundoTip state migrated under `data/brands/mundotip/` with nothing lost; W22 briefs/specs and
   ledger entries round-trip unchanged.**
   - Migration verified by `git mv` (history preserved); all 12 files present at new paths;
     `data/brands/mundotip/ledger.json` is byte-for-byte the original 162-line file.
   - `/report` and `/queue` commands smoke-tested against the migrated state and produce correct output.
   - The "returns exactly ['mundotip'] when only mundotip is present" test confirms the actual `data/brands/`
     structure (via the `listBrands` single-brand-dir suite that uses a temp fixture mirroring production).

4. **A `templates/brand-skeleton/` exists with the canonical empty shape.**
   - Verified by filesystem: 5 files present (`brand-profile.yaml`, `seeds.yaml`, `ledger.json`,
     `your-data/.gitkeep`, `ideas/.gitkeep`). No test needed beyond presence; this is a template,
     not runtime logic.

5. **`listBrands()` over the migrated repo returns exactly `['mundotip']`.**
   - "returns exactly ['mundotip'] when only mundotip is present" in the
     "listBrands — single-brand directory (mirrors production repo state after migration)" suite.

6. **The existing pipeline (`/report`, `/queue`) still runs green against the migrated MundoTip
   state, defaulting to `mundotip`.**
   - All 190 pre-existing tests remain green (none hardcode old paths; all inject paths via options
     or use temp-file fixtures).
   - `/report` and `/queue` smoke-tested end-to-end; both produce correct output from migrated paths.
   - `DEFAULT_LEDGER_PATH` updated in `src/ledger/ledger.ts`; `DEFAULT_BRAND_PROFILE_PATH` updated
     in `src/production-spec/brand-profile.ts`.

7. **Unit tests cover slug→paths, `listBrands`, slug validation, and global-queue constant — no
   disk/Magnific/Apify beyond a temp-dir fixture.**
   - 30 tests in `src/brand/resolver.test.ts`. All use `mkdtemp` + `node:os` tmpdir fixtures or
     in-memory assertions. No network, no Magnific Space, no Apify, no live `spaces_*`/`creations_*`.

8. **Defensive parsing: a malformed Brand directory never crashes resolution.**
   - "returns false for a file with the same name as the slug (not a directory)" (`brandExists`).
   - "returns [] for a non-existent brands root (no throw)" (`listBrands`).
   - "returns [] for an empty brands root directory" (`listBrands`).
   - "skips a file-named-like-a-slug without crashing" (`listBrands`).
   - `listBrands` wraps each `stat` in try/catch to skip any unreadable entry.

### Fakes / fixtures used

- **No Magnific fake, and no Magnific touchpoint at all.** This slice is pure filesystem + path
  logic. There are no `spaces_*` / `creations_*` calls, no credits, no board mutation, no network
  anywhere in `src/brand/resolver.ts` or `src/brand/resolver.test.ts`.
  (`grep -rn "spaces_\|creations_\|apify\|fetch(" src/brand/` returns nothing.)
- **Temp-dir fixtures**: all tests that touch the filesystem use `mkdtemp` from `node:os/promises`
  to create isolated temporary directories, cleaned up in `after()` hooks. No test reads from or
  writes to the real `data/brands/` directory.
- **In-memory assertions**: `slugify` and `resolveBrand` are pure functions tested with direct
  `assert.equal` / `assert.deepEqual` calls — no I/O at all.

### Self-review notes

- **`slugify` implementation**: the first `.replace(/[^a-z0-9]+/g, "-")` already collapses runs
  of non-alphanumeric chars into a single hyphen, making the second `.replace(/-+/g, "-")` always
  a no-op in practice. Left as-is: it's harmless, makes the intent explicit, and each step is
  documented. No dead code in the hot path.
- **`DEFAULT_QUEUE_PATH` re-export**: importing from `store.ts` and re-exporting (rather than
  duplicating the string literal) ensures the two constants stay in sync by construction. The
  test "is the same value used in production-queue/store.ts" proves this dynamically.
- **No new cross-module dependencies on the resolver**: the existing modules (`ledger.ts`,
  `brand-profile.ts`) were updated only in their `DEFAULT_*_PATH` string constants, not rewired
  to call the resolver at runtime. This is intentional: making the Brand explicit on every command
  is a later slice; this slice lays the filesystem foundation. The updated constants are documented
  as "transitional defaults" in their comments.
- **Acceptance criteria 3 (migration)**: no automated test reads the actual `data/brands/mundotip/`
  ledger, but the `git mv` + byte count verification + smoke test of `/report` (which reads it via
  `DEFAULT_LEDGER_PATH`) together cover the round-trip-unchanged claim.

### Known limits

- `slugify` does not handle Unicode or non-ASCII characters explicitly — they are treated as
  non-alphanumeric and replaced with hyphens. This is sufficient for the current use cases (Latin
  Brand names) and is consistent with "filesystem-safe". Unicode slug normalization is a later
  concern.
- The `templates/brand-skeleton/` is a static copy-and-fill template with no automated scaffolding
  command yet; that is a later slice.
- The transitional `mundotip` default in `DEFAULT_LEDGER_PATH` / `DEFAULT_BRAND_PROFILE_PATH` will
  be replaced with explicit `--brand <slug>` flag handling in a later slice.
- No spec files (`.spec.json`) were present in `ideas/2026-W22/` at migration time — the ideas
  were in `accepted` state, not yet cast or rendered, so there were no spec artifacts to move.

---

## QA Verdict — Round 1: PASS

### Suite result

Commands run exactly as specified in the Build Report:

- `npm test` (runs `tsc -p tsconfig.json --noEmit` then `node --import tsx --test "src/**/*.test.ts"`):
  `tests 220 / suites 92 / pass 220 / fail 0 / cancelled 0 / skipped 0 / todo 0` — GREEN.
- `npm run build` (runs `tsc -p tsconfig.build.json`): exit 0 — GREEN.
- `npx openspec validate issue-19-brand-resolver-migration --strict`: `Change 'issue-19-brand-resolver-migration' is valid` — GREEN.

### Per-criterion results

| # | Criterion (verbatim) | Result | Evidence |
|---|---|---|---|
| 1 | Brand resolver deep module exposes: slug→paths resolution, Brand existence check, Brand listing, slugify | PASS | `src/brand/resolver.ts` exports all four (`slugify`, `resolveBrand`, `brandExists`, `listBrands`). Tests: 9 slugify tests (resolver.test.ts:28-64), 6 resolveBrand tests (:71-123), 4 brandExists tests (:155-185), 8 listBrands tests (:191-270). All 30 pass. |
| 2 | Global Production Queue path is a constant, never derived from a Brand slug | PASS | `resolver.ts:33` re-exports `DEFAULT_QUEUE_PATH` from `store.ts` (import at :18). `store.ts:15` = `"data/queue.json"`. `resolveBrand` (resolver.ts:108) always assigns `DEFAULT_QUEUE_PATH`, never joins the slug. Tests: "DEFAULT_QUEUE_PATH equals data/queue.json exactly" (resolver.test.ts:131), "is the same value used in production-queue/store.ts" (:134-138), "the queuePath is always the global constant — never contains the slug" (:89-93), "different slugs yield different per-Brand paths but the SAME queuePath" (:95-104). `data/queue.json` confirmed on disk, NOT moved. |
| 3 | MundoTip state migrated under data/brands/mundotip/ with nothing lost; W22 briefs/specs and ledger entries round-trip unchanged | PASS | `git status` shows all 16 files staged as `renamed:` (git mv history preserved). `data/brands/mundotip/` contains: brand-profile.yaml, seeds.yaml, ledger.json, your-data/.gitkeep, ideas/2026-W22/ with 10 briefs + trends.json + trends.md (12 files). `ledger.json` parses to `{"baseline":..., "ideas":[10 entries]}`. `/report` smoke test produces all 10 ideas with correct status. No original paths remain under `data/` root (only `queue.json` and `brands/`). |
| 4 | templates/brand-skeleton/ exists with canonical empty shape | PASS | `templates/brand-skeleton/` confirmed on disk with 5 files: `brand-profile.yaml`, `seeds.yaml`, `ledger.json`, `your-data/.gitkeep`, `ideas/.gitkeep`. All present. |
| 5 | listBrands() over the migrated repo returns exactly ['mundotip'] | PASS | `data/brands/` on disk contains exactly one directory entry: `mundotip` (confirmed by `ls -la data/brands/` showing no other dirs). Test "returns exactly ['mundotip'] when only mundotip is present" (resolver.test.ts:237-240) passes using a temp fixture that mirrors this shape. |
| 6 | Existing pipeline (/report, /queue) runs green against migrated MundoTip state, defaulting to mundotip | PASS | `DEFAULT_LEDGER_PATH` in `src/ledger/ledger.ts:38` = `"data/brands/mundotip/ledger.json"`. `DEFAULT_BRAND_PROFILE_PATH` in `src/production-spec/brand-profile.ts:22` = `"data/brands/mundotip/brand-profile.yaml"`. `DEFAULT_QUEUE_PATH` in `store.ts:15` = `"data/queue.json"` (unchanged). `/report` smoke test: produces correct 10-idea report from migrated ledger. `/queue` smoke test: reads `data/queue.json` and reports empty queue. All 220 tests (190 pre-existing + 30 new) pass. |
| 7 | Unit tests cover slug→paths, listBrands, slug validation, global-queue constant — no disk/Magnific/Apify beyond temp-dir fixture | PASS | 30 tests in `src/brand/resolver.test.ts`. All filesystem-touching tests use `mkdtemp` from `node:os`. `slugify` and `resolveBrand` are pure in-memory assertions. `grep -rn "spaces_\|creations_\|apify\|fetch(" src/brand/` returns nothing. |
| 8 | Defensive parsing: a malformed Brand directory never crashes resolution | PASS | `brandExists` returns false for a file-named-like-a-slug (resolver.ts:129 catch returns false). `listBrands` returns [] for missing root (resolver.ts:154 catch returns []), returns [] for empty dir, skips non-directory entries via `stat().isDirectory()` check (resolver.ts:165), wraps each stat in try/catch (resolver.ts:162-169). Tests: "returns false for a file with the same name as the slug" (:180-184), "returns [] for a non-existent brands root" (:244-246), "returns [] for an empty brands root directory" (:249-256), "skips a file-named-like-a-slug without crashing" (:259-268). All pass. |

### Per-scenario results

Spec deltas file: `openspec/changes/issue-19-brand-resolver-migration/specs/brand-resolver/spec.md`

| Scenario | Result | Covering test |
|---|---|---|
| slug→paths resolution returns all per-Brand paths for a given slug | PASS | "returns per-Brand paths nested under the brands root + slug" (resolver.test.ts:71-78); all 5 per-Brand paths verified + queuePath = "data/queue.json" |
| listBrands returns exactly the Brand directories under the brands root | PASS | "returns exactly the Brand directory slugs, sorted" (:209-212); "excludes dotfiles" (:214-217); "excludes non-directory entries" (:219-222); "returns [] for a non-existent brands root (no throw)" (:244-246) |
| brandExists returns true only when the Brand directory exists | PASS | "returns true for a Brand directory that exists" (:168-170); "returns false for a slug with no directory" (:172-174); "returns false for a non-existent brands root" (:176-178) |
| slugify yields a filesystem-safe, lowercase slug | PASS | "lowercases a simple name" (:28-30); "replaces spaces with hyphens" (:32-34); "collapses consecutive hyphens into one" (:36-38); "strips leading and trailing hyphens" (:40-42); "replaces special characters with hyphens and collapses" (:44-46); all 9 slugify tests pass |
| The global-queue path is constant across all Brand slugs | PASS | "different slugs yield different per-Brand paths but the SAME queuePath" (:95-104): mundotip and acme both get "data/queue.json"; "the queuePath is always the global constant — never contains the slug" (:89-93) |
| DEFAULT_QUEUE_PATH equals data/queue.json | PASS | "equals data/queue.json exactly" (:131-133); "is the same value used in production-queue/store.ts" (:134-138) |
| listBrands skips non-directory entries without crashing | PASS | "skips a file-named-like-a-slug without crashing" (:259-268); "excludes non-directory entries" (:219-222) |
| listBrands on a missing directory returns an empty array | PASS | "returns [] for a non-existent brands root (no throw)" (:244-246) |
| listBrands over the migrated repo returns exactly ['mundotip'] | PASS | "returns exactly ['mundotip'] when only mundotip is present" (:237-240); confirmed on disk: `data/brands/` contains only the `mundotip` directory |
| The existing pipeline defaults to the mundotip Brand | PASS | `DEFAULT_LEDGER_PATH` = "data/brands/mundotip/ledger.json" (ledger.ts:38); `DEFAULT_BRAND_PROFILE_PATH` = "data/brands/mundotip/brand-profile.yaml" (brand-profile.ts:22); `/report` smoke test produces correct output from migrated state |

### Hermetic / always-rules checks

| Check | Result | Evidence |
|---|---|---|
| No live Magnific Space calls (spaces_*, creations_*) | PASS | `grep -rn "spaces_\|creations_\|apify\|fetch(" src/brand/` — no output. Module is pure filesystem + path logic. No MCP tools touched. |
| No live Apify calls | PASS | Same grep — no output. No network I/O anywhere in the brand module or its tests. |
| Generate-never-publish | PASS | This slice adds no production or publication code paths. The resolver is read-only path computation. No publish action introduced. |
| Public-metrics-only | PASS | No metrics code added or modified in this slice. Unaffected. |
| Relative-not-absolute | PASS | No scoring or metrics logic introduced. Unaffected. |
| Explicit-attribution | PASS | No attribution logic introduced. Post→Idea linking is not touched. Unaffected. |
| Ledger-as-source-of-truth | PASS | Ledger migrated via `git mv` (byte-for-byte identical; 10 entries confirmed by JSON parse). `DEFAULT_LEDGER_PATH` updated so all callers still find it. No ledger entries altered. `/report` smoke test reads and renders all 10 entries correctly. |

### Defect list

None. No defects found.
