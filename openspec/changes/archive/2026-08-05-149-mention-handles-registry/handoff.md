# Slice Handoff — issue #149: Mention handles: one cross-platform registry replaces linkedin-handles.yaml

## Build Report (developer, Round 1)

### What changed and why

Issue #149's own "Solution" section is factually stale — it claims `data/mention-handles.yaml` "now
exists" and is "seeded with OpenAI / Anthropic / Google" handles. A 2026-08-05 triage comment on the
issue corrects this and is authoritative: as of this slice's start, that file did not exist anywhere,
and `data/linkedin-handles.yaml` (issue #126) had zero real entries — just its header comments, shipped
empty like every other Operator-maintained registry in this repo. This slice therefore built from an
**empty slate on both ends**: it does not migrate any real handle data (there was none to migrate) — it
creates the new registry empty and deletes the old, also-empty file.

The Operator wants ONE dedicated, cross-platform registry (LinkedIn, X, Instagram, TikTok, Facebook) —
not a LinkedIn-only file — since several platforms auto-link `@handle` text, not just LinkedIn. This
slice:

1. **Renamed `src/linkedin-handle/` -> `src/mention-handle/`** (see "Module rename decision" below) and
   generalized the pure module + I/O shell to be platform-keyed: `MentionHandleTable`/
   `MentionHandleEntry` now carry a `ReadonlyMap<MentionPlatform, string>` of handles per company, and
   `resolveHandle(table, name, platform)` / `resolveMentionHandle(name, platform, path)` take an
   explicit `MentionPlatform` argument (`"linkedin" | "x" | "instagram" | "tiktok" | "facebook"`).
2. **Added `data/mention-handles.yaml`** — the new registry, keyed `company -> { platform: handle }`,
   committed empty (Operator-populated over time, same never-fabricate contract as issue #126).
3. **Kept `resolveLinkedInHandle(name, path?)`** as a thin, friendly, LinkedIn-only alias over
   `resolveMentionHandle(name, "linkedin", path?)` — mirroring `/pick-cast`'s own friendly alias over the
   generic `/pick` command (ADR-0010). This is the EXACT function name `src/copy/linkedin-mentions.ts`
   already called before this slice, so that consumer's contract is genuinely unchanged, not just
   re-tested to look unchanged.
4. **Migrated the one existing consumer, `src/copy/linkedin-mentions.ts`**, to import from
   `../mention-handle/store.ts` and read `data/mention-handles.yaml` (via the alias above). Its exported
   behavior — resolve -> `@Name` text; unresolved -> plain name + `unresolvedMentions` review flag; zero
   companies short-circuits before any I/O — is byte-for-byte unchanged. Renamed its own path parameter
   `linkedInHandlesPath` -> `mentionHandlesPath` (positional-only everywhere it's called, so this is a
   pure rename with zero behavioral risk) since it no longer points at a LinkedIn-only file.
5. **Renamed `src/copy/compose.ts`'s `ComposeCopyOptions.linkedInHandlesPath` -> `mentionHandlesPath`**
   (same optional-override contract, same default-to-the-real-file behavior).
6. **Deleted `data/linkedin-handles.yaml`** once a repo-wide grep confirmed nothing reads it.
7. **Updated every doc-comment/prose reference** to the old module path (`src/copy/platform-shape.ts`,
   `src/copy/validate.ts`, `src/copy/write-social-copy-skill.docs-test.ts`,
   `.claude/skills/write-social-copy/SKILL.md`, `.claude/agents/producer.md`) — no behavior change, doc
   text only.
8. **Deliberately left `openspec/specs/copy-composition/spec.md` and
   `openspec/specs/linkedin-handle-lookup/spec.md` untouched** (they still name the old paths) — per this
   repo's established pipeline (confirmed against every prior archived change: `openspec/specs/*` is
   only updated by folding a change's spec deltas in AT ARCHIVE TIME, which happens after QA passes, not
   during the build). This slice's own spec deltas (below) are what will correct those references once
   archived.

Other platforms' handles (`x`/`instagram`/`tiktok`/`facebook`) are now resolvable through the same store
(`resolveMentionHandle(name, platform)`) — but composing an `@mention` for any of them into a Copy
variant is explicitly OUT OF SCOPE here, per the issue body ("whether each platform's variant actually
composes mentions is that variant's own rule").

### Module rename decision: `src/linkedin-handle/` -> `src/mention-handle/` (deliberate)

**Renamed the directory**, not just its contents. Reasoning:

1. The data file it reads is now `data/mention-handles.yaml` — a directory named `linkedin-handle`
   reading a file named `mention-handles.yaml` would be a permanent, growing mismatch for every future
   reader (worse than the one-time cost of the rename).
2. The type/function names already generalize (`MentionHandleTable`, `MentionPlatform`,
   `resolveMentionHandle`) — keeping them inside a directory called `linkedin-handle` would be its own
   internal inconsistency.
3. Mechanical risk was low: exactly ONE consumer exists (`src/copy/linkedin-mentions.ts`), and its
   contract is explicitly preserved via the `resolveLinkedInHandle` friendly alias — the rename touches
   import paths and doc cross-references only, never behavior. `git mv` preserved file history.

This is also why the OpenSpec capability itself was renamed (`linkedin-handle-lookup` ->
`mention-handle-lookup`, via a REMOVED-with-Reason-and-Migration delta on the old capability and an
ADDED delta on the new one — mirroring the `production-queue` capability's own precedent for a
superseded requirement set, see `openspec/changes/archive/2026-07-16-issue-56-recipe-aware-queue/`).

### Files touched

New:
- `src/mention-handle/lookup.ts` (+ `lookup.test.ts`) — pure, platform-keyed deep module.
- `src/mention-handle/store.ts` (+ `store.test.ts`) — I/O shell: `loadMentionHandleTable`,
  `resolveMentionHandle`, `resolveLinkedInHandle` (alias).
- `data/mention-handles.yaml` — the new, empty, Operator-maintained registry.
- `src/copy/fixtures/mention-handles.copy-tests.yaml` — replaces
  `src/copy/fixtures/linkedin-handles.copy-tests.yaml` (reshaped to the nested, platform-keyed format).
- `openspec/changes/149-mention-handles-registry/{proposal.md,tasks.md,handoff.md,specs/mention-handle-lookup/spec.md,specs/linkedin-handle-lookup/spec.md,specs/copy-composition/spec.md}`

Removed:
- `src/linkedin-handle/` (renamed away via `git mv`, not left behind) — `lookup.ts`, `lookup.test.ts`,
  `store.ts`, `store.test.ts`.
- `data/linkedin-handles.yaml`.
- `src/copy/fixtures/linkedin-handles.copy-tests.yaml` (renamed).

Modified (no behavior change beyond the data-source migration itself):
- `src/copy/linkedin-mentions.ts` (+ `linkedin-mentions.test.ts`) — import path + param rename
  (`linkedInHandlesPath` -> `mentionHandlesPath`); 4 temp-file test fixtures reshaped to the nested YAML
  format; every assertion about resulting caption/`unresolvedMentions` content is unchanged.
- `src/copy/compose.ts` (+ `compose.test.ts`) — `ComposeCopyOptions` field rename; fixture
  file/variable rename; 5 call sites updated.
- `src/copy/platform-shape.ts`, `src/copy/validate.ts` — doc-comment path updates only (2 spots each).
- `src/copy/write-social-copy-skill.docs-test.ts` — one regex assertion updated
  (`/linkedin-handle/` -> `/mention-handle/`) to match the SKILL.md prose update below.
- `.claude/skills/write-social-copy/SKILL.md`, `.claude/agents/producer.md` — prose path updates only.

`git status --short` confirms exactly this list (plus the untracked new `openspec/changes/
149-mention-handles-registry/` directory and `data/mention-handles.yaml`); no file under
`src/production-spec/**`, `src/asset/**`, `src/ledger/**`, `src/brand-asset/**`, or any Magnific/MCP
driver was touched.

### How to run

- Full suite: `npm test` (type-checks via `tsc --noEmit` first, then runs the Node test runner).
- Docs suite: `npm run test:docs`.
- Just this slice's new/changed unit tests:
  - `node --import tsx --test src/mention-handle/lookup.test.ts`
  - `node --import tsx --test src/mention-handle/store.test.ts`
  - `node --import tsx --test src/copy/linkedin-mentions.test.ts`
  - `node --import tsx --test src/copy/compose.test.ts`
- OpenSpec: `openspec validate 149-mention-handles-registry --strict` (also `openspec validate --all
  --strict` to confirm every OTHER spec/change is still valid — all 36 items pass).

Baseline captured before this slice's first edit: 1863/1863 unit tests, 179/179 docs tests. After this
slice: **1875/1875 unit tests** (+12 net new — see below), **179/179 docs tests** (unchanged count; this
slice edits existing Skill/agent prose, adds no new `.docs-test.ts` file), `openspec validate --all
--strict`: **36/36 items valid**.

### Acceptance-criteria self-assessment

1. **"All existing LinkedIn-mention tests pass against the new registry file."**
   `src/copy/linkedin-mentions.test.ts` (all describe blocks, especially the `weaveLinkedInMentions`
   block, lines ~211-265) and `src/copy/compose.test.ts`'s LinkedIn-mention scenarios (the 5 spots using
   `mentionHandlesPath: MENTION_HANDLES`) — every existing assertion about resolved-@Name /
   unresolved-plain-text / `unresolvedMentions` content is preserved unchanged; only the fixture YAML's
   own shape (flat -> nested platform-keyed) and the parameter/constant names changed. `npm test`: green.
2. **"Lookup is platform-keyed: `(company, platform) -> handle | none`; a missing platform key resolves
   to none, never a guess."**
   `src/mention-handle/lookup.test.ts`'s `resolveHandle — a missing platform key on an otherwise-known
   company resolves to null, never a guess (AC2)` describe block (asserts `resolveHandle(table,
   "Anthropic", "x"|"instagram"|"tiktok"|"facebook")` all return `null` for a company committed with
   ONLY a `linkedin` handle). Mirrored at the I/O layer by `src/mention-handle/store.test.ts`'s
   `resolveMentionHandle`'s `"returns null for a company that has no committed handle for the queried
   platform"` test and `resolveLinkedInHandle`'s `"returns null when a company is committed but has NO
   linkedin handle, even though it has other platforms"` test (proves the alias never falls back to a
   different platform's handle).
3. **"The old file (`data/linkedin-handles.yaml`) is gone and no code references it."**
   Confirmed by `git rm data/linkedin-handles.yaml` (file absent — `ls data/linkedin-handles.yaml`
   fails) and a repo-wide grep sweep (documented in tasks.md task 6.5) showing zero live-code references;
   also directly proven by `src/mention-handle/store.test.ts`'s `"loads the REAL committed
   data/mention-handles.yaml without throwing"` test resolving against the NEW path, and no test anywhere
   in the suite referencing the old path.
4. **"Docs/comments that point at `linkedin-handles.yaml` are updated."**
   `src/copy/platform-shape.ts`, `src/copy/validate.ts`, `.claude/skills/write-social-copy/SKILL.md`,
   `.claude/agents/producer.md` all updated (see "Files touched" above); proven mechanically by
   `src/copy/write-social-copy-skill.docs-test.ts`'s updated `/mention-handle/` regex assertion (which
   only passes because the SKILL.md prose was actually changed, not just described as changed).
   `openspec/specs/copy-composition/spec.md` and `openspec/specs/linkedin-handle-lookup/spec.md` are
   DELIBERATELY left as-is — see "Known limits" below; this slice's own MODIFIED/REMOVED spec deltas are
   what will correct them once archived, per this repo's established archive-time-only convention for
   `openspec/specs/*`. `openspec/changes/archive/**` (historical record) was never touched, as instructed.

### Fakes / fixtures used

- **Magnific fake: NOT exercised — explicitly confirmed not needed.** This slice has zero Space/MCP code
  (pure filesystem + string logic, mirroring issue #126's own scope exactly); no `spaces_*`/`creations_*`
  call appears anywhere in the diff. No live Space was touched, no credits spent, no board mutated.
- Temp-dir YAML fixtures (`node:fs/promises` `mkdtemp`/`writeFile`/`rm`) in `src/mention-handle/
  lookup.test.ts`'s companion `store.test.ts`, and `src/copy/linkedin-mentions.test.ts` — isolate every
  test from the real committed `data/mention-handles.yaml`.
- `src/copy/fixtures/mention-handles.copy-tests.yaml` — a committed, static fixture resolving exactly
  `OpenAI`/`Anthropic`'s `linkedin` handles, used by `compose.test.ts`'s LinkedIn-mention scenarios.
- One test in each of `lookup`/`store`/`linkedin-mentions`/`compose` suites also exercises the REAL
  committed `data/mention-handles.yaml` (empty) to prove the shipped file itself loads cleanly and that
  every function's default-path behavior never throws.

### Self-review notes

- Considered NOT keeping `resolveLinkedInHandle` as an alias (having `linkedin-mentions.ts` call
  `resolveMentionHandle(name, "linkedin", path)` directly instead) — rejected: the alias is genuinely
  load-bearing (the one real consumer, matching an established alias pattern elsewhere in this repo,
  `/pick-cast` over `/pick`), keeps `linkedin-mentions.ts`'s diff to an import path + a param rename
  (exactly matching "you're not changing that contract, only the data source"), and is directly tested
  (`store.test.ts`'s `resolveLinkedInHandle` describe block, 6 tests).
  Kept it.
- Considered leaving `ComposeCopyOptions.linkedInHandlesPath`'s NAME unchanged (only its default/doc
  changing) to minimize diff — rejected: the field no longer points at a LinkedIn-only file, so keeping
  its LinkedIn-specific name would be a standing inaccuracy for every future reader of `compose.ts`; the
  rename is a mechanical, purely-positional-callers change (confirmed zero named-property risk by
  grepping every call site before renaming).
- Removed nothing further — the two modules (`lookup.ts`/`store.ts`) already mirrored the
  `production-queue` pure/IO split precedent exactly; no dead code was introduced (the alias is exercised
  by tests, not vestigial).
- Confirmed via grep that no other module in `src/**` imports from `src/linkedin-handle/` before
  deleting it (task 1.4/6.5) — the migration is total, not partial.

### Known limits (explicitly out of scope, per the issue body and proposal.md's Non-Goals)

- **No `@mention` composition for X/Instagram/TikTok/Facebook.** Their handles are resolvable through
  `resolveMentionHandle(name, platform)` today, but no Copy variant weaves one in yet — that is each
  platform's own future slice.
- **No real handle data curated.** `data/mention-handles.yaml` ships empty, exactly as
  `data/linkedin-handles.yaml` did — the Operator populates it by hand over time.
- **`openspec/specs/copy-composition/spec.md` and `openspec/specs/linkedin-handle-lookup/spec.md` still
  name the old paths** until this change is archived (post-QA-pass, per this repo's pipeline — archiving
  is explicitly `/build-issue`'s job, not the developer agent's, per this session's own instructions).
  This slice's `specs/mention-handle-lookup/spec.md` (ADDED), `specs/linkedin-handle-lookup/spec.md`
  (REMOVED, with Reason + Migration per requirement), and `specs/copy-composition/spec.md` (MODIFIED, the
  three requirements naming the old path/field names, full text restated) are what will fold in and
  correct those references at archive time.
- **No per-Brand variant.** The global, brand-agnostic scope decision from issue #126 carries forward
  unchanged (reconfirmed in proposal.md, not reopened).

---

## QA Verdict — Round 1: PASS

### Suite result

- `npm test` (type-check via `tsc --noEmit` then the Node test runner): **1875/1875 pass, 0 fail** —
  actually run, green. Matches the Build Report's claimed count exactly.
- `npm run test:docs`: **179/179 pass, 0 fail** — actually run, green. Matches the claimed count.
- `openspec validate 149-mention-handles-registry --strict`: **valid**.
- `openspec validate --all --strict`: **36/36 items valid** (includes this change plus every existing
  spec — nothing else in the repo broke).
- Targeted re-run of the four changed/added suites directly (`src/mention-handle/lookup.test.ts`,
  `src/mention-handle/store.test.ts`, `src/copy/linkedin-mentions.test.ts`, `src/copy/compose.test.ts`)
  via `node --import tsx --test ...`: **104/104 pass, 0 fail**.

### Per-criterion results (issue #149 acceptance criteria)

1. **"All existing LinkedIn-mention tests pass against the new registry file."** — **PASS**.
   `src/copy/linkedin-mentions.test.ts` and `src/copy/compose.test.ts`'s LinkedIn-mention scenarios all
   pass; diffed both files directly — only fixture reshaping (flat `Name: handle` -> nested
   `Name:\n  linkedin: handle`) and identifier renames changed; every assertion on resulting
   caption/`unresolvedMentions` content is byte-identical to before the slice.
2. **"Lookup is platform-keyed: `(company, platform) -> handle | none`; a missing platform key resolves
   to none, never a guess."** — **PASS**.
   `src/mention-handle/lookup.ts`'s `resolveHandle` returns `entry.handles.get(platform) ?? null` — a
   `Map.get` miss on the specific queried platform, never a fallback to another platform. Proven by
   `lookup.test.ts`'s `"resolveHandle — a missing platform key on an otherwise-known company resolves to
   null, never a guess (AC2)"` (asserts null for `x`/`instagram`/`tiktok`/`facebook` on a company
   committed with only `linkedin`) and mirrored at the I/O layer by `store.test.ts`'s
   `"returns null for a company that has no committed handle for the queried platform (AC2 —
   platform-keyed)"` and `resolveLinkedInHandle`'s `"returns null when a company is committed but has NO
   linkedin handle, even though it has other platforms"`.
3. **"The old file is gone and no code references it."** — **PASS**.
   `data/linkedin-handles.yaml` confirmed deleted (`git status --short` shows `D  data/linkedin-handles.yaml`,
   file absent from the working tree). Repo-wide grep for `linkedin-handle\b` / `linkedin-handles.yaml` /
   `DEFAULT_LINKEDIN_HANDLES_PATH` / `linkedInHandlesPath` across `.ts`/`.md`/`.yaml` files (excluding
   `openspec/changes/archive/**`, which is historical record) turns up ZERO live-code hits. The only two
   remaining hits anywhere in "live" territory are (a) `openspec/specs/copy-composition/spec.md` and
   `openspec/specs/linkedin-handle-lookup/spec.md` — deliberately left for archive time, see below — and
   (b) two genuinely-historical "supersedes the old ... data/linkedin-handles.yaml" mentions in
   `data/mention-handles.yaml`'s own header comment and `src/mention-handle/store.ts`'s doc comment,
   which are prose explaining the migration, not references that resolve/read the old file.
4. **"Docs/comments that point at `linkedin-handles.yaml` are updated."** — **PASS, with the
   archive-time exception verified as the established pattern (see below).**
   `src/copy/platform-shape.ts`, `src/copy/validate.ts`, `.claude/skills/write-social-copy/SKILL.md`,
   `.claude/agents/producer.md` all diffed directly and confirmed updated to `src/mention-handle/` /
   `mention-handle` / `mentionHandlesPath`. `src/copy/write-social-copy-skill.docs-test.ts`'s regex
   assertion (`/mention-handle/`) only passes because the SKILL.md prose actually changed — this is a
   mechanical proof, not a claim. `openspec/specs/copy-composition/spec.md` and
   `openspec/specs/linkedin-handle-lookup/spec.md` still name the old paths, deliberately, per the
   developer's stated archive-time-only convention.

   **Verified this really is the established pattern, not an excuse.** CLAUDE.md's own pipeline
   description (step 5, "On pass") states explicitly: "The OpenSpec archive (folding spec deltas into
   `openspec/specs/`) rides inside this same PR" — i.e. after QA passes, as part of finalizing the PR,
   not during the developer's build slice. Cross-checked against git history for a real, recently merged
   slice: commit `52c5858` ("Issue #145: /export-schedule — run-scoped Zoho bulk export") is the SAME
   commit that both created `openspec/changes/archive/2026-08-04-issue-145-export-schedule/` AND
   created/updated `openspec/specs/schedule-batch-export/spec.md` — confirming spec-store updates land
   together with the archive step, at PR-finalization time, not mid-build. The developer's citation of
   the `production-queue` capability's own REMOVED-with-Reason-and-Migration precedent
   (`openspec/changes/archive/2026-07-16-issue-56-recipe-aware-queue/specs/production-queue/spec.md`) is
   also confirmed real. This is the genuine repo convention, not a shortcut.

### Per-scenario results (spec deltas)

**`mention-handle-lookup` (ADDED capability)** — every scenario traced to a passing test:
- "A company/product with a committed handle for the queried platform resolves to it" — PASS —
  `lookup.test.ts` `resolveHandle — a found (company, platform) pair resolves to its handle (AC2)`.
- "A company/product with no committed entry resolves to no handle — never fabricated" — PASS —
  `lookup.test.ts` `resolveHandle — an unresolved company returns null, never fabricated (AC2)`.
- "An empty registry resolves every pair to no handle" — PASS — `lookup.test.ts` `resolveHandle —
  against an empty table, every (company, platform) pair resolves to null (AC3)`; `store.test.ts`
  `loadMentionHandleTable`'s missing/zero-byte/comments-only-file tests.
- "A company with handles on some platforms but not others resolves each independently" — PASS —
  `lookup.test.ts` AC2 missing-platform-key describe block.
- "An unrecognized platform key in the committed file is dropped, never silently misfiled" — PASS —
  `lookup.test.ts` `"drops an unrecognized platform key, but keeps that company's other, valid platform
  handles"`.
- "The registry's parsing is defensive" (blank name/value/handle, zero-handle company dropped, duplicate
  normalized key) — PASS — `lookup.test.ts`'s `parseMentionHandleTable — a malformed entry is dropped...`
  describe block, all 6 sub-tests.
- "A file that fails to parse as YAML throws a path-naming error" — PASS — `store.test.ts` `"throws a
  path-naming error for a file that fails to parse as YAML, never a bare parser exception"`.
- "Company-name matching is case-insensitive and whitespace-trimmed; platform-key matching is
  case-insensitive" — PASS — `lookup.test.ts` `"resolves case-insensitively and whitespace-trimmed on the
  company name"`, `"matches a platform key case-insensitively and whitespace-trimmed"`.
- "A friendly, LinkedIn-only alias preserves the existing consumer's exact contract" (both scenarios) —
  PASS — `store.test.ts` `resolveLinkedInHandle` describe block, specifically `"resolves a company's
  linkedin handle specifically, even when other platforms are also committed"` and `"returns null when a
  company is committed but has NO linkedin handle, even though it has other platforms"`.

**`linkedin-handle-lookup` (REMOVED capability)** — each of the 3 removed requirements carries a Reason +
Migration pointing at the corresponding `mention-handle-lookup` requirement — checked, all 3 map
correctly (global lookup -> platform-keyed resolution; defensive parsing -> extended platform-keyed
defensive parsing; name matching -> name+platform-key matching). No orphaned requirement.

**`copy-composition` (MODIFIED capability)** — spot-checked the LinkedIn-mention-specific scenarios
against real tests (the rest of this large delta is a faithful restatement of pre-existing,
already-covered requirements from issues #128/#129/#130/#142, just renamed — confirmed no new behavior
was smuggled in):
- "Every Spec-recorded company that resolves is named as @Name on the LinkedIn variant" — PASS —
  `compose.test.ts` `"weaves @Name for every resolved company in the LinkedIn variant"` (line ~561).
- "An unresolved company falls back to plain text and is flagged" — PASS — `compose.test.ts` line ~584.
- "Zero companies produces the exact pre-#130 LinkedIn variant, byte for byte" — PASS — `compose.test.ts`
  line ~605.
- "weaveLinkedInMentions resolves, weaves, and reports unresolved names against the real registry file" —
  PASS — `linkedin-mentions.test.ts` `weaveLinkedInMentions` describe block.
- "weaveLinkedInMentions never touches disk for zero companies" — PASS — `linkedin-mentions.test.ts`
  `"defaults to DEFAULT_MENTION_HANDLES_PATH when no path is given and there are companies to resolve"`
  and the zero-companies short-circuit test.

### Always-rules + Magnific-fake checks

- **Generate-never-publish** — N/A, no publish-path code touched (confirmed: no file under
  `src/production-spec/**`, `src/asset/**`, or any publish/log-post command in the diff).
- **Public-metrics-only** — N/A, no metrics/Apify code touched.
- **Relative-not-absolute** — N/A, no baseline/scoring code touched.
- **Explicit-attribution** — N/A, no Post/attribution code touched (`src/ledger/**` untouched, confirmed
  by `git status --short`).
- **Ledger-as-source-of-truth** — N/A, no ledger-write code path touched.
- **Never-fabricate** — **PASS, directly exercised.** `data/mention-handles.yaml` read via `Read` tool:
  contains only header/documentation comments and an illustrative (commented-out) example — zero live
  YAML entries, confirmed by the file's own closing line "No entries yet — this repo ships the registry
  empty." `resolveHandle`'s implementation (`entry.handles.get(platform) ?? null`) and
  `parseMentionHandleTable`'s defensive-drop behavior both structurally guarantee no invented handle can
  ever be returned — proven by the AC2 test set above.
- **Magnific fake / no live-Space calls** — **PASS.** `grep -rn "spaces_\|creations_"` across
  `src/mention-handle/`, `src/copy/linkedin-mentions.ts`, `src/copy/compose.ts`,
  `data/mention-handles.yaml`, and the whole `openspec/changes/149-mention-handles-registry/` directory
  returns zero hits for either pattern inside actual code paths (the only 2 hits anywhere in the repo are
  in `tasks.md`/`handoff.md` prose describing that NO such call exists). This slice is pure filesystem +
  string logic; the Magnific fake is correctly not exercised because there is nothing to fake here.

### Additional verification performed

- Confirmed the module-rename decision (`src/linkedin-handle/` -> `src/mention-handle/`) is explained in
  `proposal.md`'s dedicated "Module rename" section, mechanically low-risk (exactly one consumer,
  `git mv` preserves history, `git status --short` confirms `RM` renames not delete+recreate), and does
  not exceed issue #149's scope — the issue's own title is "one cross-platform registry", and the
  directory rename is the honest consequence of that, not scope creep. `proposal.md`'s Non-Goals section
  explicitly rules out composing mentions for other platforms, curating real handle data, any live API
  call, and a per-Brand variant — all correctly deferred, matching the issue body's own scope line.
- Confirmed `git diff --stat` matches the Build Report's "Files touched" list exactly, and
  `git status --short` shows nothing outside that list touched (no stray files).
- Confirmed `ComposeCopyOptions.linkedInHandlesPath` -> `mentionHandlesPath` rename has zero surviving
  named-property call sites anywhere in `src/` (grep for `linkedInHandlesPath` returns 0 hits); every
  call site of `composeCopyForChannels`/`composeCopy` in `src/commands/` uses the default path (no
  passed-in option to break).
- Confirmed the two intentionally-untouched `openspec/specs/*` files and the two historical-mention hits
  in `data/mention-handles.yaml`/`src/mention-handle/store.ts` are the ONLY remaining `linkedin-handle`
  references in the entire repo outside `openspec/changes/archive/**`.

### Defect list

None. No defects found in this round.

**Overall: PASS.** Suite green (1875/1875 unit, 179/179 docs, 36/36 OpenSpec items), all 4 acceptance
criteria satisfied with a real proving test each, every spec-delta Scenario traces to a passing test, all
always-rules hold (5 N/A with reasons, never-fabricate directly and positively verified), no live-Space
call anywhere in the diff, and the `src/copy/linkedin-mentions.ts` behavior contract is confirmed
genuinely byte-for-byte unchanged by direct diff inspection (not just by the developer's claim).
