## Why

Issue #140 (Schedule Batch: the Zoho bulk-scheduler export) needs to stamp each exported Asset with a
`scheduled_at` timestamp, and the export summary needs to list a LinkedIn Copy variant's stripped
"unresolved mentions" reviewer note (issue #130, `CopyVariant.unresolvedMentions`). Before this slice,
neither survives the ledger's own read -> write -> read cycle: `src/asset/asset.ts`'s `parseAssetRecord`
has no `scheduled_at` field at all, and `parseCopyVariant` never reads back `unresolvedMentions` even
though `CopyVariant` (`src/copy/contract.ts`) already declares it (issue #130) and `compose.ts` already
writes it.

This is a live, already-triggered bug, not a hypothetical: `writeAsset` (`src/asset/store.ts`)
re-normalizes an Idea's WHOLE `assets[]` array through `normalizeIdeaStatus` -> `parseAssetsArray` ->
`parseAssetRecord` on every write, including a write that targets a completely different (sibling)
Asset on the same Idea. Straw Motion's ledger already holds a hand-written `scheduled_at` from the
2026-08-04 Schedule Batch smoke test; the next write to any OTHER Asset on that same Idea silently
drops it, and drops every variant's `unresolvedMentions` too, because the parser never reads either
field back in the first place. This slice is the prep fix issue #140's own build depends on.

## What Changes

- **`src/asset/asset.ts`** — `LedgerAssetRecord` gains an optional `scheduled_at?: string` (ISO-8601)
  field, placed alongside the existing `produced_at`/`post_url` timestamps. `parseAssetRecord` parses it
  defensively (a non-empty string is kept; anything else is omitted — never fabricated, never crashes).
  This is a PLAIN, additive Asset field: it carries **no lifecycle meaning of its own** — ADR-0011's
  six-stage `AssetStatus` vocabulary (`queued -> in_production -> produced -> posted -> tracking ->
  scored`) is completely unchanged; no `"scheduled"` status is added anywhere.
- **`src/asset/asset.ts`** — `parseCopyVariant` additionally parses the already-declared
  `CopyVariant.unresolvedMentions` (issue #130) — a raw non-empty array of strings is kept (non-string
  entries dropped defensively), included on the result ONLY when at least one entry survives (never a
  stray `unresolvedMentions: []` key), otherwise omitted entirely. This makes the field round-trip
  through the ledger for the first time; it was already written by `compose.ts` and already rendered by
  `output-bundle.ts`, but silently dropped on the very next ledger write.
- **Tests, test-first, hermetic** — `src/asset/asset.test.ts` gains direct unit coverage for both fields
  (well-formed parse, absent, malformed/dropped, non-new-status). `src/asset/store.test.ts` gains a
  regression test mirroring the real Straw Motion ledger shape: an Idea with two Assets, one carrying
  `scheduled_at` + a LinkedIn Copy variant's `unresolvedMentions`, the other plain; a write that only
  targets the SECOND (sibling) Asset must leave the first Asset's `scheduled_at`/`unresolvedMentions`
  completely intact, both in the raw JSON on disk and on a subsequent `loadIdeaAssets` read. No
  `spaces_*`/`creations_*` call anywhere in this diff — this slice touches ledger-parsing code only, no
  Magnific Space interaction of any kind (no fake needed or used).

## Non-Goals (explicitly deferred / out of scope)

- **The Schedule Batch export itself** (the `/export-schedule` command, the Media Host port, S3
  hosting, the Zoho CSVs, the cleanup step) — all of issue #140 beyond this one ledger-fidelity
  prerequisite. This slice only makes the ledger a safe place for that future export to WRITE
  `scheduled_at` into and READ `unresolvedMentions` back out of.
- **`/report` or `post.json` surfacing `scheduled_at`** — no reader outside the ledger/Asset store is
  touched; `ReportAssetRow` and `generatePostJson` are unmodified. A future slice can decide whether/how
  to surface the stamp once the export itself exists.
- **Any new Asset status, gate, or lifecycle transition.** ADR-0011 is explicitly unchanged — confirmed
  by a dedicated test asserting `status` stays whatever it already was after `scheduled_at` is parsed.
- **CONTEXT.md** — no new domain term is introduced by this slice (`scheduled_at` is an internal ledger
  field, not Operator-facing vocabulary); the **Schedule Batch** / **Zoho Social Brand** glossary
  candidates named in issue #140 belong to that later slice, not this one.

## Capabilities

### Modified Capabilities (none — see below)

No existing capability's REQUIREMENT TEXT is changed by this slice; the requirement title added below is
genuinely new (checked with `grep -n "^### Requirement" openspec/specs/asset-store/spec.md` — no
collision).

### Added Requirements, by capability

- `asset-store`: `parseAssetRecord`/`parseCopyVariant` parse an Asset's `scheduled_at` and a Copy
  variant's `unresolvedMentions` defensively, so both survive every ledger load -> write -> load cycle,
  including a write that targets an unrelated sibling Asset on the same Idea.

## Impact

- **Added:** nothing new on disk besides this OpenSpec change folder — every code change is additive to
  an existing file (no new `.ts` module).
- **Modified:** `src/asset/asset.ts`, plus its test file `src/asset/asset.test.ts` and
  `src/asset/store.test.ts`.
- **Not touched:** `src/copy/contract.ts` (`CopyVariant.unresolvedMentions` already existed, issue #130),
  `src/copy/compose.ts`, `src/asset/output-bundle.ts`, `src/asset/store.ts`, `src/ledger/ledger.ts`,
  `src/asset/migrate.ts`, any Skill/agent doc, CONTEXT.md, any live Brand's `ledger.json`.
- **Hermetic:** no Space/MCP call anywhere in this diff (`grep -rn "spaces_\|creations_"` over every
  touched file returns nothing) — pure ledger-parsing code, no Magnific fake needed or used.
- **Always-rules upheld:** ledger-as-source-of-truth (the fix makes the ledger itself stop silently
  losing data on write — the exact rule this bug violated); never-fabricate (a malformed/absent
  `scheduled_at` or `unresolvedMentions` degrades to omitted, never invented); generate-never-publish /
  public-metrics-only / relative-not-absolute / explicit-attribution are all untouched by this slice (no
  publish, metrics, baseline, or attribution code is modified).
