# Slice Handoff — issue-163-producer-zoho-mcp-scheduling

## Build Report (developer)

### What changed

ADR-0020 makes Zoho's MCP tools the primary way a Run's produced News Carousel Assets get scheduled,
replacing the CSV/S3 export as the default. Issues #160 (the MCP schedule PLAN — which Channels, when),
#161 (the ledger's `zoho_schedule_reference` field), and #162 (the confirmed-live auto-log) already
decided WHAT to schedule and how a later live report gets attributed. This slice builds the missing
middle: the orchestration that actually DOES the scheduling.

- **`ZohoSchedulePort`** (`src/schedule-batch/mcp-schedule-port.ts`) — the narrow, hermetic seam between
  this orchestration and Zoho's MCP tools (`uploadMediaFromUrl`, `validatePost`, `createSchedule`).
  `ZohoPostRequest` carries no `isApprovalNeeded` field — Zoho's Approval workflow is structurally
  unreachable through this shape. There is deliberately no live TS adapter for this port: Zoho's MCP
  tools are only reachable from inside the attended `producer` agent's own tool-calling loop, so the
  "real implementation" is the agent itself, calling the matching real `ZohoSocial_*` tool per
  `.claude/agents/producer.md`'s own documented sequence.
- **`FakeZohoSchedulePort`** (`src/schedule-batch/fixtures/fake-zoho-schedule-port.ts`) — the ONLY
  Zoho-MCP stand-in this whole diff's tests use.
- **`runMcpSchedule` / `combineZohoScheduleReferences` / `mcpUnavailableFallbackMessage`**
  (`src/schedule-batch/mcp-schedule.ts`) — the orchestration deep module. `runMcpSchedule` checks
  `input.approved === true` BEFORE touching the port at all (AC1); per Asset it uploads every hosted
  slide URL ONCE, then per Channel runs `validatePost` THEN, only on a pass, `createSchedule` (AC2) — a
  failing Channel is recorded and skipped without blocking its Asset's other Channels or a sibling
  Asset's Channels.
- **`scheduleViaZohoMcpCommand`** (`src/commands/schedule-via-zoho-mcp.ts`) — the attended orchestration
  shell: reuses the SAME eligibility rule and preflight validation the CSV path already uses, decides
  WHICH Channels/WHEN via the already-merged `buildMcpSchedulePlan`, hosts media via the injected
  `MediaHostPort` (unchanged infrastructure), drives `runMcpSchedule`, and records every
  successfully-scheduled Asset's `scheduled_at` + `zoho_schedule_reference` via `AssetStore.writeAsset`
  (status stays `"produced"`). `options.port === undefined` short-circuits to the explicit fallback
  message before anything else runs (AC4); an unapproved call refuses before anything else runs too
  (AC1, defense in depth).
- **`describeSkippedAssets`** extracted from `src/commands/export-schedule.ts` into
  `src/schedule-batch/eligibility.ts` (behavior-preserving DRY refactor) so both orchestration shells
  report a skipped Asset the same way.
- **`.claude/agents/producer.md`** — the "Schedule Batch offer" section now documents the MCP-primary
  sequence (real tool names, in the upload → validate → schedule order), explicitly forbids
  `ZohoSocial_updateSocialPostApprovalStatus`/`isApprovalNeeded` on any Channel, names the CSV/S3
  fallback offered explicitly when MCP is unavailable, and states X always stays CSV/manual. The agent's
  `tools:` frontmatter grants the 10 MCP tools the documented sequence calls and deliberately withholds
  `ZohoSocial_publishSocialPost`/`ZohoSocial_updateSocialPostApprovalStatus` (a structural guard, not
  just prose). A light, additive edit to the Hard-boundary bullet reflects the same.
- **`.claude/commands/export-schedule.md`** — now documents itself as the explicit CSV/S3 FALLBACK path.
- **`CONTEXT.md`**'s Schedule Batch glossary entry — rewritten (ADR-0020's own "Consequences") to
  describe both mechanisms.
- **`docs/zoho-mcp-server-setup.md`** (new) — the server-registration note: local scope only, never
  `project`/committed config; the new-tool re-login gotcha and the misleading `401 INVALID_OAUTHSCOPE`.

### Files touched

New:
- `src/schedule-batch/mcp-schedule-port.ts`
- `src/schedule-batch/mcp-schedule.ts`
- `src/schedule-batch/mcp-schedule.test.ts`
- `src/schedule-batch/mcp-schedule.docs-test.ts`
- `src/schedule-batch/fixtures/fake-zoho-schedule-port.ts`
- `src/schedule-batch/fixtures/fake-zoho-schedule-port.test.ts`
- `src/commands/schedule-via-zoho-mcp.ts`
- `src/commands/schedule-via-zoho-mcp.test.ts`
- `docs/zoho-mcp-server-setup.md`
- `openspec/changes/issue-163-producer-zoho-mcp-scheduling/` (this change: `proposal.md`, `tasks.md`,
  `specs/schedule-batch-approval-gate/spec.md`, `specs/schedule-batch-export/spec.md`,
  `specs/schedule-batch-mcp-scheduling/spec.md`, `handoff.md`)

Modified:
- `src/schedule-batch/eligibility.ts` (adds exported `describeSkippedAssets`)
- `src/commands/export-schedule.ts` (imports the extracted helper instead of its own private copy — no
  behavior change)
- `src/commands/export-schedule.test.ts` (one added assertion: an exported Asset never carries
  `zoho_schedule_reference`)
- `.claude/agents/producer.md`
- `.claude/commands/export-schedule.md`
- `CONTEXT.md`

Not touched (deliberately, see Known limits): `CLAUDE.md`, `.claude/commands/run-pipeline.md`,
`src/schedule-batch/mcp-plan.ts`, `src/schedule-batch/confirmed-live.ts`, `src/asset/**`,
`src/production-spec/**`, `src/media-host/**`, any live Brand's `ledger.json`.

### How to run

```
npm test               # type-check + full unit suite (1971 tests, includes this slice's new ones)
npm run test:docs      # docs-conformance suite (192 tests, includes this slice's new ones)
npm run build           # tsc -p tsconfig.build.json (dist emission — clean)
npx openspec validate issue-163-producer-zoho-mcp-scheduling --strict   # valid

# Single files:
node --import tsx --test src/schedule-batch/mcp-schedule.test.ts
node --import tsx --test src/commands/schedule-via-zoho-mcp.test.ts
node --import tsx --test src/schedule-batch/fixtures/fake-zoho-schedule-port.test.ts
node --import tsx --test src/schedule-batch/mcp-schedule.docs-test.ts
```

### Acceptance-criteria self-assessment

1. **No Zoho write-tool is called before the Operator's in-conversation approval.**
   - `src/schedule-batch/mcp-schedule.test.ts` → `runMcpSchedule — AC1` describe block: `approved: false`
     makes zero port calls.
   - `src/commands/schedule-via-zoho-mcp.test.ts` → `scheduleViaZohoMcpCommand — AC1` describe block:
     `approved: false` refuses immediately, zero port/Media-Host calls, ledger untouched.
   - `src/schedule-batch/mcp-schedule.docs-test.ts` → "producer.md states X always..." /
     `openspec/changes/.../specs/schedule-batch-approval-gate/spec.md`'s "no Zoho write-tool is ever
     called before this approval" scenario, proven against the shipped `producer.md` prose.

2. **The sequence is upload-from-hosted-URL, validate, then schedule; every scheduled Asset gets its
   receipt and `scheduled_at` recorded.**
   - `mcp-schedule.test.ts` → "AC2: upload, then validate, then schedule, in that exact order": asserts
     the exact call-kind sequence (`upload, upload, validate, schedule, validate, schedule`), that every
     validate/schedule request carries the uploaded `mediaIds`, and that a failing validate is never
     followed by a schedule call for that Channel.
   - `mcp-schedule.test.ts` → "combined receipts and scheduledAt": a fully-scheduled Asset's outcome
     carries every platform, its combined reference, and `scheduledAt`.
   - `schedule-via-zoho-mcp.test.ts` → "happy path" test: re-reads the ledger and asserts a well-formed
     `scheduled_at` and a populated `zoho_schedule_reference`, status still `"produced"`.

3. **Zoho's Approval workflow is never used, on any Channel.**
   - `mcp-schedule.test.ts` → "AC3: Zoho's Approval workflow is never used": every recorded request's
     own keys are exactly `target`/`mediaIds`/`content`/`scheduledAtLocal` (no `isApprovalNeeded`), and
     no serialized request matches `/approval/i`.
   - `mcp-schedule.docs-test.ts` → "producer.md states Zoho's Approval workflow is never used": pins the
     explicit prohibition text AND that the agent's own `tools:` frontmatter withholds
     `ZohoSocial_publishSocialPost`/`ZohoSocial_updateSocialPostApprovalStatus` (a structural guard, not
     just a runtime check — the shape `ZohoPostRequest` also has no such field at all, a compile-time
     guarantee).

4. **MCP unavailable → the CSV fallback is offered explicitly and every remaining step is the Operator's
   own, by hand; X is CSV/manual always.**
   - `mcp-schedule.test.ts` → `mcpUnavailableFallbackMessage` describe block.
   - `schedule-via-zoho-mcp.test.ts` → "AC4" describe block: no `port` injected returns the fallback
     message before any ledger read or Media Host call, even with `approved: true`.
   - `mcp-schedule.test.ts`/`schedule-via-zoho-mcp.test.ts` → X is defensively excluded even if a group
     somehow still carried it (never reaches the port).
   - `mcp-schedule.docs-test.ts` → pins producer.md's explicit "X always stays CSV/manual" and
     "MCP unavailable → offer... explicitly... never a silent switch" statements.

5. **Producer instructions and both schedule-batch capabilities describe MCP-primary / CSV-fallback; the
   docs-conformance tests stay green.**
   - `npm run test:docs` — 192/192 green, including EVERY pre-existing assertion in
     `src/schedule-batch/approval-gate.docs-test.ts` (issue #148), unmodified, against the rewritten
     `producer.md`/`export-schedule.md`/`CONTEXT.md` prose, PLUS the 13 new assertions in
     `src/schedule-batch/mcp-schedule.docs-test.ts`.
   - OpenSpec: `schedule-batch-approval-gate`'s MODIFIED requirement + new "Zoho's own Approval workflow
     is never used" requirement; `schedule-batch-export`'s ADDED "this capability is the fallback" +
     zero-`zoho_schedule_reference` requirement (backed by the new assertion in
     `export-schedule.test.ts`); the new `schedule-batch-mcp-scheduling` capability.

6. **The server-registration note exists (local scope; new-scope re-login gotcha).**
   - `docs/zoho-mcp-server-setup.md` exists.
   - `mcp-schedule.docs-test.ts` → "docs/zoho-mcp-server-setup.md" describe block: local-scope-only,
     never-commit, the session-restart + fresh-login gotcha, and the misleading `401 INVALID_OAUTHSCOPE`
     failure mode, all pinned.

7. **Demoable: one real Asset scheduled into Zoho Social in an attended Operator session.**
   - **Deferred to the attended demo — not verified by this build.** The build pipeline is hermetic (no
     Zoho/Magnific MCP tools available to the `developer` agent; no live calls made anywhere in this
     diff). This slice leaves everything wired so the content `producer` agent — an attended Claude
     agent, granted the 10 real `ZohoSocial_*` tools in its `tools:` frontmatter, following the
     documented sequence in `.claude/agents/producer.md` — can perform that demo, attended, in the
     Operator's own session, after merge. Recorded here explicitly per the build brief's scope note.

### Fakes / fixtures used

- **`FakeZohoSchedulePort`** (`src/schedule-batch/fixtures/fake-zoho-schedule-port.ts`) — **THIS IS THE
  ZOHO MCP FAKE.** Entirely in-memory, deterministic; records every call, in order; every test in this
  diff that exercises the scheduling path injects this fake. **No live Zoho MCP call, no network, no
  credits, anywhere in this diff** — `grep -rn "ZohoSocial_" src` finds matches only in
  `mcp-schedule-port.ts`'s own doc comments (naming the real tools this hermetic seam mirrors) and
  `mcp-schedule.docs-test.ts`'s regex assertions (which read `producer.md`'s PROSE as a text file via
  `readFile`, asserting the documented instructions name the right tools — never calling any tool).
- **`FakeMediaHost`** (`src/media-host/fixtures/fake-media-host.ts`, pre-existing, issue #144) — reused
  unmodified for the S3-hosting leg, exactly as the CSV export's own tests already use it.
- Plain in-memory ledger/brand-profile fixtures (temp directories via `mkdtemp`), mirroring
  `src/commands/export-schedule.test.ts`'s own fixture style.

### Self-review notes

- Extracted `describeSkippedAssets` (previously a private copy inside `export-schedule.ts`) into
  `eligibility.ts` so both orchestration shells share one reporting helper — a small, behavior-preserving
  DRY pass; `export-schedule.test.ts` stays green, unmodified, proving no regression.
- Chose to run the SAME `validateAssetsForExport` preflight the CSV path runs before any Zoho call
  (defense in depth) rather than inventing a second, parallel validation — avoids wasted Zoho calls on
  data that was never going to be schedulable anyway, and reuses already-tested logic.
- Deliberately did NOT build a live TS `ZohoSchedulePort` adapter (unlike the Media Host's
  `LiveMediaHost`) — Zoho's MCP tools are only reachable from inside the attended agent's own
  tool-calling loop, so a Node-callable adapter isn't a meaningful thing to build; the "real
  implementation" is `producer.md`'s own documented procedure, exactly mirroring how the Space driver's
  Fallback Protocol already works. This was a deliberate architecture read confirmed against
  `src/space-driver/port.ts`'s own doc comment before writing any code.
- Verified, before touching `producer.md`, that every regex in the pre-existing
  `src/schedule-batch/approval-gate.docs-test.ts` could be satisfied by an honestly-reworded doc (rather
  than loosening or deleting any assertion) — it was, and that file was left completely unmodified.
- One line in `.claude/commands/export-schedule.md` was reflowed (no wording removed) after a wrap point
  happened to fall between two words a pre-existing regex needed adjacent on one line
  (`/runs it\s+only after the Operator approves/`); confirmed via `npm run test:docs`.
- Kept `CONTEXT.md`'s Schedule Batch entry within the pre-existing 600/1200-char scan windows the
  issue-148 docs-test uses, trimming several drafts down to fit rather than widening the test's window
  (never loosen a guard).

### Known limits

- **`CLAUDE.md` and `.claude/commands/run-pipeline.md` are unchanged** — their Schedule Batch
  approval/Gate 3 prose still describes only the CSV-upload shape, not the new MCP-primary path. The
  issue's own "Docs and specs ride in this slice" list named `producer.md` + the two `schedule-batch-*`
  capabilities + the server-setup note; these two top-level pipeline docs were deliberately left out of
  scope to keep the diff bounded. A future slice (or a follow-up doc pass) should reconcile them with
  `producer.md`'s now-more-detailed MCP-primary description.
- **No live Zoho MCP adapter or CLI entry point exists for `scheduleViaZohoMcpCommand`** (by design — see
  Self-review notes above); it has no `npm run schedule-via-zoho-mcp` script, unlike `export-schedule`'s
  `main()`. The attended `producer` agent is the intended, and only, caller.
- **The `resolveChannels`/portal→brand→channel lookup is not modeled as a typed port method.** ADR-0020's
  "resolve the Zoho portal → Zoho Social Brand → Channels" step is documented procedurally in
  `producer.md` (naming `ZohoSocial_getSocialPortals`/`getSocialBrands`/`getSocialChannels`) rather than
  as a fourth `ZohoSchedulePort` method — there is no deterministic mapping rule to test hermetically (it
  is inherently a live lookup), so `ZohoPostRequest.target` carries the already-configured
  `zohoBrandName`/`platform`/`label` and the live agent is expected to resolve the actual channel id
  itself before calling `validatePost`/`createSchedule`, exactly as it already resolves node ids for the
  Space driver's Fallback Protocol.
- **The one-time Straw Motion 2026-W32 heuristic-matching closeout** (ADR-0020's own separate, one-time
  exception for posts that already went out via the old CSV path) is not part of this slice.
- **AC7 (the live demo) is deferred**, as noted above — this is expected per the build brief's own scope
  note for this criterion, not an oversight.

## QA Verdict — Round 1: PASS

### Suite result

All commands actually executed by QA (not taken on faith), from
`/Users/CaxtonTaylor/Developer/OrganicGrowth/.claude/worktrees/build-issues-160-163`, branch
`issue-163-producer-zoho-mcp-scheduling`:

| Command | Result |
|---|---|
| `npm test` (`tsc --noEmit` + `node --import tsx --test "src/**/*.test.ts"`) | **1971 tests, 1971 pass, 0 fail, 0 skipped, 0 todo** |
| `npm run test:docs` (`node --import tsx --test "src/**/*.docs-test.ts"`) | **192 tests, 192 pass, 0 fail** |
| `npm run build` (`tsc -p tsconfig.build.json`) | clean, no errors |
| `npx openspec validate issue-163-producer-zoho-mcp-scheduling --strict` | `Change 'issue-163-producer-zoho-mcp-scheduling' is valid` |
| `npx openspec validate --all --strict` | `Totals: 38 passed, 0 failed (38 items)` |

Matches the Build Report's claimed counts exactly (1971 / 192) and the stated baseline before this slice
(1944 npm-test / 179 docs-test): delta is +27 npm-test / +13 docs-test. Cross-checked against the actual
new `it(...)` blocks added: `fake-zoho-schedule-port.test.ts` (4) + `mcp-schedule.test.ts` (15) +
`schedule-via-zoho-mcp.test.ts` (8) = 27 unit tests; `mcp-schedule.docs-test.ts` (13) docs tests. Both
reconcile exactly — the green counts are real, not asserted.

### Per-criterion results

1. **No Zoho write-tool before approval — PASS.** `runMcpSchedule` (`src/schedule-batch/mcp-schedule.ts`)
   checks `input.approved === true` as its first statement, before any `input.port` reference exists in
   scope; `approved: false` returns `{ ok: false, reason: "not-approved" }` making the port's `calls`
   array empty (asserted by `mcp-schedule.test.ts` "AC1" block). `scheduleViaZohoMcpCommand`
   (`src/commands/schedule-via-zoho-mcp.ts`) independently refuses on `!options.approved` before any
   ledger read, Zoho config load, or Media Host call — proven by `schedule-via-zoho-mcp.test.ts` "AC1"
   block (`port.calls.length === 0`, `mediaHost.convertCalls.length === 0`, ledger's `scheduled_at`
   unchanged). Structural, not prose-only, as required.

2. **Upload → validate → schedule order, receipt + `scheduled_at` recorded — PASS.**
   `mcp-schedule.test.ts` "AC2" asserts the exact call-kind sequence
   (`upload, upload, validate, schedule, validate, schedule`), that every validate/schedule request
   carries the uploaded `mediaIds`, and that a failing validate is never followed by a schedule call for
   that Channel. `scheduleViaZohoMcpCommand` hosts media (S3) BEFORE calling `runMcpSchedule` (which does
   upload→validate→schedule against Zoho) — read directly in the source, steps 5 then 6. The receipt +
   `scheduled_at` are written via `AssetStore.writeAsset` (`upsertAsset`-based merge, confirmed by
   reading `src/asset/store.ts`), the SAME typed store #161 introduced — verified by
   `schedule-via-zoho-mcp.test.ts` "happy path" re-reading the ledger for a well-formed ISO `scheduled_at`
   and a populated `zoho_schedule_reference`, `status` unchanged (`"produced"`).

3. **Zoho's Approval workflow never used — PASS.** `ZohoPostRequest` (`mcp-schedule-port.ts`) has no
   `isApprovalNeeded` field at all (compile-time exclusion, confirmed by reading the interface).
   `mcp-schedule.test.ts` "AC3" asserts every recorded request's own keys are exactly
   `target`/`mediaIds`/`content`/`scheduledAtLocal` and that no serialized request matches `/approval/i`.
   `grep -rln "isApprovalNeeded"` across the repo shows it appears ONLY in prohibition-prose (producer.md,
   the setup doc, spec/proposal/handoff prose, and doc-comments in `mcp-schedule.ts`/`mcp-schedule-port.ts`
   explaining the exclusion) and in test/docs-test assertions checking for its absence — never in a
   request-building code path. `producer.md`'s `tools:` frontmatter grants
   `ZohoSocial_createSocialSchedule`/`ZohoSocial_validateSocialPost` etc. but withholds
   `ZohoSocial_publishSocialPost` and `ZohoSocial_updateSocialPostApprovalStatus` (read directly in the
   diff) — a structural tool-grant guard, not just prose, matching the docs-test's frontmatter-slice
   assertion.

4. **MCP-unavailable fallback explicit; X always CSV/manual — PASS.** `mcpUnavailableFallbackMessage`
   names the real `/export-schedule` command and states the whole remaining step is manual, no silent
   switch (asserted by `mcp-schedule.test.ts`). `scheduleViaZohoMcpCommand` returns this exact message
   and does NOTHING else — no ledger read, no Media Host call — when `options.port === undefined`, even
   with `approved: true` (`schedule-via-zoho-mcp.test.ts` "AC4"). X exclusion is NOT re-decided here: `x`
   is filtered by `X_PLATFORM` imported from `src/schedule-batch/plan.ts` (the SAME constant #160's
   `mcp-plan.ts` already uses to exclude X from `McpTargetGroup.channels`) — `mcp-schedule.ts` only
   re-applies it defensively (`targetChannels` filters `c.platform !== X_PLATFORM`), consuming #160's
   decision rather than re-deciding it, exactly as instructed.

5. **Docs describe MCP-primary/CSV-fallback; docs-conformance green — PASS.** Read `producer.md`'s full
   diff: the "Schedule Batch offer" section now documents the real MCP tool names in the correct order,
   the Approval-workflow prohibition, the X-always-CSV rule, and the MCP-unavailable fallback, matching
   every regex in the new `mcp-schedule.docs-test.ts` (13/13 pass) verbatim. Read
   `export-schedule.md`'s diff: states itself as "the CSV/S3 FALLBACK path (ADR-0020)" and names Zoho MCP
   as PRIMARY. `npm run test:docs` is 192/192 green, including the PRE-EXISTING, UNMODIFIED
   `src/schedule-batch/approval-gate.docs-test.ts` (confirmed via `git diff` — that file has zero changes
   in this diff) — proving the rewritten docs still satisfy every issue-#148-era assertion, not just the
   new ones.

6. **Server-registration note — PASS.** `docs/zoho-mcp-server-setup.md` (read in full) contains
   `--scope local` registration, an explicit "Never use `--scope project`... never commit" warning, the
   session-restart + fresh `claude mcp login` two-step gotcha, and the exact misleading
   `401 INVALID_OAUTHSCOPE` failure-mode text — all pinned and asserted by
   `mcp-schedule.docs-test.ts`'s "docs/zoho-mcp-server-setup.md" block (3/3 pass).

7. **Demoable (deferred per scope ruling) — PASS.** The handoff's self-assessment #7 and Known Limits both
   explicitly and honestly record the deferral: "Deferred to the attended demo — not verified by this
   build," citing the hermetic build pipeline (no live Zoho/Magnific MCP tools available to the developer
   agent). No demo was faked, simulated as real, or claimed complete. This matches the QA task's explicit
   scope ruling for AC7 exactly — recorded honestly, not concealed. No live Zoho or Magnific call was made
   by QA either, in verifying this criterion or any other.

### Per-scenario results (spec deltas)

**`schedule-batch-approval-gate` (MODIFIED)**

| Scenario | Result | Covering test/evidence |
|---|---|---|
| producer.md documents offering Schedule Batch only once eligible Assets are produced | PASS | pre-existing `approval-gate.docs-test.ts`, unmodified, still green against rewritten prose |
| producer.md documents waiting for full approval before proceeding | PASS | same, unmodified, still green |
| producer.md documents the MCP-primary sequence, real tool names, in order (AC1/AC2) | PASS | `mcp-schedule.docs-test.ts` "names the real MCP tools..." |
| producer.md states no Zoho write-tool ever called before approval (AC1) | PASS | `mcp-schedule.docs-test.ts` prohibition assertions |
| producer.md names the real CSV/S3 fallback code, offered explicitly; X always CSV/manual (AC4) | PASS | `mcp-schedule.docs-test.ts` fallback-message block |
| producer.md explicitly forbids the Approval-workflow tool and `isApprovalNeeded` | PASS | `mcp-schedule.docs-test.ts` "states Zoho's Approval workflow is never used" |
| producer.md's tools frontmatter withholds publish/Approval tools | PASS | `mcp-schedule.docs-test.ts` frontmatter-slice assertion; verified directly by reading the diff |
| producer.md states the approval writes nothing to the ledger | PASS | pre-existing docs-test, unmodified, still green |
| CLAUDE.md states the Schedule Batch approval is not a formal gate, writes nothing to ledger | PASS | CLAUDE.md unchanged in this slice; pre-existing text already satisfies this (verified by reading the CLAUDE.md excerpt in this session's system context — Gate 3 / Schedule Batch section already states this) |
| No new `AssetStatus` introduced — real code cross-check | PASS | `src/asset/asset.ts`'s `isAssetStatus`/`AssetStatus` untouched by this diff (not in files-touched list); pre-existing test unaffected |
| CLAUDE.md's Gate 3 distinguishes Zoho-upload path from direct publish, citing ADR-0002 | PASS | CLAUDE.md unchanged; pre-existing "Hosting media and writing files is not publishing (ADR-0002)" text (visible in this session's system context) already satisfies it |
| run-pipeline.md documents identical ordering | PASS | `.claude/commands/run-pipeline.md` unchanged in this diff (confirmed not in files-touched list); pre-existing text carries forward |
| producer.md states Publish still follows, still human, for fallback/X; Zoho auto-publishes for MCP path | PASS | `mcp-schedule.docs-test.ts` + direct read of the rewritten "Schedule Batch offer" section, item 7 |
| export-schedule.md documents itself as producer-offered behind the same approval | PASS | pre-existing docs-test, unmodified, still green |

**`schedule-batch-export` (ADDED requirement — fallback framing)**

| Scenario | Result | Covering test |
|---|---|---|
| export-schedule.md states Zoho MCP is primary, this command is fallback | PASS | `mcp-schedule.docs-test.ts` "export-schedule.md documents itself as the CSV/S3 fallback path" |
| An Asset exported via `exportScheduleCommand` never carries `zoho_schedule_reference` | PASS | `export-schedule.test.ts`'s new assertion (`assert.equal(assets![0]!.zoho_schedule_reference, undefined)`), directly read and confirmed present in the diff; suite green |

**`schedule-batch-mcp-scheduling` (ADDED capability)**

| Scenario | Result | Covering test |
|---|---|---|
| `runMcpSchedule` with `approved: false` makes zero port calls | PASS | `mcp-schedule.test.ts` "AC1" |
| `scheduleViaZohoMcpCommand` with `approved: false` refuses before any I/O | PASS | `schedule-via-zoho-mcp.test.ts` "AC1" |
| every slide uploaded once per Asset, before any validate/schedule call | PASS | `mcp-schedule.test.ts` "AC2" first test |
| a failing validate never followed by schedule for that Channel | PASS | `mcp-schedule.test.ts` "AC2" third test |
| one Asset's failed Channel doesn't block its other Channels or a sibling Asset | PASS | `mcp-schedule.test.ts` "AC2" fourth test |
| a Channel with no Copy variant recorded as failure, never crashes | PASS | `mcp-schedule.test.ts` "combined receipts" third test |
| an Asset with no MCP-eligible Channels silently skipped | PASS | `mcp-schedule.test.ts` "combined receipts" second test |
| a fully-scheduled Asset's outcome carries combined reference + every platform | PASS | `mcp-schedule.test.ts` "combined receipts" first test |
| `combineZohoScheduleReferences` — bare string / flatten multiple / flatten array-shaped | PASS | 3 dedicated tests, all read and confirmed |
| no request ever carries an approval-related field | PASS | `mcp-schedule.test.ts` "AC3" |
| `scheduleViaZohoMcpCommand` reuses the same eligibility/plan/preflight as CSV path | PASS | `schedule-via-zoho-mcp.test.ts` — empty-run, no-Zoho-config, preflight-problem, lead-window, already-scheduled tests, all present and green |
| a happy-path run schedules non-X Channels, hosts once, stamps ledger | PASS | `schedule-via-zoho-mcp.test.ts` "happy path" |
| MCP unavailable offers explicit fallback, never a silent switch | PASS | `mcp-schedule.test.ts` + `schedule-via-zoho-mcp.test.ts` "AC4" blocks |

### Always-rules + Magnific-fake checks

| Rule | Result | Evidence |
|---|---|---|
| **Generate-never-publish** | PASS | `grep -rln "publishSocialPost"` across `.ts`/`.md` shows matches ONLY in prohibition prose (`producer.md`, `docs/zoho-mcp-server-setup.md`, OpenSpec change docs) and the docs-test assertion checking its absence from the frontmatter — `ZohoSocial_publishSocialPost` is never called or referenced in any executable code path (`mcp-schedule-port.ts`, `mcp-schedule.ts`, `schedule-via-zoho-mcp.ts`, the fake). Scheduling (via receipt, after human approval) is the only write the code performs; the actual "publish" moment is Zoho's own scheduled-time auto-publish, or the Operator's manual CSV path — never triggered by this code. |
| **Public-metrics-only** | PASS | Zero files under `src/performance/**` or `src/commands/track-performance.ts` touched by this diff (confirmed via `git status`/files-touched list); ADR-0020 explicitly keeps performance tracking on Apify — untouched here. |
| **Relative-not-absolute** | N/A for this slice | No scoring/comparison logic is introduced; correctly out of scope. |
| **Explicit-attribution** | PASS | Every write is scoped to a specific `(ideaId, recipe)` pair via `AssetStore.writeAsset(outcome.ideaId, outcome.recipe, ...)` — read directly in `schedule-via-zoho-mcp.ts`. The receipt (`zoho_schedule_reference`) is Zoho's own returned value, stored verbatim, keyed to the exact Asset that produced it — never inferred, mirroring #161/#162's own pattern. |
| **Ledger-as-source-of-truth** | PASS | `writeAsset` (`src/asset/store.ts`) is a merge-based (`upsertAsset`) write to the Brand's `ledger.json` at `options.ledgerPath` — confirmed by reading the store implementation; both `scheduled_at` and `zoho_schedule_reference` are written there, and only there, on every successful schedule. |
| **Magnific/Zoho fake-only, hermetic build** | PASS | `grep -rn "spaces_\|creations_"` across `src/schedule-batch/` and `src/commands/schedule-via-zoho-mcp.ts` returns **zero matches**. `grep -n "ZohoSocial_"` in the new `mcp-schedule-port.ts`/`mcp-schedule.ts` returns matches ONLY inside doc comments (naming the real tools the seam mirrors) — never a call site. `FakeZohoSchedulePort` (in-memory, deterministic, `src/schedule-batch/fixtures/fake-zoho-schedule-port.ts`) is the only implementation of `ZohoSchedulePort` anywhere in this diff; there is deliberately no live TS adapter (by design, documented in both the port's own doc comment and the handoff). No `fetch`/`http`/network call exists in any of the four new orchestration files (checked directly). |

### Scope check

`git diff origin/main --stat` (tracked-file changes) plus `git add -A -n .` (dry-run add, to surface
untracked new files) together show EXACTLY the files the Build Report's "Files touched" section claims —
`.claude/agents/producer.md`, `.claude/commands/export-schedule.md`, `CONTEXT.md`,
`src/commands/export-schedule.{ts,test.ts}`, `src/schedule-batch/eligibility.ts`, plus the 9 new files
under `src/schedule-batch/`, `src/commands/`, and `docs/`, plus the OpenSpec change directory. **Zero**
changes under `data/` on this branch relative to `origin/main`; **zero** changes to `CLAUDE.md`,
`.claude/commands/run-pipeline.md`, `src/asset/**`, `src/production-spec/**`, `src/media-host/**`,
`src/schedule-batch/mcp-plan.ts`, or `src/schedule-batch/confirmed-live.ts` — matching the Build Report's
own "Not touched" list exactly.

### OpenSpec-matches-issue check

Read `proposal.md` and all three spec deltas in full against the issue body. The `schedule-batch-approval-
gate` MODIFIED requirement restates its FULL pre-existing text (verified against the currently-archived
`openspec/specs/schedule-batch-approval-gate/spec.md`) — the CLAUDE.md/run-pipeline.md scenarios that
this slice does NOT touch are carried forward verbatim from the pre-existing spec (issue #148), not
invented fresh against docs this slice left alone; this is the correct OpenSpec pattern (a MODIFIED
requirement restates the complete requirement, changed or not) and is NOT a case of the spec claiming
something the code doesn't do. The `schedule-batch-export` ADDED requirement text actually says "never
the primary mechanism it was before this slice" and is backed by a real, run assertion
(`zoho_schedule_reference` is `undefined` after a CSV export) — not merely asserted in prose. The new
`schedule-batch-mcp-scheduling` capability's requirements map 1:1 onto the issue's own five ADR-0020
bullets (sequence order, no-Approval-workflow, X-exclusion, fallback behavior, receipt recording). No
misread found: the spec does not add scope the issue didn't ask for (no live TS adapter was built, matching
the issue's own silence on that point and the developer's documented architecture-read against the
Space-driver precedent), and does not drop a required criterion.

### Defect list

None found. No defects, of any severity.

## Round-2 Build (developer) — post-pass archive-header fix

QA's round-1 PASS stands (zero defects); this round is a narrow, conductor-flagged fix to the OpenSpec
delta itself, surfaced by `npx openspec archive issue-163-producer-zoho-mcp-scheduling --yes` aborting
("no files changed") because two `### Requirement:` headers in
`specs/schedule-batch-approval-gate/spec.md` didn't byte-match the existing headers in
`openspec/specs/schedule-batch-approval-gate/spec.md` under `## MODIFIED Requirements` — OpenSpec's
archive step matches a MODIFIED requirement by its header text, so a renamed header reads as an unmatched
(phantom) modification rather than an update to the existing requirement.

**What changed (no product code, no prose, no tests touched):**

- Reverted the two MODIFIED requirement headers to be byte-identical to the existing spec (option (a) —
  the requirement BODY text below each header still carries the MCP-primary/auto-publish content; only
  the header LINE changed):
  - `"The producer offers Schedule Batch scheduling only after full in-conversation approval, never
    unprompted — MCP-primary, CSV/S3 fallback (ADR-0020)"` → `"The producer offers the Schedule Batch
    export only after full in-conversation approval, never unprompted"` (matches
    `openspec/specs/schedule-batch-approval-gate/spec.md` line 6).
  - `"The Publish gate still follows the approval, as a second, distinct human step (ADR-0002) — except
    for an MCP-scheduled Asset, where Zoho itself auto-publishes"` → `"The Publish gate still follows the
    approval, as a second, distinct human step (ADR-0002)"` (matches spec line 72).
- Moved the "Zoho's own Approval workflow is never used, on any Channel (ADR-0020)" requirement (which
  has no counterpart in the existing spec — correctly ADDED, not MODIFIED) out from under
  `## MODIFIED Requirements` into its own `## ADDED Requirements` section at the end of the same file —
  it was previously mis-nested under the MODIFIED header, which the conductor also asked me to verify.
  Its own header text, scenarios, and requirement body are unchanged.
- Verified, by direct line comparison against `openspec/specs/schedule-batch-approval-gate/spec.md`, that
  all three MODIFIED headers are now byte-identical, and confirmed neither
  `specs/schedule-batch-export/spec.md` (its one requirement's title has no existing counterpart —
  correctly `## ADDED Requirements`) nor `specs/schedule-batch-mcp-scheduling/spec.md` (a wholly new
  capability, `## ADDED Requirements` throughout) has the same trap.

**Re-verification:**
- `npx openspec validate issue-163-producer-zoho-mcp-scheduling --strict` → `Change
  'issue-163-producer-zoho-mcp-scheduling' is valid`.
- `npm run test:docs` → 192/192 green (unaffected — no prose was touched, only OpenSpec delta headers).
- `npm test` → 1971/1971 green (unaffected — no product/test code was touched).
- Did NOT run `openspec archive` myself, per the conductor's explicit instruction — that step is the
  conductor's to run next.
