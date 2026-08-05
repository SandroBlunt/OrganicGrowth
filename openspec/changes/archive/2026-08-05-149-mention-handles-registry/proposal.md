## Why

The Operator wants ONE dedicated registry for every platform's `@mention` handles — not a LinkedIn-only
file — since X, Instagram, TikTok, and Facebook all auto-link `@handle` text too (decided 2026-08-04,
Zoho posting smoke-test session; issue #149). Issue #126 shipped `data/linkedin-handles.yaml`, a global,
Operator-maintained lookup keyed on a plain company/product name alone — one handle per name, no
platform dimension. This slice replaces it with a platform-keyed registry, `data/mention-handles.yaml`
(company -> `{ platform: handle }`), migrates the typed store to read it, and deletes the old file.

## Triage correction (supersedes the issue body's stale "Solution" section)

The issue's own "Solution" section claims `data/mention-handles.yaml` "now exists" and is "seeded with
OpenAI / Anthropic / Google" handles. As of this slice's start, that is **false**: no such file exists
anywhere in the repo (working tree or history), and `data/linkedin-handles.yaml` (issue #126) has **no
real entries** — just its header comments, exactly like every other Operator-maintained registry in this
repo (`data/brands/<slug>/formats/`, etc.) ships empty and is populated by hand over time. A 2026-08-05
triage comment on the issue corrects this and is authoritative over the stale body. This slice therefore
starts from an EMPTY slate on both ends: it creates `data/mention-handles.yaml` fresh, with zero
committed entries, and deletes `data/linkedin-handles.yaml` (which also had zero real entries) once
nothing reads it — it does **not** migrate or "mirror" any real handle data, because there was none to
migrate.

## What Changes

- **Add `data/mention-handles.yaml`** — the Operator-maintained global registry, keyed
  `company -> { platform: handle }` for the five recognized platform keys (`linkedin` / `x` /
  `instagram` / `tiktok` / `facebook`). Ships committed but with NO entries yet (mirrors issue #126's own
  "ships empty" precedent) — the Operator adds real, confirmed handles by hand over time. A company with
  no entry, or a platform key omitted for an otherwise-known company, resolves to no handle — never
  fabricated (AC2, unchanged never-fabricate contract from issue #126).
- **Migrate `src/linkedin-handle/` -> `src/mention-handle/`** (module directory RENAMED, not just its
  contents — see "Module rename" below): the pure deep module (`lookup.ts`) now parses and resolves a
  platform-keyed `MentionHandleTable`/`MentionHandleEntry` shape, and `resolveHandle(table, name,
  platform)` takes an explicit `MentionPlatform` argument. The I/O shell (`store.ts`) reads
  `data/mention-handles.yaml` (`DEFAULT_MENTION_HANDLES_PATH`) and exposes the generic
  `resolveMentionHandle(name, platform, path?)`, PLUS a friendly, LinkedIn-only convenience alias,
  `resolveLinkedInHandle(name, path?)` — mirroring `/pick-cast`'s own friendly alias built on the
  generic `/pick` command (ADR-0010) — so the ONE existing consumer, `src/copy/linkedin-mentions.ts`,
  keeps calling the exact same function name it already did; only the underlying data source changed.
- **`src/copy/linkedin-mentions.ts`'s contract is UNCHANGED (AC1).** `weaveLinkedInMentions` still
  resolves -> `@handle` text, or falls back to the plain name + an `unresolvedMentions` review flag when
  unresolved — byte-for-byte the same behavior issue #130 shipped. Only its import path
  (`../mention-handle/store.ts`) and its path parameter's name (`linkedInHandlesPath` ->
  `mentionHandlesPath`, since it no longer points at a LinkedIn-only file) changed; every existing
  `linkedin-mentions.test.ts` assertion about caption/handle behavior is preserved, re-pointed only at
  the new nested YAML shape in its own isolated fixtures.
- **`src/copy/compose.ts`'s `ComposeCopyOptions.linkedInHandlesPath` renamed to `mentionHandlesPath`** —
  same optional-path-override contract, same default-to-the-real-committed-file behavior, just an
  accurate name for what it now points at.
- **Other platforms' handles are available through the same store (out of scope: composing them).** The
  registry and `resolveMentionHandle` are already platform-generic — an `x`/`instagram`/`tiktok`/
  `facebook` handle for a company is resolvable today via `resolveMentionHandle(name, platform)`. Whether
  a given platform's OWN Copy variant actually weaves an `@mention` into its caption stays that variant's
  own future rule; this slice builds no mention-composition for X/Instagram/TikTok/Facebook (explicitly
  out of scope, per the issue body).
- **Delete `data/linkedin-handles.yaml`** once nothing in the codebase reads it (confirmed via a repo-wide
  grep sweep — see tasks.md).

## Module rename: `src/linkedin-handle/` -> `src/mention-handle/` (deliberate, explained)

The directory is renamed, not left as `linkedin-handle` with generalized contents, because:

1. **Honesty at the file-system boundary.** The data file it reads is now `data/mention-handles.yaml`
   (cross-platform, per the issue's own title: "one cross-platform registry"). A module named
   `linkedin-handle` reading a file named `mention-handles.yaml` would be a standing, permanent mismatch
   for every future reader — worse than the one-time cost of the rename itself.
2. **The type/function names already generalize.** `MentionHandleTable`, `MentionHandleEntry`,
   `MentionPlatform`, `resolveMentionHandle` — none of these are LinkedIn-specific; keeping them inside a
   directory called `linkedin-handle` would be its own internal inconsistency.
3. **Low mechanical risk.** Exactly ONE consumer exists (`src/copy/linkedin-mentions.ts`), whose own
   contract this slice explicitly keeps unchanged (AC1) via the `resolveLinkedInHandle` friendly alias —
   the rename touches import paths and doc-comment cross-references only, never behavior.

Every existing `openspec/specs/linkedin-handle-lookup/spec.md` requirement is REMOVED (with Reason +
Migration, mirroring the `production-queue` capability's own precedent for a superseded requirement set)
and replaced by a new `mention-handle-lookup` capability, ADDED by this slice.

## Non-Goals (explicitly deferred / out of scope)

- **Composing an `@mention` into any non-LinkedIn Copy variant** (X, Instagram, TikTok, Facebook). The
  data is available via the store; wiring it into each platform's own composition rule is that variant's
  own future slice.
- **Curating real, verified handles for real companies.** The Operator owns that curation by hand, over
  time; this slice ships the registry empty (exactly as issue #126 did).
- **A live platform API lookup, scraping, or any network call.** Explicitly ruled out; 100% plain-file,
  matching `BrandAssetStore`'s/`FormatStore`'s precedent (ADR-0014).
- **A per-Brand variant of this registry.** The scope decision from issue #126 (global, brand-agnostic)
  carries forward unchanged — reconfirmed, not reopened.
- **Migrating real handle data.** There was none to migrate (see the Triage correction above) —
  `data/linkedin-handles.yaml` had zero real entries.

## Capabilities

### Added Capabilities

- `mention-handle-lookup`: a global, Operator-maintained, typed, platform-keyed registry resolving a
  `(company, platform)` pair to that company's handle on that platform, or reporting no entry — never
  fabricating a handle. Supersedes `linkedin-handle-lookup`.

### Removed Capabilities

- `linkedin-handle-lookup`: retired — every requirement it described is superseded by
  `mention-handle-lookup`'s platform-keyed generalization (see that spec delta's REMOVED section for the
  per-requirement mapping).

### Modified Capabilities

- `copy-composition`: no BEHAVIOR change (AC1 — LinkedIn mention weaving is byte-for-byte the same); the
  requirements that named the old `src/linkedin-handle/store.ts`/`data/linkedin-handles.yaml`/
  `linkedInHandlesPath` are restated to name the new `src/mention-handle/store.ts`/
  `data/mention-handles.yaml`/`mentionHandlesPath`.

## Impact

- **Added:** `data/mention-handles.yaml`, `src/mention-handle/lookup.ts` (+ test),
  `src/mention-handle/store.ts` (+ test).
- **Removed:** `data/linkedin-handles.yaml`, `src/linkedin-handle/` (renamed away, not left behind).
- **Modified:** `src/copy/linkedin-mentions.ts` (+ test — import path + param rename only, contract
  unchanged), `src/copy/compose.ts` (+ test — `ComposeCopyOptions` field rename only),
  `src/copy/platform-shape.ts`, `src/copy/validate.ts`, `src/copy/write-social-copy-skill.docs-test.ts`
  (doc-comment/assertion path updates only, no behavior change),
  `.claude/skills/write-social-copy/SKILL.md`, `.claude/agents/producer.md` (prose path updates only).
- **Not touched:** the Magnific canvas/Execution Protocol, `src/production-spec/*`, `brand-profile.yaml`/
  Channel model, `src/brand-asset/store.ts`, CONTEXT.md (this stays an implementation-level lookup, same
  as issue #126's own precedent).
- **Hermetic:** no Space/MCP call anywhere in this diff; this slice is pure filesystem + string logic
  (mirroring issue #126's own scope), so the Magnific fake is not exercised by it — there is nothing to
  fake. No live network/platform API call either.
- **Always-rules upheld:** generate-never-publish (no publish-path code touched); public-metrics-only /
  relative-not-absolute (no metrics code touched); explicit-attribution (no Post/attribution code
  touched); ledger-as-source-of-truth (no ledger-write code path touched); never-fabricate (the whole
  point of `resolveHandle`/`resolveMentionHandle`/`resolveLinkedInHandle` — an unresolved `(company,
  platform)` pair, or a company with no entry for that specific platform, returns `null`, never a guessed
  handle).
