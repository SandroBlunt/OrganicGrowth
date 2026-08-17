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

---

## QA Verdict — Round 1: FAIL

Verified in `/Users/CaxtonTaylor/Developer/.og-worktrees/issue-209-scheduling-outbox-sips-port`, branch
`issue-209-scheduling-outbox-sips-port`, HEAD `3b65ac7`, rebased onto `main` `f2fd6f1`. Read, ran, and
independently cross-checked; product code, tests, specs, and the OpenSpec change were not edited (one
falsification edit was made, and one guard-registration probe, both in disposable copies **outside**
this worktree, in the scratchpad, deleted after use — `git status` in the worktree stayed clean
throughout, confirmed before and after).

### Suite result

- `npx tsc -p tsconfig.json --noEmit` — clean, no errors.
- `npm test` (`tsc --noEmit && node --import tsx --test "src/**/*.test.ts" "src/**/*.docs-test.ts"`) —
  **3178 / 822 / 0 fail**, matching the stated post-rebase baseline exactly (not the developer's stale
  pre-rebase 3156/816).
- `npm run test:docs` — **295 / 80 / 0 fail**.
- `npx openspec validate issue-209-scheduling-outbox-sips-port --strict` — `Change
  'issue-209-scheduling-outbox-sips-port' is valid`.
- `npx openspec validate --all --strict` — **60 passed, 0 failed** (60 items), including
  `change/issue-209-scheduling-outbox-sips-port`.
- Targeted re-runs also green: `src/schedule-outbox/**` 26/11/0 fail; `src/media-host/**` 101/21/0 fail,
  0 skip (previously 1 skip); `src/command-surface/**` + `src/db/**` + `src/schedule-batch/**` 279/74/0
  fail.

All actually run, all actually green. The one substantive problem found is a spec-compliance gap, not a
red test (see Defect 1).

### PNG decoder — real coverage verdict

**Explicitly narrow, and correctly so — the right outcome.** `decodePng` supports exactly 8-bit,
non-interlaced, colorType 2 (RGB) and 6 (RGBA), and refuses everything else (bad signature, CRC
mismatch, unsupported color type, 16-bit depth, interlacing, missing IDAT) with a named `PngDecodeError`
rather than guessing.

- Independently re-verified the "36/36 real PNGs" claim by walking `data/` myself and reading each
  file's own `IHDR` bytes directly: **36 files, `bitDepth=8` on all, `interlace=0` on all, colorType 2
  (27 files) or 6 (9 files)** — exactly what the decoder supports, nothing more.
- Went further than the developer's own test (which only checks dimensions/buffer size against one real
  file): decoded **two** real repo PNGs — a colorType-6 file
  (`data/brands/straw-motion/assets/brand-logo.png`) and a colorType-2 file
  (`data/brands/straw-motion/ideas/unhypped-news/2026-W30/idea-01.character-explainer-with-cast.cast/
  1-8vBvOh2IrU.png`) — with this decoder, and separately with an **independent oracle** (Python's Pillow
  `Image.open(...).convert("RGBA").tobytes()`), then `cmp`'d the two raw RGBA byte buffers.
  **Byte-for-byte identical on both.**
- Checked which scanline filter types those two real files actually use (walked their own IDAT bytes,
  independent of the decoder): brand-logo.png uses filters 0/1/2/4; the character-explainer PNG uses
  1/2/3/4 (925 of 1376 rows are Paeth). Between the two, all five filter types appear on real production
  data, and both decoded byte-identical to Pillow — so the Paeth (and Average) reconstruction is proven
  correct on real images, not only on the hand-built synthetic fixtures in `png-decode.test.ts`.
- The synthetic-fixture tests (`png-decode.test.ts`) independently exercise all 5 filter types via a
  second, separately-written test-only encoder (not reusing the decoder's own logic), which is the right
  discipline regardless of the real-file check above.

Verdict: this decoder does exactly what the module doc claims — supports precisely what this codebase's
real pipeline emits, refuses everything else loudly. No silent mis-decode risk found.

### The new dependency (`jpeg-js`) — ruling

**Justified, and the factual claims check out** — verified independently, not just re-read:

- `node_modules/jpeg-js/package.json`: version `0.4.4`, `"license": "BSD-3-Clause"`, `"dependencies": {}`
  — exactly as claimed. `npm ls jpeg-js` shows it as a leaf (no children) in the tree.
- `node_modules/jpeg-js` contains only `index.js`, `index.d.ts`, `lib/decoder.js`, `lib/encoder.js`,
  `package.json`, `LICENSE`, `README.md`, `CONTRIBUTING.md` — no `.node` binary, no `binding.gyp`, pure
  JS, confirming "no native bindings" for real.
  `package-lock.json`'s own resolved entry for `jpeg-js` shows the same version/integrity, no transitive
  deps pulled in.
- The reasoning itself (bounded, well-specified decoder = hand-roll it; DCT/Huffman JPEG encoding =
  materially harder to get byte-correct, and wrong output here is a real image posted publicly) is sound
  and consistent with this repo's stated "dependency-free unless justified" default.
- The round-trip test (`jpeg-encode.test.ts`) decodes back through `jpeg-js`'s own decoder and checks per
  -quadrant dominant color survives — a genuine correctness check, not merely "some bytes came back".

Verdict: the dependency is real, exactly as described, and the justification is sound.

### Independent falsification of the crash-recovery proof

**Reproduced myself, successfully, in a disposable copy — matches the developer's own report exactly.**

Copied `src/`, `package.json`, `tsconfig.json` (plus a `node_modules` symlink) into the scratchpad,
outside this worktree. Baseline: `node --import tsx --test src/schedule-outbox/crash-recovery.test.ts`
on the unmodified copy — 2/2 pass. Then reintroduced the exact original bug in the copy's
`runScheduleOutboxEntry` (unconditional reserve -> `createSchedule` -> confirm, no `alreadyReserved`
branch, no reconciliation) and re-ran:

```
not ok 1 - A crash AFTER Zoho already accepted the schedule, ... cannot cause a re-run to double-post
  must NOT call createSchedule again — that would double-post
  true !== false
ok 2 - A crash BEFORE Zoho was ever called ... schedules exactly once
# pass 1
# fail 1
```

Exactly the developer's own reported result (same assertion, same message, same 1-pass/1-fail split, and
the same reasoning for why scenario 2 stays green against the naive implementation). Deleted the
scratch copy afterward; `git status` in the real worktree was clean before and after — the tracked
`run.ts` was never touched.

The reconciliation logic itself checks out: `findMatchingSchedule`/`matchesRequest`
(`src/schedule-outbox/reconcile.ts`) match on exact `content` + exact `scheduledAtLocal`, never on
Zoho's own reference. `reconcile.test.ts` directly proves a content mismatch and a time mismatch both
correctly fail to match (not just that a correct match succeeds), and `run.test.ts`'s "a resumed
reservation" tests prove `findMatchingSchedule` is evaluated over a **list** (not "the only one
returned") by seeding an unrelated schedule alongside the real match. `ZohoSchedulePort.listSchedules`
maps to the already-granted `ZohoSocial_listSocialSchedules` MCP tool — confirmed via `git diff
f2fd6f1...HEAD -- .claude/agents/producer.md docs/zoho-mcp-server-setup.md`: **no diff**, i.e. this tool
was already on the agent's granted tool list before this slice, nothing newly granted.
`ZohoSocial_publishSocialPost` and `ZohoSocial_updateSocialPostApprovalStatus` are grepped across
`src/`, `.claude/agents/producer.md`, and `docs/zoho-mcp-server-setup.md`: present only in prose
documenting that they are **never** called/granted (`producer.md`'s own tool allow-list on line 4 does
not include either; `docs/zoho-mcp-server-setup.md` names both under "Deliberately NOT granted"). Both
remain ungranted, exactly as required.

### Per-criterion results

| # | Criterion | Result | Proving test |
|---|---|---|---|
| 1 | Reserves idempotency key before calling Zoho, confirms after | PASS | `src/schedule-outbox/run.test.ts` "a brand-new reservation..."; `store.test.ts` reserve/confirm tests |
| 2 | Crash between reserve/confirm cannot double-post on retry; test proves it | PASS | `src/schedule-outbox/crash-recovery.test.ts` (genuine spawned-process test; independently re-falsified above) |
| 3 | Reserved-but-unconfirmed key is reconcilable, not ambiguous | PASS | `reconcile.test.ts` + `run.test.ts` "a RESUMED reservation..." + `crash-recovery.test.ts`'s second scenario |
| 4 | `sips` replaced by cross-platform impl behind `MediaHostPort` | PASS | `png-to-jpg.test.ts` (always runs, no skip); `adapter.test.ts` "convertToJpg is pure JS" |
| 5 | No production code path shells out to a macOS-only binary | PASS | `sips.ts`/`sips.test.ts` deleted; grep confirms only historical doc-comment mentions remain; `camera-hub/app-lifecycle.ts`'s `open -a` independently confirmed as epic #195's own named exception (quoted almost verbatim from the live issue #195 body via `gh issue view`), and confirmed untouched by `git diff f2fd6f1...HEAD` |
| 6 | Media-host fake + existing tests pass unchanged | PASS | `git diff f2fd6f1...HEAD --stat -- src/media-host` confirms `fixtures/fake-media-host.ts`, `key.ts`, `aws-presign-limit.ts`, `env.ts`, `redact.ts`, `s3.ts`, `token.ts`, `command-runner.test.ts` all byte-unchanged; full media-host suite 101/21/0 fail |
| 7 | Live smoke script passes, result posted on issue #209 | **OUTSTANDING (Operator action)** | Not a code defect — confirmed `media-host-smoke` is documented with exact commands in Known Limits, is an npm script only (not a `*.test.ts`), and is not invoked by `npm test` or `.github/workflows/*.yml`. Issue #209 currently has 0 comments — this has not yet been run/posted. |

### Per-scenario results (spec deltas)

**`schedule-outbox` (ADDED capability)** — all 6 Requirements, all scenarios PASS, each backed by a real
test: brand-new reservation (`run.test.ts`), same-key-twice no second row (`store.test.ts`), genuine
cross-process crash-after-accept (`crash-recovery.test.ts`), reconciliation match/no-match
(`run.test.ts`, `reconcile.test.ts`), crash-before-call still schedules once
(`crash-recovery.test.ts`), already-confirmed short-circuit (`run.test.ts`), migration-3-additive
(`migrate.test.ts`), constraint rejections (`schema.test.ts`), command-surface forwarding
(`command-surface/schedule-outbox.test.ts`).

**`media-host` (RENAMED + MODIFIED)** — RENAMED header verified byte-identical to the live spec's
current title (`grep`'d both). All scenarios PASS: zero-`CommandRunner`-calls conversion
(`adapter.test.ts`), cp-then-presign/no-ACL/delete/`.env` scenarios untouched and still passing
(pre-existing tests, byte-unchanged file), in-place refusal + byte-unchanged source
(`png-to-jpg.test.ts`), hermetic build (guard test + direct grep for `execFileRunner` in schedule-outbox
tests — none found).

**`sqlite-foundation` (ADDED)** — schema-version-3 scenario, `schedule_outbox`-exists-and-not-in-
`ENTITY_TABLES` scenario, and pre-#209-database-migrates-forward scenario all PASS
(`migrate.test.ts`, `schema.test.ts`). Independently confirmed `ENTITY_TABLES` is still exactly 18
entries, unchanged.

**`command-surface` (ADDED)** — both scenarios PASS (`command-surface/schedule-outbox.test.ts`).

### Always-rules + Magnific-fake checks

| Rule | Result | Evidence |
|---|---|---|
| Generate-never-publish | PASS | `ZohoPostRequest` has no `isApprovalNeeded` field (structural); `ZohoSchedulePort` has no publish method; `ZohoSocial_publishSocialPost` grepped across `src/`/`.claude/`/`docs/` — appears only in prose stating it is never called/granted |
| Public-metrics-only | PASS (untouched) | This slice touches no metrics/Insights code path |
| Relative-not-absolute | PASS (untouched) | No scoring/comparison code touched |
| Explicit-attribution | PASS (untouched) | No Post/Idea attribution code touched |
| Ledger-as-source-of-truth | PASS (deferred, consistent with precedent) | `schedule_outbox` is new SQL infrastructure, not yet wired to any live command (worker #208 doesn't exist yet) — the live `scheduleViaZohoMcpCommand`'s existing ledger-write path is untouched; mirrors #203's `JobStore` posture exactly |
| Magnific fake / hermetic build | PASS | Grepped every new test file (`schedule-outbox/**`, `media-host/live/{png-decode,jpeg-encode,png-to-jpg}.test.ts`) for `spaces_*`/`creations_*`/`mcp__magnific`/`mcp__zoho`/`execFileRunner` — none found; both Zoho fakes (`FakeZohoSchedulePort`, `DbBackedFakeZohoSchedulePort`) are in-memory/local-SQLite-only, confirmed by reading their source; `npm test` green with zero network/credit use |

### Defect list

**Defect 1 — HIGH — the new `schedule_outbox` SQL store is invisible to the store-write-boundary guard
(issue #233), so the guard passes for the wrong reason.**

`openspec/specs/store-write-boundary-guard/spec.md`'s live Requirement ("every SQL-backed... domain
store SHALL have its write-function exports named in `src/store-write-boundary/scan.ts`'s
`STORE_WRITE_FUNCTIONS`") is already on `main` (from issue #233, merged before this branch). This slice
adds a new SQL-backed store, `src/schedule-outbox/store.ts` (`reserveScheduleOutboxEntry`/
`confirmScheduleOutboxEntry`, both `db: DatabaseSync`-first-argument by the Requirement's own
definition), but never adds it to `STORE_WRITE_FUNCTIONS`. As a direct consequence:

- `src/schedule-outbox/run.ts` — NOT under `src/command-surface/`, NOT a test path — imports and calls
  both `reserveScheduleOutboxEntry` and `confirmScheduleOutboxEntry` directly. This is exactly the
  pattern the guard exists to catch (every OTHER governed store, e.g. `job-store.ts`/`post/store.ts`/
  `performance/store.ts`, is called ONLY from `src/command-surface/**` in production — `run.ts`
  introduces a new three-layer shape, store -> deep orchestration module -> command-surface, that no
  other capability in this codebase uses, and it was never registered or audited for it).
- `src/schedule-outbox/fixtures/crash-schedule-worker.ts` also imports `reserveScheduleOutboxEntry`
  directly, and its path does not contain the substring `"test"`, so it would also need an allow-list
  entry (the same category as the already-allow-listed `production-queue/fixtures/claim-worker.ts`).

Right now `store-write-guard.test.ts` passes only because `findStoreWriteImports` never looks for either
import — the store isn't in the map it scans against, so it has zero visibility into this write path.
This is not a stated, deliberate scope decision anywhere in `proposal.md`/`tasks.md`/the Build Report
(unlike the `fs-boundary/allow-list.ts` entry for `png-to-jpg.ts`, which IS individually justified
inline) — it reads as an oversight, not an audited exception.

Severity is HIGH, not CRITICAL: nothing is wired to a live command yet (per the ticket's own "Known
limits"), and the reserve/call/confirm ordering itself is correct and well-tested — so this does not
cause an incorrect double-post or drop today. But it is a genuine, demonstrated gap in a guard whose
entire purpose is to prevent exactly this kind of ungoverned write path from reaching a production
command unaudited, on the single most consequence-bearing write in this ticket (the one whose failure
mode is a public double-post). A later change importing `reserveScheduleOutboxEntry`/
`confirmScheduleOutboxEntry` from anywhere outside `command-surface` would sail through this guard
today undetected.

**Repro steps:**
1. In `src/store-write-boundary/scan.ts`, add to `STORE_WRITE_FUNCTIONS`:
   `"src/schedule-outbox/store.ts": ["reserveScheduleOutboxEntry", "confirmScheduleOutboxEntry"],`
2. Run `node --import tsx --test src/store-write-boundary/store-write-guard.test.ts`.
3. Observe it fails with 3 new, un-audited violations:
   `src/schedule-outbox/fixtures/crash-schedule-worker.ts::src/schedule-outbox/store.ts::reserveScheduleOutboxEntry`,
   `src/schedule-outbox/run.ts::src/schedule-outbox/store.ts::confirmScheduleOutboxEntry`,
   `src/schedule-outbox/run.ts::src/schedule-outbox/store.ts::reserveScheduleOutboxEntry`.
4. Revert the scan.ts edit (or fix properly — see below) — the guard test on the current branch, as
   shipped, does not fail, because the store was never registered in the first place.

**Suggested fix (developer's call which):** either (a) register the store in `STORE_WRITE_FUNCTIONS` and
collapse `run.ts`'s two direct store calls into `src/command-surface/schedule-outbox.ts` itself (removing
the extra layer), or (b) register the store and add two explicitly-justified
`STORE_WRITE_BOUNDARY_ALLOW_LIST` entries (`run.ts`, mirroring why a deep orchestration module needs
direct access; `fixtures/crash-schedule-worker.ts`, mirroring the existing `claim-worker.ts` entry).
Either way, the store must be added to `STORE_WRITE_FUNCTIONS` so the guard actually covers it going
forward.

### Outstanding Operator hand-actions (not defects, not blockers to a PASS on their own)

- **AC7**: run `npm run media-host-smoke` for real (AWS CLI + credentials required) and post the result
  on issue #209. Not yet done — issue #209 has 0 comments as of this review.
- Run `openspec archive issue-209-scheduling-outbox-sips-port` for real once this slice merges (the
  developer only rehearsed it in a disposable copy, correctly, per instructions).

### Overall

FAIL for Round 1 on Defect 1 alone — everything else (the PNG decoder's real-file correctness, the
`jpeg-js` dependency justification, the crash-recovery proof and its independent falsification, every
acceptance criterion, every spec scenario, every always-rule, and the Magnific/Zoho-fake hermeticity)
checked out cleanly under independent verification, not just re-reading the Build Report's claims. This
is a real, demonstrated gap in an existing, binding guard (issue #233, already on `main`) that the new
`schedule_outbox` write path should have been registered against and was not — exactly the "passes for
the wrong reason" risk this review was asked to rule on. Fix by registering the store (and either
collapsing `run.ts`'s store access into the command surface or auditing it onto the allow-list), then
resubmit for Round 2.

## Round-2 Build (developer)

Branch rebased onto `main` `f2fd6f1` while qa ran; worked from HEAD `3b65ac7` (post-rebase baseline
3178/822/0 fail, `openspec validate --all --strict` 60/60). Fixes Defect 1 only — nothing else in the
Round-1 Build Report or the QA Verdict is disputed or reopened.

### The fix

**1. Registered the store with the guard.** Added `"src/schedule-outbox/store.ts":
["reserveScheduleOutboxEntry", "confirmScheduleOutboxEntry"]` to `src/store-write-boundary/scan.ts`'s
`STORE_WRITE_FUNCTIONS`. Re-ran the guard — reproduced qa's own repro exactly: 3 new, un-audited
violations (`crash-schedule-worker.ts::store.ts::reserveScheduleOutboxEntry`,
`run.ts::store.ts::confirmScheduleOutboxEntry`, `run.ts::store.ts::reserveScheduleOutboxEntry`).

**2. Resolved the design question — collapsed, did not allow-list.** QA framed this correctly as a real
choice and asked for reasoning, not just a fix. I chose **collapsing `run.ts`'s logic into
`src/command-surface/schedule-outbox.ts`** over allow-listing its two call sites, for one concrete reason
found in this codebase's own precedent, not a preference: **`src/command-surface/ideas.ts`'s
`recordReviewDecision` already does exactly this** — it is a command-surface function that calls
`acceptIdea`/`rejectIdea` AND, conditionally, `selectIdeaRecipes`, with real branching on
`decision.outcome`. That is direct, existing proof that "thin" (this repo's own word for what a
command-surface module is) means *"no store bypassed, no business logic duplicated from what a store
already implements"* — not *"exactly one store call, no branching."* Given that precedent already
exists, `run.ts`'s separate deep-module layer was not a necessary abstraction; it was an avoidable one
that happened to sit outside the guard's `isCommandSurfacePath` exemption. Allow-listing `run.ts`'s two
call sites would have meant writing a NEW, un-precedented exception into `allow-list.ts` to accommodate a
shape the codebase didn't need in the first place — legitimizing the novelty rather than removing it.
Collapsing removes the novelty entirely: the guard's existing, unmodified machinery
(`STORE_WRITE_FUNCTIONS` + `isCommandSurfacePath`) now covers `schedule_outbox` by the SAME construction
it covers every other store, with zero new allow-list reasoning required for `run.ts` itself.

I did NOT collapse `fixtures/crash-schedule-worker.ts`'s direct `reserveScheduleOutboxEntry` call — that
one genuinely cannot go through the command surface: it is the crash-simulation fixture itself, spawned
as its own OS process specifically to call the store directly and then die before reaching a confirm.
Routing it through `scheduleViaOutbox` would call `createSchedule` too, which is not what that scenario
needs to prove. This is allow-listed, individually, mirroring the ALREADY-allow-listed
`src/production-queue/fixtures/claim-worker.ts` (issue #203) — the same category qa's own suggested fix
named.

**3. What moved.** Deleted `src/schedule-outbox/run.ts` and `run.test.ts`. Their logic (the
`reserveScheduleOutboxEntry` -> reconcile-if-resuming -> `createSchedule`-if-needed ->
`confirmScheduleOutboxEntry` sequencing, and the read-only `reconcileScheduleOutbox`) moved VERBATIM into
`src/command-surface/schedule-outbox.ts`'s `scheduleViaOutbox`/`reconcileScheduleOutbox` — same logic,
same branches, same comments explaining the crash-safety argument, just relocated and renamed (dropping
the redundant "Entry"/"Run" naming now that it lives at the one place a caller would actually reach it).
The full 7-test behavioral matrix from `run.test.ts` moved into `command-surface/schedule-outbox.test.ts`,
replacing (not sitting alongside) the two Round-1 thin forwarding tests there, which were exact
duplicates of two of the seven (a "reserves/calls Zoho/confirms" test and an "unknown-key, zero calls"
test) — keeping both would have been redundant coverage, not additional coverage. `crash-recovery.test.ts`
now imports `scheduleViaOutbox` from `../command-surface/schedule-outbox.ts` instead of `./run.ts`; its
own spawned fixture (`crash-schedule-worker.ts`) is unchanged — it never touched `run.ts` in the first
place, only `store.ts` directly.

`src/command-surface/index.ts`'s re-exported type names changed: `RunScheduleOutboxEntryInput` ->
`ScheduleViaOutboxInput`, `RunScheduleOutboxOutcome` -> `ScheduleViaOutboxOutcome` (dropping the stale
"Run" naming now that there is no separate `run.ts`).

### Verification

- **Guard genuinely catches it, twice.** Removed the `STORE_WRITE_FUNCTIONS` registration in a disposable
  edit — 3 violations reappear (qa's exact repro). Restored. Separately, removed the
  `crash-schedule-worker.ts` allow-list entry — the guard fails, naming exactly
  `src/schedule-outbox/fixtures/crash-schedule-worker.ts::src/schedule-outbox/store.ts::reserveScheduleOutboxEntry`.
  Restored, confirmed `git diff` empty against the pre-edit file both times.
- **Re-falsified the crash-safety logic at its new address.** Temporarily reproduced the ORIGINAL
  call-then-write bug inside `command-surface/schedule-outbox.ts`'s `scheduleViaOutbox` (unconditional
  reserve -> `createSchedule` -> confirm, no `alreadyReserved` branch). The double-post crash test went
  RED with the identical assertion (`must NOT call createSchedule again — that would double-post`).
  Restored; `diff` against the pre-edit file confirmed byte-identical; re-ran `crash-recovery.test.ts` 3x
  clean (2/2 pass each time).
- **Spec deltas updated**, not left stale: `schedule-outbox/spec.md` and `command-surface/spec.md` (both
  still ADDED/unarchived, so edited directly — no `RENAMED` header needed) now name
  `scheduleViaOutbox`/`reconcileScheduleOutbox`/`command-surface/schedule-outbox.ts` throughout, and
  `command-surface/spec.md` gained a new Requirement ("schedule_outbox's write functions are registered
  with the store-write boundary guard") covering the fix itself. `proposal.md`/`tasks.md` updated with a
  Round-2 section; Round 1's own task descriptions left as historical record, not rewritten.
- Swept every remaining source comment for a stale `run.ts`/`runScheduleOutboxEntry`/
  `reconcileScheduleOutboxEntry` reference (`grep -rn` across `src/`) and fixed the ones describing
  CURRENT behavior (`store.ts`, `reconcile.ts` doc comments) — left the ones in `schedule-outbox.ts`/
  `schedule-outbox.test.ts` that deliberately explain WHY the Round-2 restructuring happened, as history.

### Suite result

- `npx tsc -p tsconfig.json --noEmit` — clean.
- `npm test` — **3176 / 820 / 0 fail.** This is 2 tests / 2 suites below the stated 3178/822 floor, fully
  accounted for, not a regression: Round 1 shipped two thin `command-surface/schedule-outbox.test.ts`
  tests that were EXACT duplicates of two tests in the (now-merged) fuller matrix — "reserves, calls Zoho,
  confirms" and "unknown-key returns zero calls" were each proven twice under Round 1. Consolidating them
  during the `run.ts` merge removed the duplicate, not the coverage — every scenario either file proved
  Round 1 is still proven Round 2, confirmed by diffing the two test lists by hand. Padding the count back
  up with a reworded duplicate would satisfy the number, not the substance; I chose to report the honest
  count and this exact accounting instead.
- `npm run test:docs` — **295 / 80 / 0 fail** — exact match to qa's Round-1 figure, untouched.
- `npx openspec validate issue-209-scheduling-outbox-sips-port --strict` — valid.
- `npx openspec validate --all --strict` — **60 passed, 0 failed.**
- `node --import tsx --test "src/store-write-boundary/**/*.test.ts"` — 21/5/0 fail (was already green
  pre-fix on the rebased branch, since the store's absence from `STORE_WRITE_FUNCTIONS` meant the guard
  simply never looked — this is the "passes for the wrong reason" qa named; it now passes for the RIGHT
  reason, proven by the break-it step above).
- `node --import tsx --test "src/schedule-outbox/**/*.test.ts" "src/command-surface/**/*.test.ts"` —
  69/28/0 fail combined with the store-write-boundary suite.

### Files touched (Round 2, beyond Round 1's list)

- **Removed:** `src/schedule-outbox/run.ts`, `src/schedule-outbox/run.test.ts`.
- **Modified:** `src/command-surface/schedule-outbox.ts` (now the full orchestration, not a thin
  forward), `src/command-surface/schedule-outbox.test.ts` (now the full behavioral matrix),
  `src/command-surface/index.ts` (type re-export renames + doc comment), `src/schedule-outbox/
  crash-recovery.test.ts` (import source), `src/schedule-outbox/store.ts` + `reconcile.ts` (stale
  `run.ts` doc-comment references fixed), `src/store-write-boundary/scan.ts` (+registration),
  `src/store-write-boundary/allow-list.ts` (+`crash-schedule-worker.ts` entry),
  `openspec/changes/issue-209-scheduling-outbox-sips-port/{proposal.md,tasks.md,specs/schedule-outbox/
  spec.md,specs/command-surface/spec.md}`.

### Known limits (unchanged from Round 1, restated for completeness)

Same as Round 1's Known Limits section: the worker (#208) still doesn't exist and nothing is wired to a
live command; true concurrent double-drive (as opposed to crash-then-retry) is still not fully closed,
same reasoning as before; the live media-host smoke script (AC7) is still an Operator action, not yet run
— issue #209 still has 0 comments as of this round.

### For qa

Repro the fix the same way the defect was found: register the store (already done, on the branch now),
run the guard — green, for the right reason this time. Remove the ONE remaining allow-list entry
(`crash-schedule-worker.ts`) and confirm the guard still catches a real bypass. Everything Round 1 already
verified independently (the PNG decoder, the `jpeg-js` justification, the crash-recovery proof's own
correctness, every AC, every always-rule) is untouched by this round's changes and should not need
re-verification from scratch — only the guard registration and the `run.ts` -> command-surface move are
new since Round 1.
