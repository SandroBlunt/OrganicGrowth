## Why

Epic #120 asks for LinkedIn `@mention` tagging of the real companies/products a Post's Copy names (e.g.
`@Anthropic`, `@1Password`). Tagging a real LinkedIn account needs resolving a plain company/product
name to that company's LinkedIn Page **handle** first — no such lookup exists in this repo today. Issue
#126 (this slice) builds ONLY that resolution: a small, typed, Operator-maintained lookup mapping a
plain name to a handle, or reporting "no entry" when one is not known. It deliberately does **not**
wire into Copy composition — inserting a resolved handle into a composed caption is issue #130's job,
downstream, after issue #129 (per-Channel Copy variants) also lands.

## Scope decision: one global lookup, not per-Brand (confirmed against #120's other slices)

Issue #126's own body flags this as an open question to confirm during implementation. It is now
settled, cross-checked against three sources:

- The companies a Copy names are **third-party** companies/products mentioned in news content (e.g.
  Anthropic, 1Password) — never a Brand's own identity. They are not Brand-owned data the way a
  `brand-profile.yaml` or a Brand Asset (`data/brands/<slug>/assets/`) is; the same real-world company
  can be mentioned in ANY Brand's content (Straw Motion's AI-news Format and a future Brand's tech
  coverage could both mention Anthropic).
- ADR-0019 (`docs/adr/0019-multi-channel-brand-profile-primary-tracked.md`), written after #126 was
  filed, already settles this forward: *"LinkedIn `@mention` tagging of other companies/products (#130)
  is resolved through a separate, dedicated lookup (#126) — not through this list."* — i.e. the
  Brand-scoped Channel model deliberately does NOT carry this data; it is treated as its own,
  brand-agnostic concern.
- Issue #130's own body confirms the consuming shape: *"resolve each company/product named in the
  Idea/Spec's structured companies data ... through #126's handle lookup"* — singular, one lookup, not
  one per Brand.

**Decision: the lookup is a single global file, shared across every Brand** — `data/linkedin-handles.yaml`
— mirroring the *shape* of the per-Brand `BrandAssetStore` precedent (a typed store boundary over a
plain, human-edited file that the set of committed entries alone defines — ADR-0014, ADR-0016) but
scoped brand-agnostically, alongside the repo's one other brand-agnostic state file, the Production
Queue (`data/queue.json`, ADR-0006).

## What Changes

- **Add `data/linkedin-handles.yaml`** — the Operator-maintained global lookup file (plain-name ->
  LinkedIn Page handle). Ships committed but with NO entries yet (a header comment documents the shape
  and gives the Operator two commented-out examples to copy) — this slice does not curate real
  third-party handle data; the Operator adds entries by hand as real ones are confirmed on LinkedIn
  itself. An absent/empty file is a normal, expected state (mirrors `BrandAssetStore`'s "no assets
  directory yet" convention), never an error.
- **Add `src/linkedin-handle/lookup.ts`** — a pure, deterministic deep module: the `LinkedInHandleTable`
  type, `parseLinkedInHandleTable(raw)` (defensive parsing of already-YAML-parsed content — drops a
  malformed entry with a warning rather than crashing, per data-handling rule 4), `emptyLinkedInHandleTable()`,
  and `resolveHandle(table, name)` (case-insensitive, trimmed name match; returns `string | null`, never
  fabricates).
- **Add `src/linkedin-handle/store.ts`** — the thin I/O shell: `DEFAULT_LINKEDIN_HANDLES_PATH`,
  `loadLinkedInHandleTable(path?)` (a missing file loads as the empty table — never throws; a file that
  exists but fails to parse as YAML throws a clear, path-naming error, mirroring `FormatStore`'s
  `loadFormat`), and `resolveLinkedInHandle(name, path?)` — the one typed store function issue #130 will
  call: loads the table and resolves `name` against it, returning `string | null`.
- **Doc note (AC4):** a store-level module comment on both new files states plainly that this lookup is
  **Operator-maintained** (a hand-edited file) and is **NOT** a live API/lookup call — no network
  request, no scraping, mirrors data-handling rule 2's "Apify does two jobs, never confused" boundary by
  explicitly staying outside both of them.

## Non-Goals (explicitly deferred / out of scope)

- **Wiring a resolved handle into composed Copy, or an `@mention` insertion rule.** That is issue #130,
  blocked on #129 landing first. This slice only ever resolves a name to a handle (or reports none) —
  it does not touch `src/copy/*`.
- **Curating real, verified LinkedIn handles for real companies.** The Operator owns that curation by
  hand, over time, as real mentions come up in produced content; this engineering slice ships the empty,
  documented file + the store code that reads it.
- **A live LinkedIn API lookup, scraping, or any network call.** Explicitly ruled out by the issue body;
  this store is 100% plain-file, matching `BrandAssetStore`'s and `FormatStore`'s "documents the human
  authors or reads stay files" precedent (ADR-0014).
- **A per-Brand variant of this lookup.** Decided against above; not built.
- **A CONTEXT.md glossary entry.** This is a small, implementation-level lookup consumed only by a
  later slice (#130); consistent with #122/#125's own precedent of leaving CONTEXT.md untouched for a
  slice that adds a mechanism without changing the domain vocabulary a human operator thinks in. The
  store-level module comment is this slice's doc note (AC4 explicitly allows either).

## Capabilities

### Added Capabilities

- `linkedin-handle-lookup`: a global, Operator-maintained, typed lookup resolving a plain company/product
  name to its LinkedIn Page handle, or reporting no entry — never fabricating a handle.

## Impact

- **Added:**
  - `data/linkedin-handles.yaml`
  - `src/linkedin-handle/lookup.ts`
  - `src/linkedin-handle/lookup.test.ts`
  - `src/linkedin-handle/store.ts`
  - `src/linkedin-handle/store.test.ts`
- **Modified:** none.
- **Not touched:** `src/copy/*` (no Copy-composition wiring — issue #130's job), `src/production-spec/*`,
  `brand-profile.yaml`/Channel model, `src/brand-asset/store.ts`, the live Magnific canvas, CONTEXT.md.
- **Hermetic:** no Space/MCP call anywhere in this diff; this slice is pure filesystem + string logic,
  so the Magnific fake is not exercised by it (there is nothing to fake). No live LinkedIn/network call
  either — the whole point of "Operator-maintained, not a live lookup" (AC4).
- **Always-rules upheld:** generate-never-publish (no publish-path code touched); public-metrics-only /
  relative-not-absolute (no metrics code touched); explicit-attribution (no Post/attribution code
  touched); ledger-as-source-of-truth (no ledger-write code path touched); never-fabricate (the whole
  point of `resolveHandle`/`resolveLinkedInHandle` — an unresolved name returns `null`, never a guessed
  handle).
