# Slice Handoff — issue #209: Scheduling reserves its key, and sips goes behind the port

## Build Report (developer, Round 1)

### What changed

Two independent halves, both "the worker's two outside edges" (epic #195), neither wired to a live
command yet — the worker itself (#208) is a later, still-open ticket.

**Scheduling — a new Schedule Outbox** (`src/schedule-outbox/`). Reverses the "call Zoho, then write"
order into "reserve, call, confirm":

- `store.ts` — `reserveScheduleOutboxEntry` (insert-or-find, keyed on a `UNIQUE idempotency_key` — a
  retry finds the SAME row rather than creating a second one) and `confirmScheduleOutboxEntry`
  (atomically `'reserved'` -> `'confirmed'`, idempotent).
- `reconcile.ts` — PURE matching: `findMatchingSchedule` identifies a Zoho-reported schedule as "the
  same one" by exact content + exact local schedule time, never by Zoho's own reference (unknown until
  discovered) or by "the only one returned".
- `run.ts` — the orchestration: `reconcileScheduleOutboxEntry` (read-only toward Zoho — never calls
  `createSchedule`) and `runScheduleOutboxEntry` (the full sequence). A BRAND NEW reservation goes
  straight to `createSchedule` (nothing could have reached Zoho yet). A RESUMED reservation (this exact
  idempotency key was already reserved by some earlier, uncompleted call — indistinguishable, from here,
  from "crashed mid-flight") reconciles FIRST, and only calls `createSchedule` when Zoho confirms it does
  not already have it. An ALREADY-CONFIRMED key short-circuits, calling Zoho zero times.
- `ZohoSchedulePort` gains `listSchedules` (`src/schedule-batch/mcp-schedule-port.ts`) — the real,
  already-granted `ZohoSocial_listSocialSchedules` MCP tool, simply unused by this port until now.
  `FakeZohoSchedulePort` implements it, reading from a new public `created` array.
- `src/db/schema.ts` gains `MIGRATION_3`: `schedule_outbox`, additive, `MIGRATION_1`/`MIGRATION_2`
  untouched. Deliberately NOT one of `ENTITY_TABLES` (it's engineering infrastructure, not a
  `CONTEXT.md`-named domain entity) — a new `OUTBOX_TABLES` constant instead.
- `scheduleViaOutbox`/`reconcileScheduleOutbox` exposed on the command surface
  (`src/command-surface/schedule-outbox.ts`) — a new capability, not wired to any live command by this
  ticket (mirrors `src/production-queue/job-store.ts`'s own issue #203 posture: prove the primitive
  against the real schema first).

**sips — replaced by a pure-JS PNG->JPG converter**, same `MediaHostPort` interface:

- `src/media-host/live/png-decode.ts` — a hand-rolled, ZERO-new-dependency PNG decoder (`node:zlib`'s
  `inflateSync` only, mirroring `src/media-host/fixtures/tiny-png.ts`'s own zero-dependency PNG
  *encoder*). Scoped to exactly the two PNG shapes this codebase's real carousel-slide PNGs actually use
  (8-bit, non-interlaced, `colorType` 2 or 6 — verified against all 36 `.png` files under `data/`);
  refuses (named `PngDecodeError`) anything else — a bad signature, a CRC mismatch, an unsupported color
  type, 16-bit depth, interlacing, a missing IDAT — rather than silently mis-decoding.
- `src/media-host/live/jpeg-encode.ts` — wraps `jpeg-js`, the ONE new runtime dependency this ticket
  adds (justified below).
- `src/media-host/live/png-to-jpg.ts` — composes the two into `convertPngToJpg(sourcePath, destPath,
  options)`, the same contract `convertPngToJpgViaSips` (deleted) had, including the "never rewrite the
  source in place" refusal.
- `LiveMediaHost.convertToJpg` now calls this — NO subprocess, NO shelled-out binary, cross-platform by
  construction. `sipsCommand` is gone from `LiveMediaHostOptions`, replaced by an optional
  `jpegQuality`.
- `src/media-host/live/sips.ts` + `sips.test.ts` deleted.

**Audit: no other macOS-only shell-out behind a production code path.** Grepped every
`node:child_process`/`execFile`/`spawn` use and every `osascript`/`pbcopy`/`open -a`/`sips`/etc. pattern
across `src/`. One SIBLING macOS-only call exists: `src/camera-hub/app-lifecycle.ts`'s `open -a`. **Not
touched, reported as instructed** — Camera Hub teleprompter upload is epic #195's own named exception
("drives a desktop app on this specific Mac... stays a local companion step"), unrelated to
`MediaHostPort` or the worker. (`src/secrets-scan/tracked-files.ts`'s `git ls-files` and
`src/schedule-batch/live` AWS CLI calls are cross-platform, not macOS-only, and out of scope regardless.)

### Files touched

**New:**
- `src/schedule-outbox/store.ts`, `store.test.ts`
- `src/schedule-outbox/reconcile.ts`, `reconcile.test.ts`
- `src/schedule-outbox/run.ts`, `run.test.ts`
- `src/schedule-outbox/crash-recovery.test.ts`
- `src/schedule-outbox/fixtures/db-backed-fake-zoho.ts`
- `src/schedule-outbox/fixtures/crash-schedule-worker.ts`
- `src/command-surface/schedule-outbox.ts`, `schedule-outbox.test.ts`
- `src/media-host/live/png-decode.ts`, `png-decode.test.ts`
- `src/media-host/live/jpeg-encode.ts`, `jpeg-encode.test.ts`
- `src/media-host/live/png-to-jpg.ts`, `png-to-jpg.test.ts`
- `openspec/changes/issue-209-scheduling-outbox-sips-port/` (this change)

**Modified:**
- `src/db/schema.ts` (+`MIGRATION_3`, +`OUTBOX_TABLES`), `src/db/schema.test.ts` (+`schedule_outbox`
  shape/constraint tests), `src/db/migrate.test.ts` (`CURRENT_SCHEMA_VERSION` 2 -> 3, +migration-3-is-
  additive test)
- `src/schedule-batch/mcp-schedule-port.ts` (+`listSchedules`, +`ZohoScheduleRecord`)
- `src/schedule-batch/fixtures/fake-zoho-schedule-port.ts` (+`listSchedules`, +`created`), its
  `.test.ts` (+3 tests)
- `src/schedule-batch/mcp-schedule.test.ts` (two `call.kind === "upload"` guards widened to also skip
  the new `"list"` call kind — pre-existing tests' own loops, unrelated to their actual assertions)
- `src/media-host/live/adapter.ts` (+`.test.ts`), `command-runner.ts` (doc comment only), `smoke.ts`
  (doc comment + one console.log line), `src/media-host/port.ts` (doc comment only)
- `src/command-surface/index.ts` (+2 re-exports)
- `src/fs-boundary/allow-list.ts` (+`png-to-jpg.ts`, audited and justified inline)
- `package.json`/`package-lock.json` (+`jpeg-js`)

**Removed:** `src/media-host/live/sips.ts`, `src/media-host/live/sips.test.ts`

### How to run

```
npx tsc -p tsconfig.json --noEmit
npm test
npx openspec validate issue-209-scheduling-outbox-sips-port --strict
npx openspec validate --all --strict
```

Targeted:
```
node --import tsx --test "src/schedule-outbox/**/*.test.ts"
node --import tsx --test "src/media-host/**/*.test.ts"
node --import tsx --test "src/command-surface/**/*.test.ts" "src/db/**/*.test.ts" "src/schedule-batch/**/*.test.ts"
```

### Acceptance-criteria self-assessment

| # | Criterion | Proven by |
|---|---|---|
| 1 | Scheduling reserves its idempotency key before calling Zoho, and confirms afterwards. | `src/schedule-outbox/run.test.ts` — "a brand-new reservation goes straight to createSchedule" (reserve happens via `reserveScheduleOutboxEntry` before any port call; `port.calls` is `["schedule"]` only, confirm follows); `store.test.ts`'s reserve/confirm tests prove the primitives directly. |
| 2 | A crash simulated between the reserve and the confirm cannot cause a re-run to double-post. Test proves it. | `src/schedule-outbox/crash-recovery.test.ts`, scenario "A crash AFTER Zoho already accepted the schedule..." — a REAL, separate OS process (`fixtures/crash-schedule-worker.ts`) reserves, really calls a real (file-backed, cross-process-durable) fake Zoho, then `process.exit(1)` WITHOUT confirming; the retry (in a different process context) is asserted to call `createSchedule` ZERO more times and the fake Zoho's own row count stays at 1. Verified genuine: temporarily reverted `run.ts` to the ORIGINAL "call, then write" bug shape and confirmed this exact test goes RED (`true !== false` on `calledCreateSchedule`), then restored and confirmed green — see "Break-it verification" below. |
| 3 | A reserved-but-unconfirmed key is reconcilable against Zoho rather than left ambiguous. | `src/schedule-outbox/reconcile.test.ts` (pure matching) + `run.test.ts`'s "a resumed reservation" describe block (Zoho already has it -> confirmed via reconciliation, zero new `createSchedule` calls; Zoho never received it -> reconciliation finds nothing, then schedules exactly once) + `crash-recovery.test.ts`'s second scenario (crash BEFORE Zoho was ever called -> retry still schedules exactly once — the post is never silently dropped). |
| 4 | The `sips` shell-out is replaced by a cross-platform implementation behind `MediaHostPort`. | `src/media-host/live/png-to-jpg.test.ts` (real conversion, ALWAYS runs — no platform skip); `src/media-host/live/adapter.test.ts`'s "convertToJpg is pure JS" test (real PNG -> real JPG, zero `CommandRunner` calls). |
| 5 | No production code path shells out to a macOS-only binary. | `sips.ts` deleted (`grep -rn "sips"` across `src/` now finds only historical doc-comment mentions of what was replaced); the sibling `open -a` in `camera-hub/app-lifecycle.ts` is explicitly reported (Build Report + proposal.md), not silently fixed or ignored — matching the instruction exactly. |
| 6 | The media-host fake and the existing media-host tests pass unchanged. | `git diff HEAD~1 --stat -- src/media-host` shows `fixtures/fake-media-host.ts`/`.test.ts`, `key.ts`/`.test.ts`, `aws-presign-limit.ts`/`.test.ts`, `env.ts`/`.test.ts`, `redact.ts`/`.test.ts`, `s3.ts`/`.test.ts`, `token.ts`/`.test.ts`, `command-runner.test.ts` all BYTE-UNCHANGED. Only `adapter.ts`/`.test.ts` changed (necessarily — the sips-specific test tested the exact mechanism being replaced) plus three doc-comment-only touches (`command-runner.ts`, `smoke.ts`, `port.ts`). Full `src/media-host/**` suite green, 101 tests, 0 fail, 0 skip (previously 1 skip, the sips-on-non-macOS test — now unconditional). |
| 7 | The live media-host smoke script passes with the new conversion, result posted on the issue. | Operator action — documented below, never run, never wired into `npm test`. |

### Fakes / fixtures used

- **`FakeZohoSchedulePort`** (`src/schedule-batch/fixtures/fake-zoho-schedule-port.ts`) — **THIS IS THE
  MAGNIFIC/ZOHO FAKE** flagged for qa: fully in-memory, no MCP tool imported or called, used by every
  in-process schedule-outbox test.
- **`DbBackedFakeZohoSchedulePort`** (`src/schedule-outbox/fixtures/db-backed-fake-zoho.ts`) — **ALSO A
  ZOHO FAKE**, flagged for qa: a `ZohoSchedulePort` backed by an ad-hoc SQLite table in the SAME
  throwaway file the outbox itself uses (not one of `src/db/schema.ts`'s real migrations), so a crashed
  child process's own "Zoho call" stays durably visible to a separate rescue process. Used ONLY by
  `crash-recovery.test.ts` and its own spawned `fixtures/crash-schedule-worker.ts`. No network, no MCP
  tool, no credits — a real SQLite file is the only thing touched.
- **`FakeMediaHost`** (`src/media-host/fixtures/fake-media-host.ts`) — untouched, still the fake other
  Schedule Batch tests inject; not used directly by this ticket's own new tests (which exercise
  `png-decode.ts`/`jpeg-encode.ts`/`png-to-jpg.ts` directly, or `LiveMediaHost` with a stubbed
  `CommandRunner`).
- **`buildTinyPngBuffer`/`writeTinyPng`** (`src/media-host/fixtures/tiny-png.ts`) — untouched, reused
  as-is by the new PNG decoder/converter tests.
- No live AWS or Zoho call anywhere in this slice's tests — confirmed by `npm test`'s own green run and
  by direct inspection of every new test file's imports.

### The one new runtime dependency: `jpeg-js`

This repo ships exactly one runtime dependency (`yaml`) by deliberate restraint. Adding a second is
justified here, not casual:

- **PNG decoding** is bounded, well-specified, and low-stakes enough to hand-roll (chunk framing +
  `zlib.inflateSync` + five documented scanline filters) — exactly `tiny-png.ts`'s own existing
  precedent, just in reverse. I did this: `png-decode.ts` is zero-dependency.
- **JPEG encoding** (DCT, quantization, Huffman coding) is a materially harder, more error-prone codec to
  get byte-correct by hand — and this module's output is a REAL image a human will actually publish
  publicly via Zoho. A subtly-wrong hand-rolled encoder could produce a corrupted or visually-wrong image
  that passes a shallow "starts with FF D8 FF" test but fails in production. That risk is exactly what
  this repo's "stay dependency-free unless there's a real reason" restraint should not be stretched to
  cover.
- **`jpeg-js`** (`0.4.4`, BSD-3-Clause): pure JavaScript, **zero dependencies of its own** (verified:
  `npm view jpeg-js dependencies` → `{}`), no native bindings — so it does not reintroduce any
  platform-pinning risk (no prebuilt-binary-per-architecture concern, no compile step). ~100 KB installed.
  Ships its own TypeScript types (`index.d.ts`), so no ambient `.d.ts` or `@types/*` package was needed
  either.
- The round trip is proven for real: `jpeg-encode.test.ts` encodes a 4-quadrant test image and decodes
  it back through `jpeg-js`'s OWN decoder, checking each quadrant's dominant color survives lossy
  compression — not merely "some bytes came back". `png-to-jpg.test.ts` additionally converts a REAL
  repo PNG (`brand-logo.png`, RGBA) end to end and decodes the result to confirm dimensions.

### Break-it verification (crash-recovery test)

Mirroring `claim-concurrency.test.ts`'s own issue #203 discipline: temporarily replaced
`runScheduleOutboxEntry`'s body with the ORIGINAL bug this ticket exists to fix (reserve, then
unconditionally call `createSchedule`, then write — no `alreadyReserved` check, no reconciliation).
Result: the "crash AFTER Zoho accepted it" test failed exactly as expected —
`must NOT call createSchedule again — that would double-post: true !== false`. The "crash BEFORE Zoho
was ever called" test still passed (unsurprising — that scenario has no ambiguity for a naive
implementation to get wrong). Restored the real implementation (`diff` confirmed byte-identical to
before) and re-ran the full `crash-recovery.test.ts` suite 5x back to back — 2/2 pass every time, zero
flakes (SQLite's own writer serialization plus the real process-exit boundary make this deterministic,
not timing-dependent, exactly like #203's own finding).

### OpenSpec archive rehearsal

`openspec archive` has a documented trap history on MODIFIED requirement headers. Because one media-host
requirement's title itself needed to change (it named "sips" specifically), this change uses
`## RENAMED Requirements` (FROM the exact live title, TO a new one) followed by `## MODIFIED
Requirements` under the NEW title — the mechanism `@fission-ai/openspec`'s own archive tool supports
for exactly this case (`specs-apply.js`: RENAMED is applied before MODIFIED, and validation requires
MODIFIED to reference the renamed-TO header, never the FROM). **Rehearsed for real** (not merely read):
copied `openspec/` + `package.json` + a `node_modules` symlink into the scratchpad (outside this
worktree, never committed), ran `openspec archive issue-209-scheduling-outbox-sips-port --yes` there,
and confirmed: the media-host spec's renamed requirement landed correctly with its new title and new
body, every OTHER media-host requirement was untouched, `sqlite-foundation`'s "18 entity tables"
requirement came out byte-identical to before (`diff` confirmed), `command-surface` and `sqlite-
foundation` each gained exactly one new requirement, and `schedule-outbox` was created as a new spec
file with all 6 requirements. The rehearsal directory was then deleted; nothing in this worktree was
touched by it — `git status` before/after confirmed. **I did not run `openspec archive` for real** (the
Operator's own job, per instructions) — only this disposable rehearsal copy.

### Self-review notes

- Considered folding `schedule_outbox` into `ENTITY_TABLES` (simpler, one less concept) but reverted:
  `ENTITY_TABLES`'s own Requirement is specifically "every entity `CONTEXT.md` names", and
  `schedule_outbox` is engineering infrastructure, not domain vocabulary — mixing them would make that
  Requirement's own claim inaccurate. Gave it a separate `OUTBOX_TABLES` constant and direct tests
  instead (`schema.test.ts`), and left the `ENTITY_TABLES` Requirement completely untouched.
- Considered making `runScheduleOutboxEntry` ALWAYS call `listSchedules` first (one code path, no
  `alreadyReserved` branch) for simplicity. Rejected: it would call Zoho unnecessarily on every single
  normal (non-retry) schedule attempt, and the branch it replaces is small, well-tested, and clearly
  commented — the efficiency is worth the one `if`.
- Removed an early draft that denormalized `zoho_brand_name`/`label` onto `schedule_outbox` as their own
  columns; `request_json` already carries the full `ZohoPostRequest.target`, and nothing needs to query
  by those fields at the SQL level — kept the schema minimal.
- Left a stray placeholder assertion in the first draft of `crash-recovery.test.ts`
  (`"fake-live-ref-1".slice(0, 0) || outcome.reference`, a no-op) — replaced with a real assertion
  comparing `outcome.reference` against the crashed process's own row in `fake_zoho_schedule`, so the
  test genuinely proves WHICH reference survived, not merely that one exists.

### Known limits

- **The worker (issue #208) does not exist yet** — `scheduleViaOutbox`/`reconcileScheduleOutbox` are
  proven against the real schema and a fake Zoho, but not wired into any currently-running command. The
  live, attended `scheduleViaZohoMcpCommand` (`src/commands/schedule-via-zoho-mcp.ts`) keeps its own
  existing call-then-write order unchanged — rewiring it is #208's job, per the epic's own sequencing
  (mirrors #203's `JobStore` being unwired from `/queue` for the identical reason).
- **True concurrent double-drive (not crash-then-retry) is not fully closed.** `reserveScheduleOutboxEntry`
  prevents a SECOND local reservation row, but if two callers were BOTH mid-flight (not one crashed, both
  genuinely running) for the SAME idempotency key at the SAME instant, a narrow window exists where
  BOTH could see "nothing on Zoho yet" and both call `createSchedule`. Given a single serial worker
  (epic #195's own worker design: "a local process... drains the Production Queue", singular), this is
  not the threat model issue #209 asks for (which is specifically crash-then-restart, proven for real).
  Closing it fully would mean adding a claim/lease to `reserveScheduleOutboxEntry` itself, mirroring
  `job-store.ts`'s `claimJob` — deliberately left for the worker slice if it turns out to need it.
- **Live media-host smoke script — Operator action, not run by me.** `npm run media-host-smoke`
  (`src/media-host/live/smoke.ts`) now converts via the pure-JS path instead of `sips`; everything else
  about it (AWS CLI upload/presign/delete against the real `strawmotion-schedule-media` bucket) is
  unchanged. To run it: the AWS CLI must be on `PATH` with credentials carrying
  `s3:GetObject`/`s3:PutObject`/`s3:DeleteObject` on that bucket (see `docs/schedule-batch-s3-setup.md`);
  no `sips` and no other tool is required anymore. Command: `npm run media-host-smoke`. A PASS prints
  `[1/6]` through `[6/6]` and ends with `SMOKE TEST PASSED` on stdout, exit code 0 — it converts a tiny
  fixture PNG, uploads it under an unguessable key, confirms the signed URL returns HTTP 200
  `image/jpeg` with no redirect, confirms the SAME object's direct unsigned URL is refused, deletes it,
  and confirms the signed URL is gone afterward. Please run this and post the result on issue #209 (AC7).
- **PNG decoder scope.** `decodePng` supports exactly 8-bit, non-interlaced, `colorType` 2 (RGB) or 6
  (RGBA) — everything this codebase's real carousel-slide PNGs actually are today. A future Recipe
  producing a palette/grayscale/16-bit/interlaced PNG would need this decoder extended first (it refuses
  loudly, `PngDecodeError`, rather than mis-decoding).
- **One harmless stale comment.** `src/media-host/live/command-runner.test.ts` (deliberately left
  BYTE-UNCHANGED, per the "existing media-host tests pass unchanged" instruction) still names
  `sips.test.ts` in its own doc comment, referencing a file this ticket deletes. Purely cosmetic — it
  does not affect what the test does or asserts — flagged rather than silently left, and not fixed
  because fixing it would mean editing a file this ticket was told to leave alone.
