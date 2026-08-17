# Slice Handoff — issue #222: swap the seven existing stores from ledger files to SQL

Bidirectional document. developer's Build Report is below; qa appends its Verdict beneath, in a new
section — nothing here is overwritten.

## Build Report (Round 1)

### What changed

This is the "wide, mechanical" first half of #202 (split at triage from the "genuinely new IdeaStore"
half, #223). It gives six of the seven named stores (Asset, Production Spec, Brand, Channel, Format,
Brand Asset) a `{ db }`-backed way to persist, and lands the shared transaction helper #223 is expected
to reuse. The seventh named store, Mention Handle, and `production-queue/store.ts` (raised by the brief
as "check whether it's in scope") are both concluded OUT of scope, with the reasoning below.

**The framing that matters most:** for six of the seven, this is genuinely additive, not a rewrite of an
existing exported function's contract. Only `AssetStore` had a real pre-existing `{ ledgerPath }`-taking
API; I gave `loadIdeaAssets`/`writeAsset` a second, `{ db }`-backed overload on the SAME exported names,
leaving the file-based branch's code path completely untouched — because `asset` rows key on `idea_id`,
and `IdeaStore` (issue #223) — the thing that would let `asset`'s real production callers actually read/
write an Idea via SQL — does not exist yet. Rewiring those four callers today would have forced either a
broken Idea-side read or an unwanted half-migrated dual-write. This is the literal reading of "no caller
above the store boundary changes shape" I chose: not one caller's shape changes, because not one
caller is touched. Full reasoning is in `proposal.md`'s "Known gaps, decided, not dropped" section — I
read it before touching any code, and it should be read before reviewing the diff.

For Brand and Channel, there was no pre-existing store module at all (`brand-profile.yaml` was read ad
hoc) — these are genuinely new, `{ db }`-only stores that establish the pattern, per the brief's own
framing that this ticket's `{ db }` shape and transaction helper are the template #223 inherits. For
Format and Brand Asset, the existing modules were always READ-ONLY file readers with no injected
persistence option to "swap" at all — I added a `{ db }`-only CRUD layer alongside them, untouched. For
Production Spec, `saveSpec`/`specPathFor` never took an option object either (`saveSpec(spec, path)`,
positional) — I added `saveProductionSpec`/`loadProductionSpec`, writing the SAME column
(`asset.spec_json`) `AssetStore`'s SQL branch writes.

### Files touched

New:
- `src/db/transaction.ts` (+`.test.ts`) — the shared `withTransaction` helper.
- `src/brand/store.ts` (+`.test.ts`) — new BrandStore.
- `src/channel/store.ts` (+`.test.ts`) — new ChannelStore, including the atomic `setPrimaryChannel`.
- `src/copy/store.ts` (+`.test.ts`) — new Copy Variant store, keyed to a Channel.
- `src/asset/db-store.test.ts` — tests for AssetStore's new `{ db }` overloads and `asset_media` rows.
- `src/production-spec/db-store.test.ts` — tests for the new `saveProductionSpec`/`loadProductionSpec`.
- `src/format/db-store.test.ts` — tests for Format's new `{ db }`-backed CRUD layer.
- `src/brand-asset/db-store.test.ts` — tests for Brand Asset's new `{ db }`-backed CRUD layer.
- `openspec/changes/issue-222-swap-stores-to-sql/` (this change).

Modified:
- `src/asset/store.ts` — `loadIdeaAssets`/`writeAsset` gain additive `{ db }` overloads;
  `addAssetMedia`/`addAssetMediaBatch`/`listAssetMedia` added. File-based branch's code path unchanged.
- `src/format/store.ts` — `createFormat`/`getFormatBySlug`/`getFormatById`/`listFormatsForBrand`/
  `updateFormat` added. YAML-reading functions unchanged.
- `src/brand-asset/store.ts` — `createBrandAsset`/`getBrandAssetByKey`/`listBrandAssetsForBrand` added
  (delegating to `src/db/media-ref.ts`'s `insertBrandAsset`). Directory-listing functions unchanged.
- `src/production-spec/store.ts` — `saveProductionSpec`/`loadProductionSpec` added. File-based functions
  unchanged.
- `.claude/rules/always/organicgrowth-rules.md` — rule 7 corrected: states which stores are now
  SQL-backed and that no production caller has been switched over yet.
- `src/db/adr.docs-test.ts` — its Rule 7 assertions updated to match the corrected wording.

Untouched (deliberately, and verified by `git status`/`git diff`):
- `src/db/schema.ts`, `src/db/migrate.ts` — `MIGRATION_1`/`MIGRATION_2` stay byte-for-byte frozen.
- `src/mention-handle/store.ts`, `src/production-queue/store.ts`.
- Every real production caller of the file-based stores; `src/asset/store.test.ts` (the existing
  file-based AssetStore suite) — zero source changes.

### How to run

```
cd /Users/CaxtonTaylor/Developer/.og-worktrees/issue-222-swap-stores-to-sql
npx tsc -p tsconfig.json --noEmit
npm test                                  # 2921 / 746 suites / 0 fail (baseline: 2853 / 724 / 0 fail)
npx openspec validate issue-222-swap-stores-to-sql --strict
npx openspec validate --all --strict      # 48 passed, 0 failed (baseline: 47)
```

To run just this ticket's new suites:
```
node --import tsx --test src/db/transaction.test.ts src/brand/store.test.ts src/channel/store.test.ts \
  src/format/db-store.test.ts src/brand-asset/db-store.test.ts src/asset/db-store.test.ts \
  src/copy/store.test.ts src/production-spec/db-store.test.ts
```

### Acceptance-criteria self-assessment

- **"Asset, Production Spec, Brand, Channel, Format, Brand Asset and Mention Handle stores each keep
  their name, their operations and their return shapes, and swap `{ ledgerPath }` for `{ db }`."**
  - Asset: `src/asset/db-store.test.ts` — `loadIdeaAssets`/`writeAsset` proven against `{ db }`, same
    exported names, same null-vs-`[]` convention, same upsert-not-duplicate semantics as the file branch
    (compare `writeAsset({ db }) — upserts...` describe block against the untouched
    `src/asset/store.test.ts`'s own `writeAsset` describe block — same scenarios, `{ db }` instead of
    `{ ledgerPath }`). Return shape (`DbAssetRecord`) is DELIBERATELY narrower than
    `LedgerAssetRecord` — see "Known limits" below; this is a documented finding, not an oversight.
  - Production Spec: `src/production-spec/db-store.test.ts` — `saveProductionSpec`/`loadProductionSpec`
    round-trip verbatim against `asset.spec_json`.
  - Brand: `src/brand/store.test.ts` — full CRUD, genuinely new store (`{ db }`-only from the start).
  - Channel: `src/channel/store.test.ts` — full CRUD plus the atomic `setPrimaryChannel`.
  - Format: `src/format/db-store.test.ts` — CRUD additive to the untouched YAML reader
    (`src/format/store.test.ts` still passes, 58 tests, zero changes).
  - Brand Asset: `src/brand-asset/db-store.test.ts` — CRUD additive to the untouched directory listing
    (`src/brand-asset/store.test.ts` still passes, 45 tests total incl. the new file, zero changes to
    the old one).
  - Mention Handle: **concluded out of scope.** No `mention_handle` table exists in `ENTITY_TABLES`
    (`src/db/schema.ts`, frozen from #201), no CONTEXT.md glossary entry names it, no other table
    foreign-keys into it, and its own module doc already states "Operator-maintained, NOT a live
    lookup" — a hand-edited global YAML file matching ADR-0029's "documents a human authors... stay
    files" principle exactly, the SAME principle that keeps Format YAML and Brand Profile as files. It
    also never took a `{ ledgerPath }` option to begin with. I judged the issue's own listing here to be
    imprecise rather than a deliberate design call, and report the conclusion instead of inventing a
    table `schema.ts`'s own frozen migrations never named. **Flag for the Operator**: if Mention Handle
    genuinely IS meant to move to SQL, that needs a new migration (additive, not touching
    MIGRATION_1/2) — a small follow-up, not a blocker to this ticket's other six stores.
- **"`asset_media` and `copy_variant` are stored as rows, with Copy variants keyed to a Channel."**
  Proven by `src/asset/db-store.test.ts`'s `addAssetMedia`/`addAssetMediaBatch`/`listAssetMedia`
  describe block, and `src/copy/store.test.ts` in full — every variant keyed to a real `channel_id` FK,
  not a bare platform string.
- **"Every existing store test suite passes against a real throwaway database, with only the injected
  option changed."** Literally true only for `AssetStore` — the ONE store that had both (a) a
  pre-existing suite and (b) an actual `{ ledgerPath }` option to swap. That suite
  (`src/asset/store.test.ts`) is untouched and green; `src/asset/db-store.test.ts` is its `{ db }`
  sibling, hand-mirrored scenario-for-scenario. For Format/Brand Asset/Production Spec, the pre-existing
  suites test operations that never took an injected persistence option (plain YAML/file readers) — those
  suites are untouched and green, and the NEW `{ db }` operations get their OWN new suite, since there
  was no prior `{ db }`-shaped test to port from. For Brand/Channel/Copy Variant, there was no
  pre-existing suite at all. Every suite — old and new — runs against `withTempDb`'s real, throwaway
  SQLite file, never `:memory:`.
- **"Writes run in transactions, so a partial write cannot land. Prove a failed multi-row write leaves
  nothing behind."** `src/db/transaction.test.ts`'s "a multi-row write that fails PARTWAY THROUGH leaves
  NOTHING behind" is the generic proof (a 2-row Channel insert where the second violates the
  one-primary-per-Brand index — neither row survives). Two MORE proofs tied directly to the concrete
  Asset/Copy shapes the AC names: `src/asset/db-store.test.ts`'s "addAssetMediaBatch: a failure partway
  through a multi-row batch leaves NOTHING behind" (3-item batch, 3rd item's duplicate ordinal rolls back
  all 3), and `src/copy/store.test.ts`'s "a failure partway through a multi-channel batch leaves NOTHING
  behind" (2-item batch, 2nd item's unknown channel rolls back both).
- **"No caller above the store boundary changes shape."** Verified two ways: (1) `git status`/`git diff`
  show zero changes to any of the 4 real production modules that import `writeAsset`
  (`track-performance.ts`, `export-schedule.ts`, `schedule-via-zoho-mcp.ts`,
  `upload-camera-hub-scripts.ts`), and zero changes to `src/asset/store.test.ts`. (2) The full suite
  (2921 tests) is green, which would fail loudly (a `tsc --noEmit` error, first thing `npm test` runs)
  if any caller's compile-time shape had actually changed.

### Fakes / fixtures used

- `src/db/test-support.ts`'s `withTempDb` — a real, throwaway SQLite file per test, mkdtemp'd and
  removed in a `finally`, exactly as #201 established. No `:memory:` anywhere in this slice.
- No fixture data files added; every test seeds its own minimal Brand/Channel/Format/Run/Idea/Asset
  chain directly via `createBrand`/`createChannel`/`createFormat` (this ticket's own new stores) plus a
  raw `idea`/`run` INSERT (since `IdeaStore` doesn't exist yet — issue #223), mirroring
  `schema.test.ts`'s own established fixture-seeding convention.
- **The Magnific fake is not used and not needed.** This slice never touches Space-facing code
  (`src/space-driver/`, `src/producer/`) — confirmed by `git status`: no file under either directory is
  touched. No live `spaces_*`/`creations_*` MCP call is possible from anything this ticket added.

### Self-review notes

- Removed an accidental empty `it()` block (a placeholder comment with no assertion) from a first draft
  of `src/db/adr.docs-test.ts`'s Rule 7 update — folded into two real, distinctly-named assertions
  instead.
- Fixed 4 `openspec validate --strict` failures caused by a mid-sentence markdown line-wrap that pushed
  a Requirement's `SHALL` past the validator's first-line check — reworded the 4 opening sentences so
  the function list and `SHALL` sit on the same source line.
- Considered, and rejected, replacing `src/asset/store.ts`'s existing `{ ledgerPath }` branch in place
  (a literal reading of "swap") — that would have forced editing 4 live production command modules whose
  Idea-side migration is out of scope, and risked subtle behavior drift in code this ticket has no way to
  test against a live Space. The additive-overload bridge achieves the same `{ db }` capability with zero
  blast radius; documented as a deliberate call in `proposal.md`, not a silent narrowing.
- Reused `src/db/media-ref.ts`'s `insertAssetMedia`/`insertBrandAsset` rather than re-implementing the
  `assertRootRelativeStorageKey` guard a second time in `src/asset/store.ts`/`src/brand-asset/store.ts` —
  that module's own doc comment named this ticket as the one that would build the "future typed
  BrandAssetStore/AssetMediaStore"; reusing it keeps the guard in exactly one place.
- Reused `src/asset/asset.ts`'s existing `parseZohoScheduleReference` for the SQL branch's read path,
  rather than writing a second parser for the identical "string or array of strings, verbatim" rule.

### Known limits

- **`DbAssetRecord` is narrower than `LedgerAssetRecord`.** No column exists for `cast`/`character` (the
  *Character Explainer with Cast* Recipe's own gate-local fields — that Recipe's survival is an
  explicitly OPEN epic question), `has_video_slide` (the News Carousel Recipe's own extension flag), or
  `metrics`/`tracked_at`/`history`/`post_url`/`posted_at`/`performance_score` (ADR-0028 moves these onto
  new `post`/`metric_snapshot`/`performance_score` tables, keyed by Channel — not built by this ticket;
  ADR-0028's own Consequences section says this work is "expected to land alongside issue #202's store
  swap" without saying which half, and no Post/Performance store is named in #222's own AC, so I treated
  it as out of scope here). This is documented in `src/asset/store.ts`'s own module doc comment and in
  the `asset-store` spec delta's "SQL-backed Asset shape" Requirement — a real gap for whoever builds
  Post/Performance persistence next, not a silent one.
- **Mention Handle stays file-based** (see acceptance-criteria section above) — a flagged finding, not a
  quiet drop.
- **`production-queue/store.ts` is untouched** — real job claiming (an atomic, owner-and-expiry
  `UPDATE ... RETURNING`) is explicitly issue #203's job per the epic's own Implementation Decisions,
  and is a materially different concurrency-safety problem from this ticket's mechanical substitution.
- **No existing production caller has been switched onto any `{ db }` branch.** That is deliberate (see
  "What changed" above), and is itself the biggest open item for whichever ticket follows #223: once
  `IdeaStore` exists, the 4 real `writeAsset` callers (plus `ledger.ts`, `report.ts`, `pick-cast.ts`, and
  others) still need to be individually rewired — that work is NOT done here.
- **`setPrimaryChannel`'s two-row demote/promote is transaction-safe against a crash, but not against a
  concurrent second writer** (no row-level locking) — matches the epic's own scoping: real concurrent-
  claim safety is issue #203's job, not this ticket's.

## QA Verdict — Round 1: PASS

Verified in `/Users/CaxtonTaylor/Developer/.og-worktrees/issue-222-swap-stores-to-sql`, branch
`issue-222-swap-stores-to-sql`, HEAD `49f33cde12c51c42177b61be6c40fa850a001f81`, rebased onto `main`
`3d55a9d68ee0b0fe05965b96d394c51f4154ddb0`. Read/ran only — no product code, test, spec, or ledger
edits made.

### Suite result

- `npx tsc -p tsconfig.json --noEmit` — clean, no output, exit 0.
- `npm test` (runs `tsc --noEmit` then `node --import tsx --test "src/**/*.test.ts" "src/**/*.docs-test.ts"`)
  — **2956 tests / 753 suites / 0 fail / 0 cancelled / 0 skipped**. Matches the Operator-supplied
  post-rebase figure exactly; the developer's Build Report's 2921/746 is confirmed stale (pre-rebase).
- `npm run test:docs` run separately (`node --import tsx --test "src/**/*.docs-test.ts"`) — **283 tests /
  76 suites / 0 fail**, including the two updated Rule-7 `adr.docs-test.ts` assertions.
- `npx openspec validate issue-222-swap-stores-to-sql --strict` — `Change 'issue-222-swap-stores-to-sql'
  is valid`.
- `npx openspec validate --all --strict` — **49 passed, 0 failed** (one higher than the Build Report's
  stale 48/47 because `main` picked up `spec/apify-live-client` from issue #200/#224 during the rebase;
  not a regression).
- All four commands actually executed by me in this session, real output captured above — not assumed.

### Independent verdict on the central question: additive `{ db }`, not a literal swap

**This is the right engineering call for this slice, not a quiet miss of the ticket.** Reasoning, checked
file-by-file against `main` at `3d55a9d`, not taken on the developer's word:

1. **The developer's factual claims about the pre-existing code all check out.** On `main`:
   `src/brand/` held only `resolver.ts`/`scaffolder.ts` — no store module, no `{ ledgerPath }` option,
   nothing to swap. `src/channel/` **did not exist at all**. `src/format/store.ts`'s `loadFormat`/
   `listFormatSlugs`/`parseFormatFile` take no injected persistence option — the module's own doc
   comment says so explicitly ("Write path ... is intentionally NOT built in this slice"). `src/brand-
   asset/store.ts`'s `listBrandAssets(brand, brandsRoot?)`/`getBrandAsset(...)` are positional, no
   options object. `src/production-spec/store.ts`'s `saveSpec(spec, path)`/`specPathFor(...)` are
   positional too. Only `AssetStore`'s `writeAsset(..., options: { ledgerPath })` genuinely took the
   named option the ticket describes (`loadIdeaAssets`'s second arg was a bare `ledgerPath: string`, not
   even wrapped in an object). Four of the seven named stores plainly did not match the ticket's own
   mental model — the ticket's "every store takes `{ ledgerPath }` and swaps it" premise was written
   from a wrong model of the code for the majority of the list.
2. **ADR-0029 (the schema-founding ADR, checked directly, not paraphrased) explicitly carves out exactly
   this exception**: *"Documents a human authors or reads directly stay files — Brand Profile YAML,
   Format YAML, the markdown Briefs, the Baseline Prompt documents. This ADR governs the
   relational/canonical state ADR-0014 already scoped to the store boundary (the ledger, the queue),
   never every file under `data/`."* Format's YAML staying the live, edited document while `format` also
   becomes a referenced SQL row (because `run`/`idea`/`baseline_prompt` FK into it — verified in
   `src/db/schema.ts`) is not the developer's invention; it is the ADR's own design. Same for Brand
   Profile.
3. **`asset.idea_id` genuinely FOREIGN KEYs to `idea(id)`** (verified directly in `src/db/schema.ts`).
   `IdeaStore` does not exist (`issue #223`). Real `writeAsset` production callers cannot legally write a
   `{ db }`-backed Asset row today without an Idea row that has no way to exist in SQL yet — a hard
   constraint, not a preference.
4. **The decisive point, which the Build Report under-states**: no entity's SQL tables hold real
   production data yet, for ANY of the seven stores, because the one-shot importer (issue #204,
   explicitly named in epic #195 as a separate, later slice) has not run. Even Brand/Channel/Format —
   which have no Idea-FK dependency at all — could not have had their real production readers (e.g.
   `src/brand/resolver.ts`, still reading `brand-profile.yaml`) pointed at SQL in this slice, because the
   SQL `brand`/`channel`/`format` tables would be empty; doing so would break every live caller outright.
   This means a literal, caller-visible "swap" was **structurally impossible for this ticket alone**,
   independent of which of the two readings of the ticket's prose is preferred — it required #204 (the
   importer) and, for Asset specifically, #223 (`IdeaStore`) to exist first. `docs/adr/0029`'s own
   Consequences section confirms the sequencing: "This ticket (#201) lands the database ... It does NOT
   swap any existing store's backing (issue #202) and does NOT run the one-shot importer ... (issue
   #204) — both are later, blocked-on-this-ticket slices," i.e. #202/#222 was never scoped to include the
   importer that would make a real swap observable.
5. Weighed against this: the epic body (`#195`, "The store layer" section, and its own high-level bullet
   4) does use "becomes"/"swaps its backing... in place" language, which reads as a stronger, more literal
   swap than what was built. I take this as the epic's END-STATE description across the WHOLE sequence
   (#201→#222→#204→#223→caller rewiring), not a claim that #222 alone completes it — the same document's
   own "Blocked by" structure and phased Implementation Decisions make clear this is a multi-ticket
   arc. Read that way, the epic's language and the additive slice are consistent, not contradictory.
6. **The overload pattern itself is sound, not a hack**: `loadIdeaAssets`/`writeAsset` keep their exact
   exported names with TypeScript overloads distinguishing branches by argument shape — a standard
   strangler-fig migration seam that lets the file branch be deleted later without another rename. I
   verified via `git diff 3d55a9d..HEAD -- src/asset/store.ts` that the **existing file-based branch's
   runtime code is untouched line-for-line** (only a type-only cast was added to satisfy the shared
   dispatcher's overload union) — this is not spin, it is what the diff shows.
7. **I independently confirmed, not just accepted, "no caller changes shape."** `git diff 3d55a9d..HEAD`
   against `src/ledger/ledger.ts`, `src/asset/attribution.ts`, `src/schedule-batch/{manifest,cleanup-
   runner,plan}.ts`, `src/copy/compose.ts`, and all 4 `src/commands/{track-performance,export-schedule,
   schedule-via-zoho-mcp,upload-camera-hub-scripts}.ts` — every one is **byte-for-byte unchanged**. So is
   `src/asset/store.test.ts`, `src/format/store.test.ts`, and `src/brand-asset/store.test.ts` (diffed
   directly against `main`, not sampled).

**Conclusion: PASS on the central question.** The ticket's "swap" wording, taken completely literally in
one slice, was unachievable without either (a) breaking every real production caller immediately (empty
SQL tables, no importer yet) or (b) building the importer and `IdeaStore` inside this ticket too, which
the epic's own triage explicitly split out into #204 and #223. The additive overload is the correct,
lowest-risk way to deliver exactly what this ticket's own stated value is — "establish the `{ db }`
option shape and the transaction helper `IdeaStore` inherits" — without touching a live system that has
nowhere yet for that data to safely land. This is a legitimate outcome, not a scope dodge: I would flag
it as a dodge if any ONE of the seven stores had a safe, real, populated place in SQL to write to today
and the developer chose not to wire it up anyway — I found no such case.

One thing I will flag as a **process gap, not a defect in this slice**: the Build Report's own framing
leans on per-store idiosyncrasies (no store existed / no option existed / FK blocks it) as the reason
nothing was touched, without stating the simpler, uniform reason that covers all seven — no SQL table
anywhere has real data yet, because #204 hasn't run. A future round or #223's handoff should lead with
that, since it's the argument that actually forecloses "well, couldn't you have swapped just Brand/
Channel since they have no Idea dependency?" before an operator has to ask it.

### Per-criterion results (issue #222 acceptance criteria)

| # | Criterion | Result | Proving test |
|---|---|---|---|
| 1 | Asset, Production Spec, Brand, Channel, Format, Brand Asset stores keep name/operations/shape, gain `{ db }` | PASS | `src/asset/db-store.test.ts`, `src/production-spec/db-store.test.ts`, `src/brand/store.test.ts`, `src/channel/store.test.ts`, `src/format/db-store.test.ts`, `src/brand-asset/db-store.test.ts` — all read/write real `withTempDb` databases, verified passing. |
| 1b | Mention Handle store swaps to `{ db }` | **NOT MET, correctly flagged as a gap** — see "Mention Handle" section below. Not a silent drop: reported in both `proposal.md`'s "Known gaps" and the handoff's AC self-assessment. | N/A — no table exists to test against. |
| 2 | `asset_media` and `copy_variant` stored as rows, Copy variants keyed to a Channel | PASS | `src/asset/db-store.test.ts` (`addAssetMedia`/`addAssetMediaBatch`/`listAssetMedia`); `src/copy/store.test.ts` in full — `copy_variant.channel_id REFERENCES channel(id)` verified directly in `src/db/schema.ts`, and `upsertCopyVariants` rejects an unknown `channelId` with a real `FOREIGN KEY` error (`src/copy/store.test.ts:133-145`). |
| 3 | Every existing store test suite passes against a real throwaway database, only the injected option changed | PASS, with the developer's own honest caveat confirmed true by me: literally applies only to `AssetStore` (the one store with both a pre-existing suite AND a pre-existing option). Verified `src/asset/store.test.ts` unchanged byte-for-byte (`diff` against `main`, exit 0) and still green; the four other pre-existing suites (`format/store.test.ts`, `brand-asset/store.test.ts`) are also byte-for-byte unchanged and green, but never took an injected option to begin with — confirmed on `main`, not just asserted. | `git diff 3d55a9d..HEAD -- src/asset/store.test.ts src/format/store.test.ts src/brand-asset/store.test.ts` (all empty). |
| 4 | Writes run in transactions; a failed multi-row write leaves nothing behind, proven | PASS | `src/db/transaction.test.ts:49` ("a multi-row write that fails PARTWAY THROUGH leaves NOTHING behind") — a real 2-row Channel insert, second row violates the one-primary-per-Brand partial unique index, asserts `COUNT(*) = 0` afterward, not merely that an error was thrown. Two further concrete proofs: `src/asset/db-store.test.ts:206-224` (`addAssetMediaBatch`, 3-row batch, 3rd row's duplicate ordinal rolls back all 3) and `src/copy/store.test.ts:133-145` (`upsertCopyVariants`, 2-row batch, 2nd row's unknown channel rolls back both). All three assert the post-failure row count/contents, not just that `withTransaction` threw. |
| 5 | No caller above the store boundary changes shape | PASS, independently re-verified (not taken on the developer's word) | `git diff 3d55a9d..HEAD` against `src/ledger/ledger.ts`, `src/asset/attribution.ts`, `src/schedule-batch/manifest.ts`, `src/schedule-batch/cleanup-runner.ts`, `src/schedule-batch/plan.ts`, `src/copy/compose.ts`, `src/commands/track-performance.ts`, `src/commands/export-schedule.ts`, `src/commands/schedule-via-zoho-mcp.ts`, `src/commands/upload-camera-hub-scripts.ts`, `src/commands/log-post.ts` — every file diffed empty. |

### Mention Handle — verified as a schema gap, correctly flagged, not a defect in this slice

Checked directly, not taken on the Build Report's word:
- `src/db/schema.ts`'s `ENTITY_TABLES` (frozen from #201) has no `mention_handle` entry — confirmed by
  direct read.
- Issue #201's own acceptance criterion listing every entity the schema must cover
  (`brand, channel, format, baseline_prompt, brand_asset, run, trend, idea, idea_recipe, asset,
  asset_media, copy_variant, job, gate_request, post, metric_snapshot, performance_score,
  channel_baseline` — fetched verbatim via `gh issue view 201`) **does not include `mention_handle`
  either**. So the omission traces to #201's own AC, not to this developer's schema-authoring choice
  (#201 shipped before this ticket, already merged).
- `CONTEXT.md` has no "Mention Handle" glossary entry (`grep -in mention CONTEXT.md` returns only the
  unrelated Copy-element sense of "mentions").
- Issue #202 (parent), fetched verbatim, is the ticket that FIRST names "Mention Handle" among the seven
  stores to swap — i.e. #202/#222's AC and #201's schema AC disagree with each other; this is a
  cross-ticket inconsistency introduced when #202 was written, not something #222's developer invented
  or should silently paper over.
- A `mention_handle` table COULD be added additively via a new `MIGRATION_3` (the migration mechanism
  supports this — `MIGRATION_2` already exists as precedent) without touching `MIGRATION_1`/`MIGRATION_2`,
  so this is not a blocker to the rest of the schema — but it was correctly NOT done in this slice, since
  inventing a table neither #201's schema AC nor CONTEXT.md names would be scope invention, the opposite
  problem QA is watching for.

**Verdict: this is a genuine gap in #201/#202's own tickets, correctly identified and flagged by the
developer (in `proposal.md`'s "Known gaps" and the handoff's AC self-assessment) rather than either (a)
silently dropped or (b) papered over by inventing an unrequested table. Not a defect in this slice.**
Recommend the Operator open a short follow-up (a `MIGRATION_3` adding `mention_handle`) if Mention Handle
is genuinely meant to move to SQL — it is not blocking anything else in this epic today.

### `production-queue/store.ts` — deferral verified as structurally necessary, not merely convenient

Checked issue #203 verbatim (`gh issue view 203`): the queue's ticket is not "swap the queue's storage
to SQL," it is a **behavioral** change — real atomic claim-with-owner-and-expiry (`UPDATE ... RETURNING`),
job identity moving to a surrogate `id`, `(brand, idea, recipe)` becoming a non-unique lookup, and the
`lock` field being **deleted, not ported**. Epic #195's own "Testing Decisions" section is explicit:
*"There is no prior art in the repo for the concurrency tests, because the current model cannot express
them."* This means the queue's storage and its claiming semantics are NOT separable the way Asset's
storage and Idea's semantics are — the file-based queue.json model cannot even express row-level
locking, so a "storage-only" SQL swap of the queue would still need the SAME real rewrite #203 already
owns to be useful for anything. Deferring the whole module to #203 (which is explicitly `Blocked by:
#202`) is correct, not a convenient dodge — verified against #203's own acceptance criteria, not assumed.

### Per-scenario results (spec deltas)

All Scenarios in the 8 spec delta files were read in full and cross-checked against a named, passing
test. No Scenario was found unproven.

- `specs/sqlite-foundation/spec.md` — all 4 Scenarios (`commits every write`, `fails on second row
  leaves nothing behind`, `original error re-thrown unchanged`, `nesting throws loudly`) → PASS,
  proven by `src/db/transaction.test.ts` (read in full, matches scenario-for-scenario).
- `specs/asset-store/spec.md` — MODIFIED Requirement's 5 Scenarios + ADDED Requirements' 5 Scenarios →
  PASS, proven by `src/asset/db-store.test.ts` and the untouched `src/asset/store.test.ts`. Header
  `### Requirement: AssetStore is the typed read/write boundary for an Idea's Assets` matches the base
  spec's existing header at `openspec/specs/asset-store/spec.md:178` verbatim — archive-safe.
- `specs/format-store/spec.md`, `specs/brand-asset-store/spec.md`, `specs/production-spec/spec.md` —
  each uses `## ADDED Requirements` (correct header type for a wholly new Requirement on an existing
  capability, not `## MODIFIED`, since none of them rewrite an existing Requirement's text) → PASS,
  proven by `src/format/db-store.test.ts`, `src/brand-asset/db-store.test.ts`,
  `src/production-spec/db-store.test.ts` respectively.
- `specs/brand-store/spec.md`, `specs/channel-store/spec.md`, `specs/copy-variant-store/spec.md` — new
  capabilities (confirmed no `openspec/specs/brand-store`, `channel-store`, or `copy-variant-store`
  directory exists on `main` yet) → PASS, proven by `src/brand/store.test.ts`, `src/channel/store.test.ts`
  (incl. `setPrimaryChannel`'s atomic-move and unknown-id scenarios), `src/copy/store.test.ts`.

### Always-rules + Magnific-fake checks

| Rule | Result | Evidence |
|---|---|---|
| Generate-never-publish | PASS (untouched by construction) | No file under `src/space-driver/`, `src/producer/`, or any Zoho/publish path appears in `git diff 3d55a9d..HEAD --name-only`. |
| Public-metrics-only | PASS (untouched by construction) | No `performance-tracking`/Apify-scrape code touched; `performance_score`/`metric_snapshot` fields explicitly excluded from `DbAssetRecord` by design (see spec delta), deferred to a Post/Performance store not built here. |
| Relative-not-absolute | PASS | Confirmed — no scoring/baseline-comparison code touched in this slice; `channel_baseline` untouched. |
| Explicit-attribution | PASS | Confirmed — no Post/attribution code touched; `post` table untouched, deferred to #203/later. |
| Ledger-as-source-of-truth | PASS, and actively verified as PRESERVED not weakened | Rule 7 update (`.claude/rules/always/organicgrowth-rules.md`, diffed directly) now correctly states `ledger.json` "stays the source of truth the live pipeline actually reads and writes" until #223+ — matches the diff-verified fact that zero real callers were switched. `src/db/adr.docs-test.ts`'s Rule-7 conformance assertions updated and passing (`node --import tsx --test src/db/adr.docs-test.ts` — 10/10 pass). |
| No absolute path passes the store boundary | PASS | `src/db/storage-key.ts`'s `assertRootRelativeStorageKey` (pre-existing, from #201, reused not reimplemented) is wired into `src/db/media-ref.ts`'s `insertAssetMedia`/`insertBrandAsset`, the only two write paths in this slice that accept a `storage_key`. Directly tested: `src/asset/db-store.test.ts:192` ("rejects an absolute storage key before writing any row") and `src/brand-asset/db-store.test.ts:43` (same), both asserting zero rows land. `brand.media_root` is deliberately NOT run through this guard — verified this is correct per ADR-0029 ("the media root is configuration"), a base/anchor value distinct from a per-item storage key, not a bypass of the rule. |
| Magnific fake / hermetic build | PASS | `git diff 3d55a9d..HEAD --name-only` touches zero files under `src/space-driver/` or `src/producer/`. Grepped every changed `src/` file for `spaces_`/`creations_`/`magnific` — the only hit is `magnific_creation_id`, a column name storing a foreign creation-id STRING as data (matches `asset_media.magnific_creation_id` in the frozen schema), not a live tool call. No `:memory:` anywhere in any new test file (`grep -rn ":memory:" src/` returns only `connection.ts`'s option-typing comment and `test-support.test.ts`'s own assertion that the temp DB is NOT `:memory:`). Every new/changed store test uses `withTempDb`, a real mkdtemp'd SQLite file (confirmed by reading `src/db/test-support.ts` directly). |
| `MIGRATION_1` byte-for-byte frozen | PASS | `diff <(git show 3d55a9d:src/db/schema.ts) <(cat src/db/schema.ts)` — **empty diff, exit 0**. `src/db/schema.ts` is untouched, not merely `MIGRATION_1`'s SQL string — the whole file is identical to `main`. Same check on `src/db/migrate.ts` — also empty diff. |

### Defect list

**None found.** No defect at any severity in this round.

Two items are recorded above as findings requiring Operator attention, not defects in this slice:
1. **Mention Handle has no `mention_handle` table** — a gap in #201/#202's own tickets (verified
   above), correctly flagged by the developer, not fixable inside #222's own scope without inventing an
   unrequested table.
2. **The Build Report's reasoning for the additive approach is per-store rather than leading with the
   simplest, most complete justification** (no SQL table anywhere has real data yet, because #204 hasn't
   run) — a communication improvement for the next round's handoff, not a code or test defect.

### What #223 (IdeaStore) needs to know before building on this foundation

- **The pattern to reuse is proven, not just present.** `withTransaction` has 6 passing tests including
  two independent "partial failure leaves nothing behind" proofs beyond its own generic one
  (`addAssetMediaBatch`, `upsertCopyVariants`). The TypeScript-overload additive-bridge pattern on
  `loadIdeaAssets`/`writeAsset` is the template for however `IdeaStore` chooses to coexist with (or
  replace) `ledger.ts`'s file-based Idea reads/writes.
- **`asset.idea_id REFERENCES idea(id)`** is a real, enforced FOREIGN KEY. Once `IdeaStore` can create a
  real `idea` row, `AssetStore`'s `{ db }` branch (built in this ticket) becomes immediately usable by a
  real Idea for the first time — no further schema or store-shape change needed on the Asset side.
- **No production caller has been switched to `{ db }` anywhere in this codebase yet.** #223 building
  `IdeaStore` does not, by itself, make it safe to rewire the 4 real `writeAsset` callers (plus
  `ledger.ts`, `report.ts`, `pick-cast.ts`) — that still needs #204's importer to have populated real
  Idea/Asset/Brand/Channel/Format data into SQL first, or those callers will read an empty database.
  Treat "wire up real callers" as a DISTINCT, later piece of work, not something #223 should assume it
  gets to do as a side effect of IdeaStore existing.
- **`DbAssetRecord` is intentionally narrower than `LedgerAssetRecord`** — no `cast`/`character` column.
  If `IdeaStore`'s own design needs to read/write Cast candidates via SQL, that gap is still open;
  `src/asset/store.ts`'s module doc comment names it explicitly.
- **`copy_variant` is keyed to a real `channel_id`, not a platform string** — any future Idea/Copy
  wiring that assumes a bare platform string (matching the OLD file-based `Copy.variants[]` shape) will
  need to resolve a Channel row first via `src/channel/store.ts`'s `getChannelByPlatform`.
