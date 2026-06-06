## 0. ADR and OpenSpec authoring

- [ ] 0.1 Author `docs/adr/0006-brands-are-directories-production-queue-is-global.md` capturing the
  "brands are directories not a registry; global Production Queue is brand-agnostic" decision.
- [ ] 0.2 Write the full OpenSpec change: `proposal.md`, `tasks.md`, `specs/brand-resolver/spec.md`.
- [ ] 0.3 `npx openspec validate issue-19-brand-resolver-migration --strict` → green.

## 1. Brand resolver — test-first

- [ ] 1.1 Write failing tests in `src/brand/resolver.test.ts`:
  - `slugify` returns a lowercase, hyphen-separated, filesystem-safe slug for typical Brand names;
    rejects/normalizes chars that are unsafe on a filesystem.
  - `resolveBrand` returns the correct five per-Brand paths and the constant global queue path for
    a given slug and a given `brandsRoot`; the global queue path is NEVER derived from the slug.
  - `brandExists` returns true when the Brand directory exists in a temp fixture tree, and false
    when it does not.
  - `listBrands` over a temp fixture brands dir returns exactly the expected slugs (sorted);
    handles an empty dir (no Brands yet) without crashing; handles a non-existent dir without
    crashing; skips dotfiles and non-directory entries.
  - Defensive: a malformed (non-directory, or unreadable) entry under `brands/` never throws;
    `listBrands` degrades gracefully.
  - The global-queue path constant equals `data/queue.json` and is NOT derived from any slug.

- [ ] 1.2 Implement `src/brand/resolver.ts` to pass the tests:
  - `DEFAULT_BRANDS_ROOT = "data/brands"`
  - `DEFAULT_QUEUE_PATH = "data/queue.json"` (re-exported as a constant — same value as
    `src/production-queue/store.ts`; kept in sync by importing from there or by matching exactly).
  - `slugify(name: string): string` — lowercase; replace spaces and non-alphanumeric with hyphens;
    collapse multiple hyphens; strip leading/trailing hyphens; truncate to 64 chars.
  - `BrandPaths` interface: `{ ledger, brandProfile, seeds, ideasRoot, yourData, queuePath }`.
  - `resolveBrand(slug, brandsRoot?)` → `BrandPaths` (all paths under `<brandsRoot>/<slug>/`
    except `queuePath` which is always `DEFAULT_QUEUE_PATH`).
  - `brandExists(slug, brandsRoot?)` → `Promise<boolean>` (checks the Brand directory exists and
    is a directory).
  - `listBrands(brandsRoot?)` → `Promise<string[]>` (sorted; skips dotfiles and non-dirs;
    returns `[]` on missing brandsRoot; never throws on a malformed entry).

## 2. MundoTip state migration

- [ ] 2.1 `git mv` to move per-Brand state into `data/brands/mundotip/`:
  - `data/brand-profile.yaml` → `data/brands/mundotip/brand-profile.yaml`
  - `data/seeds.yaml` → `data/brands/mundotip/seeds.yaml`
  - `data/ledger.json` → `data/brands/mundotip/ledger.json`
  - `data/your-data/` → `data/brands/mundotip/your-data/`
  - `ideas/2026-W22/` → `data/brands/mundotip/ideas/2026-W22/`
  - `data/queue.json` stays at `data/queue.json` (global queue — DO NOT MOVE).
- [ ] 2.2 Verify the migrated ledger is byte-for-byte identical (content unchanged; history
  preserved via `git mv`).

## 3. Update existing default-path constants

- [ ] 3.1 Update `src/ledger/ledger.ts` — set `DEFAULT_LEDGER_PATH` to
  `data/brands/mundotip/ledger.json` (so the existing pipeline defaults to the migrated MundoTip
  ledger with no code changes required in callers).
- [ ] 3.2 Update `src/production-spec/brand-profile.ts` — set `DEFAULT_BRAND_PROFILE_PATH` to
  `data/brands/mundotip/brand-profile.yaml` (same rationale).
- [ ] 3.3 Verify the `src/production-queue/store.ts` `DEFAULT_QUEUE_PATH` is still `data/queue.json`
  (global queue — no change needed).
- [ ] 3.4 `npm test` → green (all 190+ tests pass; no test hardcodes the old path directly
  because they all inject paths or use temp-dir fixtures).

## 4. Brand skeleton template

- [ ] 4.1 Create `templates/brand-skeleton/` with the canonical empty shape:
  - `brand-profile.yaml` — minimal stub (channel stub, empty niche, empty voice, empty
    banned_words; clearly marked as a template to fill in).
  - `seeds.yaml` — empty seeds stub with commented examples.
  - `ledger.json` — `{ "baseline": { ... null fields }, "ideas": [] }` (empty but valid).
  - `your-data/.gitkeep` — so the dir is tracked.
  - `ideas/.gitkeep` — so the dir is tracked.

## 5. Self-review

- [ ] 5.1 `npx openspec validate issue-19-brand-resolver-migration --strict` → green.
- [ ] 5.2 `npm test` → green (typecheck + full suite including new brand resolver tests).
- [ ] 5.3 `npm run build` → exit 0.
- [ ] 5.4 Simplify / dead-code pass; confirm each of the 8 acceptance criteria maps to a specific
  named test or the migration artifact.
- [ ] 5.5 Write the Build Report into `handoff.md`.
