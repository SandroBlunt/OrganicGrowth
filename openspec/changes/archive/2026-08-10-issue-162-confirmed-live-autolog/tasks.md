## 1. Ground the decision + map today's shape

- [x] 1.1 Verify pre-flight: issue #162 is labeled `ready-for-agent`; its one blocker, #161, is merged
  onto this branch (`gh issue view 161 --json state,stateReason` -> `CLOSED`/`COMPLETED`; confirmed via
  `git log` showing "Issue #161: the ledger records Zoho's schedule-time reference on the Asset (#166)"
  on this branch).
- [x] 1.2 Read ADR-0020 (read-only, external path, not on this branch — referenced by number/title only,
  never copied in): "Attribution logs automatically for the MCP path, but only once a post is confirmed
  live — checked later by the exact reference Zoho returned at schedule-time, never guessed from timing."
- [x] 1.3 Read `src/commands/log-post.ts` end to end — the exact write `/log-post` performs
  (`AssetStore.writeAsset` + `refreshPostJson`), its `nextAssetStatus` never-regress rule, and its
  never-infer refusal posture (unknown-recipe lists the Idea's actual Assets).
- [x] 1.4 Read `src/asset/asset.ts`'s `LedgerAssetRecord.zoho_schedule_reference`/
  `ZohoScheduleReference`/`parseZohoScheduleReference` (issue #161) — confirm the exact stored shape
  (`string | readonly string[]`, verbatim, never normalized) this slice's decision keys on.
- [x] 1.5 Read `src/production-spec/brand-profile.ts`'s `Channel`/`primaryChannelFrom`/
  `loadPrimaryChannel` (ADR-0019, issue #127) — the Brand's ONE primary Channel this slice writes the
  live URL for.
- [x] 1.6 Read `src/schedule-batch/mcp-plan.ts` (issue #160) for the sibling ADR-0020 module's house
  style (pure decision + returned, clearly-worded refusals; co-located domain types).
- [x] 1.7 Run `npm test` (1916 passing, 0 failing, 493 suites minus this slice) and `npm run test:docs`
  (179 passing) to capture the exact baseline before any change.

## 2. Shared attribution write (test-first)

- [x] 2.1 Add `src/asset/attribution.test.ts` FIRST (failing — the module does not exist yet):
  `nextAttributedStatus`'s produced -> posted / never-regress table; `writeAttributedPost` writes
  `post_url`/`posted_at`/status onto the ledger and refreshes a known local output-bundle `post.json`;
  an Asset with no local bundle directory yet never throws.
- [x] 2.2 Implement `src/asset/attribution.ts`: `nextAttributedStatus`, `AttributedPostWrite`,
  `AttributionWriteOptions`, `writeAttributedPost` (the exact two-step write extracted verbatim from
  `logPostCommand`). Run 2.1: green.
- [x] 2.3 Add `describeAssetList` to `src/asset/asset.ts` (extracted from `/log-post`'s private
  `describeAssets`, unchanged wording).
- [x] 2.4 Refactor `src/commands/log-post.ts` to call `nextAttributedStatus`/`writeAttributedPost`/
  `describeAssetList` instead of its own inlined logic. Run the PRE-EXISTING, UNMODIFIED
  `src/commands/log-post.test.ts`: green, byte-for-byte — proves the refactor changed nothing observable.

## 3. Confirmed-live decision + shell (test-first)

- [x] 3.1 Add `src/schedule-batch/confirmed-live.test.ts` FIRST (failing — the module does not exist
  yet), covering `planConfirmedLiveLog`: unknown Idea/Recipe; not-yet-produced; **AC4** — no stored
  `zoho_schedule_reference` refuses and is never auto-logged, even with a live report in hand; no
  configured primary Channel; **AC2** — a report for a different reference refuses even though it claims
  live (string-vs-array shape sensitivity, array-order sensitivity); **AC3** — no report entry for the
  primary platform, a `"pending"`/`"failed"` Zoho status, and a `"live"` status missing `liveUrl`/
  `liveAt` all refuse, clearly, writing nothing; **AC1** — a matching, fully-live report returns the
  primary Channel's URL/time and the correctly-advanced `nextStatus`, ignoring a live status on a
  NON-primary platform; an already-posted/tracking/scored Asset's status never regresses on re-confirm.
- [x] 3.2 Add shell-level tests for `confirmZohoPostLive`: **AC1** — byte-identical Asset-record effect
  to an equivalent `/log-post` call (proves the SAME write path); two-Asset sibling isolation; **AC4**/
  **AC3**/**AC2** shell-level refusals each assert the ledger file is byte-unchanged; the named Asset's
  output-bundle `post.json` is refreshed on success (issue #112, shared with `/log-post`); Brand-scoped
  (never touches another Brand's ledger).
- [x] 3.3 Implement `src/schedule-batch/confirmed-live.ts`: `ZohoPostLiveStatus`/`ZohoPlatformStatus`/
  `ZohoScheduleReport` types; `referencesMatch` (shape- and order-sensitive, never resembled);
  `planConfirmedLiveLog`; `ConfirmZohoPostLiveOptions`/`confirmZohoPostLive`. Run 3.1 + 3.2: green.

## 4. OpenSpec

- [x] 4.1 `grep -n "^### Requirement" openspec/specs/post-attribution/spec.md` — confirm no existing
  requirement's TEXT needs to change (the shared-write extraction is an internal refactor, not an
  observable-behavior change) — zero Modified Capabilities.
- [x] 4.2 Author `proposal.md` (Why / What Changes / Non-Goals / Capabilities / Impact), this `tasks.md`,
  and an ADDED-Requirement spec delta for a NEW capability, `schedule-batch-confirmed-live`, under
  `openspec/changes/issue-162-confirmed-live-autolog/specs/schedule-batch-confirmed-live/spec.md`.
- [x] 4.3 `npx openspec validate issue-162-confirmed-live-autolog --strict` green.

## 5. Self-review

- [x] 5.1 `npm test` green (type-check + full suite; confirm the count grows from the 1916 baseline with
  zero regressions, `src/commands/log-post.test.ts` unchanged and still fully green).
- [x] 5.2 `npm run test:docs` green (confirm the 179 baseline is unchanged — no doc file touched).
- [x] 5.3 Simplify pass: confirm every issue #162 acceptance criterion maps to a named, passing test;
  confirm no `spaces_*`/`creations_*`/Zoho MCP call anywhere in the diff (`grep -rn "spaces_\|creations_\|
  zoho\." src/asset/attribution.ts src/schedule-batch/confirmed-live.ts`); remove dead code/unused
  imports.
- [x] 5.4 Write the Build Report into `handoff.md`: what changed, files touched, how to run, per-AC
  self-assessment mapping each AC to its proving test(s), fakes/fixtures used (explicitly: no Magnific
  fake needed — this slice has no live-system boundary), self-review notes, known limits (the actual
  Zoho-report fetch and MCP scheduling flow — #163's job, deliberately not started).
