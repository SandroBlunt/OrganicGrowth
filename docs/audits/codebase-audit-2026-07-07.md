# OrganicGrowth — Full Codebase Audit

**Date:** 2026-07-07
**Scope:** entire repository at commit `18571f6` (branch `main`, clean tree)
**Method:** adversarial line-level read of all 32 non-test TypeScript source files by the lead auditor, plus three parallel audit sweeps (documentation drift; tests & developer experience; on-disk state & templates), followed by independent verification of every High/Critical claim. Safe local checks only (`npm test`, `npm run build`, `git check-ignore`, one deliberately-failing `npm run report`); no live Magnific/Apify calls, no state mutation outside temp dirs.

---

## 1. Summary table

Severity: **Critical** = core workflow impossible / data-loss / privacy exposure · **High** = wrong behavior on a main path, serious trap · **Medium** = wrong/inconsistent with workaround · **Low** = polish, clarity.
Evidence: **CONFIRMED** = both sides verified in this audit · **PLAUSIBLE** = strong code-level reasoning, not fully reproduced · **BLOCKED** = needs an environment this audit could not use.

| ID | Sev | Area | Issue (one line) | Anchor | Evidence |
|----|-----|------|------------------|--------|----------|
| C1 | Critical | Correctness | Gate 2's Character pick is never persisted anywhere and never reaches the render | `src/commands/pick-cast.ts:97` | CONFIRMED |
| C2 | Critical | Missing fn | The documented production runtime cannot execute: no live Space adapter, no worker host, no spec-composer caller, permission file unreadable by any tool | `src/production-queue/worker.ts:1` | CONFIRMED |
| C3 | High | Correctness | A crash/restart while a job is `running` deadlocks the queue forever; no recovery path exists | `src/production-queue/worker.ts:180` | CONFIRMED |
| C4 | High | Missing fn | Failed jobs are unrecoverable and permanently block their Idea from production | `src/production-queue/queue.ts:91` | CONFIRMED |
| C5 | High | Boundary | Root `data/your-data/` is not gitignored while three docs direct private Meta exports there | `.gitignore:7` | CONFIRMED |
| C6 | High | Correctness | Queue dedupe and lock key on `idea_id` alone — a cross-Brand id collision silently drops the second Brand's job | `src/production-queue/queue.ts:69` | CONFIRMED |
| C7 | High | Docs | `/review-ideas` documents an `enqueueOnAccept(<idea-id>)` call that omits the required `brand` argument | `.claude/commands/review-ideas.md:28` | CONFIRMED |
| C8 | High | Docs | Performance-tracking status filters contradict each other; nothing ever sets `tracking`; `posted` Ideas dead-end | `.claude/commands/track-performance.md:19` | CONFIRMED |
| C9 | High | Incoherence | Fake-only conventions are baked into the production driver (`PINNED:` readback, hardcoded `cast-1…6` fallback ids) | `src/space-driver/driver.ts:250` | CONFIRMED |
| C10 | High | Correctness | Driver polls 50× back-to-back with no delay — any real multi-minute Space op would always "fail" | `src/space-driver/driver.ts:128` | CONFIRMED |
| C11 | High | DX | The `/run-pipeline` CLI buffers every message until the session ends; prompts appear with no context | `src/commands/run-pipeline.ts:889` | CONFIRMED |
| C12 | High | Correctness | Hardcoded `mundotip` defaults route other Brands' reads to mundotip's ledger/profile | `src/ledger/ledger.ts:38` | CONFIRMED |
| C13 | Medium | Boundary | Non-atomic writes + unguarded `JSON.parse` on the canonical state files; one corrupt file crashes every command | `src/ledger/ledger.ts:220` | CONFIRMED |
| C14 | Medium | Correctness | `tick()` silently discards a terminal Space result when no `running` job matches — a finished Asset can vanish | `src/production-queue/worker.ts:200` | CONFIRMED |
| C15 | Medium | Correctness | A ledger-write failure during reap leaves the job `running`, the lock held, and the result already consumed | `src/production-queue/worker.ts:246` | CONFIRMED |
| C16 | Medium | Alt paths | Multi-process read-modify-write races on `queue.json`; the in-memory `inFlight()` guard is per-process | `src/production-queue/worker.ts:165` | PLAUSIBLE |
| C17 | Medium | Boundary | `SpaceOpResult` carries no job/idea correlation — the tick attaches the result to whichever job is `running` | `src/production-queue/worker.ts:97` | PLAUSIBLE |
| C18 | Medium | Missing fn | `validate()` ignores the entire clip-level contract; `clips: [1,2,3]` passes validation | `src/production-spec/validate.ts:107` | CONFIRMED |
| C19 | Medium | Incoherence | Spec filenames use the full ledger id (`idea-2026-W22-01.spec.json`) while briefs and docs use `idea-NN` | `src/production-spec/store.ts:26` | CONFIRMED |
| C20 | Medium | Incoherence | `DEFAULT_IDEAS_ROOT = "ideas"` resurrects the deliberately-deleted legacy root folder | `src/production-spec/store.ts:15` | CONFIRMED |
| C21 | Medium | Correctness | Conductor reads `baseline.value`, a field no writer, template, or real file has — advisory fires forever | `src/commands/run-pipeline.ts:561` | CONFIRMED |
| C22 | Medium | Correctness | The onboarding interview discards the typed display name and stores the slug as `channel.name` | `src/commands/run-pipeline.ts:362` | CONFIRMED |
| C23 | Medium | Affordance | Re-running `/pick-cast` claims "render queued" on a no-op; no status guard; a re-pick changes nothing | `src/commands/pick-cast.ts:102` | CONFIRMED |
| C24 | Medium | Incoherence | Cast jobs stay `awaiting_cast` forever after the pick — `/queue` permanently shows a gate that already cleared | `src/production-queue/scheduler.ts:126` | CONFIRMED |
| C25 | Medium | Affordance | Choosing `fresh` resets nothing on disk — old jobs and `casting` Ideas persist untouched | `src/commands/run-pipeline.ts:667` | CONFIRMED |
| C26 | Medium | DX | Readiness swallows YAML syntax errors as "field not set"; a `null` seed entry crashes the conductor | `src/commands/run-pipeline-readiness.ts:73` | CONFIRMED |
| C27 | Medium | Alt paths | `runPipelineCommand` with the default input callback spins forever on the uncapped resume/fresh loop | `src/commands/run-pipeline.ts:642` | CONFIRMED |
| C28 | Medium | DX | `engines` permits Node 20 but the `npm test` glob needs the Node ≥21 test runner | `package.json:12` | BLOCKED |
| C29 | Medium | DX | The report tool prints `usage: npm run report` — that script does not exist (verified); none for run-pipeline either | `src/commands/report.ts:144` | CONFIRMED |
| C30 | Medium | Tests | Tests assert documentation prose and grep source text — editing a doc or refactoring an import breaks `npm test` | `src/commands/report.test.ts:183` | CONFIRMED |
| C31 | Medium | Docs | The always-loaded rule files and the openspec store name four dead pre-migration state paths | `.claude/rules/always/organicgrowth-rules.md` | CONFIRMED |
| C32 | Medium | Docs | Conductor doc/spec drift: the shipped no-arg onboarding is forbidden by its own command doc; two more spec contradictions | `.claude/commands/run-pipeline.md:10` | CONFIRMED |
| C33 | Medium | Docs | `/queue` doc says Brand filtering is a "future slice" — it shipped; doc also contradicts its own guardrail | `.claude/commands/queue.md:13` | CONFIRMED |
| C34 | Medium | Docs | README and CONTEXT.md name different video models; README Quickstart edits files that don't exist | `README.md:24` | CONFIRMED |
| C35 | Medium | Docs | Agent docs use flat `apify.trends_actor` keys; every real seeds file nests them per platform | `.claude/agents/trend-scout.md:32` | CONFIRMED |
| C36 | Medium | Alt paths | The agent-fallback cast can return `ok` with an empty or misaligned Cast (ids/urls diverge) | `src/space-driver/driver.ts:305` | CONFIRMED |
| C37 | Low | Boundary | `resolveBrand`/`scaffoldBrand` accept unvalidated slugs — path traversal from CLI args or `queue.json` | `src/brand/resolver.ts:100` | CONFIRMED |
| C38 | Low | DX | `parseJob` drops jobs with a bad phase/status/timestamp silently — unlike id/brand, which warn | `src/production-queue/store.ts:34` | CONFIRMED |
| C39 | Low | Correctness | Defensive parse can keep `lock.active_job` pointing at a dropped job — the Space reads busy forever | `src/production-queue/store.ts:51` | CONFIRMED |
| C40 | Low | DX | Unknown brand → raw `ENOENT` stack from `/report`; ledger readers throw where the queue reader defaults empty | `src/ledger/ledger.ts:46` | CONFIRMED |
| C41 | Low | Alt paths | The `import.meta.url === "file://" + argv[1]` direct-run guard fails on paths with spaces or symlinks | `src/commands/pick-cast.ts:123` | PLAUSIBLE |
| C42 | Low | Docs | ADR-0005 says both engineering agents run Opus; both agent files say Sonnet | `docs/adr/0005-…md:45` | CONFIRMED |
| C43 | Low | Correctness | The scaffolder invents unverified Instagram/LinkedIn Apify actor slugs the template deliberately leaves blank | `src/brand/scaffolder.ts:191` | PLAUSIBLE |
| C44 | Low | Incoherence | The one real off-niche seed is flagged in a YAML comment the checker cannot see (it needs an `OFF_NICHE:` prefix) | `data/brands/mundotip/seeds.yaml:8` | CONFIRMED |
| C45 | Low | Docs | All 10 W22 briefs end with the pre-ADR-0002 footer ("the Operator … shoots the Reel") | `data/brands/mundotip/ideas/2026-W22/` | CONFIRMED |
| C46 | Low | Docs | The `fit_basis` ledger field exists on every Idea but is documented nowhere | `data/brands/mundotip/ledger.json:18` | CONFIRMED |
| C47 | Low | Docs | `.env.example` points at a nonexistent seeds path and documents env overrides no code reads | `.env.example:7` | CONFIRMED |
| C48 | Low | Docs | Small doc nits: producer.md example omits the brand; stray tool markup in the spike doc; ADR-0001 stale path; developer/qa docs cite root paths | various | CONFIRMED |
| C49 | Low | DX | Small DX nits: `MagniticReadinessPort` typo; `production-queue/render.ts` collides with the domain word "render"; leftover `--max-old-space-size`; `queueCommand` untested; warn noise in test output | various | CONFIRMED |
| C50 | Low | Correctness | `brandExists`/scaffold guard treat any `stat` error (e.g. permission denied) as "does not exist" | `src/brand/resolver.ts:129` | CONFIRMED |

**Totals:** 2 Critical · 10 High · 24 Medium · 14 Low — 45 CONFIRMED, 4 PLAUSIBLE, 1 BLOCKED.

---

## 2. System map

### What this repo actually is

Two systems share one repo:

1. **A weekly content loop**, executed by *Claude agents following markdown instructions* (`.claude/agents/*`, `.claude/commands/*`), with human gates at Review, Cast pick, and Publish. State lives in plain files per Brand (`data/brands/<slug>/`) plus one global queue (`data/queue.json`).
2. **A TypeScript library** (`src/`) of "deep modules" the agents are meant to call: pure logic (queue scheduler, protocol parser, spec validator, phase resolver, readiness classifier) with thin I/O shells, all built test-first against an in-memory **fake** Magnific Space.

### Real execution paths (as shipped)

- **Accept an Idea** → agent follows `review-ideas.md` → is told to call `enqueueOnAccept(...)` → a `cast` job lands in `data/queue.json`. *(Documented call signature is wrong — C7.)*
- **Produce** → in code: `worker.drain()`/`worker.tick()` → `SpaceSession` → `composeAndCast`/`pickAndRender` → `SpaceMcpPort`. **No production code, script, or agent invokes `drain`/`tick`, and no live implementation of `SpaceMcpPort` or `SpaceSession` exists** — the only implementations are the test fakes. The producer agent's own definition confines it to writing Spec files (C2).
- **Pick a Cast** → `npm run pick-cast <brand> <idea> <n>` → reads the Cast from the Brand ledger, prints the choice, enqueues a `render` job. *(The choice itself is written nowhere — C1.)*
- **Report / queue view** → `reportCommand` / `queueCommand`: genuinely read-only projections of ledger + queue. Sound.
- **Conductor** → `/run-pipeline` exists twice: as a markdown behavior spec for the agent and as an interactive CLI generator. They disagree (C32), and the CLI's live probes are hardwired placeholders (Magnific "always unreachable", Apify "always valid").

### Key invariants the code encodes (and mostly honors)

- One Space generation at a time (lock + scheduler) — sound *in a single process* (C3/C16 are the boundary).
- Gates never hold the Space; failures never block successors — sound in the scheduler's state machine.
- Ledger is the source of truth; the queue is derived — honored by write ordering (ledger first, then queue).
- Generate-never-publish; public-metrics-only; predicted (`fit_score`) vs measured (`performance_score`) kept as separate fields — honored everywhere inspected.

---

## 3. Coverage accounting

**Read line-by-line by the lead auditor (100%):** all 32 non-test `.ts` files under `src/` (every module in `brand/`, `commands/`, `execution-protocol/`, `ledger/`, `phase-resolver/`, `production-queue/`, `production-spec/`, `readiness/`, `space-driver/`, including the two fake fixtures), `package.json`, both tsconfigs, `data/queue.json`, `data/brands/mundotip/ledger.json` (head), `.env.example`, `.gitignore`, `.claude/permissions/producer-worker.json`, `.claude/agents/producer.md`, `.claude/commands/pick-cast.md`, `.claude/commands/run-pipeline.md`.

**Read by sweep agents (findings independently spot-verified):** README, CLAUDE.md, CONTEXT.md, ADRs 0001–0006, `docs/producer-spikes-results.md`, `docs/producer-worker-permissions.md`, all 9 command docs, all 6 agent docs, both rules files, `openspec/project.md` + all 10 durable specs, all 25 test files (524 tests), all templates, all mundotip data files, git history of `data/`.

**Commands run:** `npm test` (×2, clean-tree verified after), `npm run build`, `npm run report mundotip` (expected failure, verified), `git check-ignore -v`, `git log`/`git stash list`, `tsc` via the test script, read-only greps.

**Excluded (with reasons):** `openspec/changes/archive/` (historical records; only checked for current-doc references into them), `package-lock.json` (dependency integrity not in scope), `node_modules/`, `dist/` (verified gitignored and inert), the `stash@{0}` W23 smoke-test contents (explicitly discarded work; noted where it interacts with doc-coupled tests, C30).

**Blind spots (BLOCKED):**
- Live Magnific behavior — the real shapes of `spaces_state`/`spaces_run` responses, the ~1,900-char truncation, whether `Character #2`/node names match the live canvas. Would require live MCP calls (forbidden: credits/board mutation).
- Apify actor existence (`apify/facebook-posts-scraper` etc.) — network.
- Node 20 behavior of the test glob — no Node 20 toolchain available; intended check: `nvm exec 20 npm test` (C28).
- Interactive TTY run of the conductor CLI — code reading is conclusive for message ordering (C11); not executed interactively.
- Anything only observable in the Claude-agent runtime (how agents actually invoke library functions).

---

## 4. Findings

### 4.1 Correctness

**C1 · Critical · CONFIRMED — The Operator's Character pick is never persisted and cannot reach the render.**
`pickCastCommand` (`src/commands/pick-cast.ts:77-103`) loads the Cast, computes the chosen identifier via `selectCharacter`, prints it, and enqueues a `render` job — and that is all. The chosen Character is written to neither the ledger nor the queue job (`QueueJob` has no such field, `src/production-queue/queue.ts:37-49`). Downstream, the render needs it: `pickAndRender(port, state, character)` takes it as a parameter (`src/space-driver/driver.ts:411`), but the worker's seam `SpaceSession.start(job)` receives only `{idea_id, brand, phase, enqueued_at}`. The test fake papers over the hole with an injected `characterFor` option **defaulting to `"cast-1"`** (`src/space-driver/fixtures/fake-space.ts:301,371`). The ledger's `character` field is only written *after* the render, from the Space session's own claim (`worker.ts:264-271`).
*Failure scenario:* Operator runs `/pick-cast mundotip idea-2026-W22-01 4`. The output confirms Character `cast-4`. Any process restart, or simply the render job being picked up later, has no way to know `cast-4` was chosen; a live session would have to invent one. Gate 2 — the entire point of the pause — is decorative in the code path. `pick-cast.md:18-26` explicitly claims "The pick is recorded in Brand's ledger … records the pick", which is false.
*Fix:* persist the pick at pick time — either a `character` field on the render `QueueJob` (widen the job contract) or a `character` field written to the ledger Idea at pick time (and have the render session read the ledger). Update `pick-cast.md` to match whichever is chosen.

**C3 · High · CONFIRMED — A crash while a job is `running` deadlocks the queue forever.**
`drain()` persists the `running` state and the held lock *before* starting the Space op (`worker.ts:180-181`), with no try/catch: if `space.start(job)` throws, the file says running+locked but nothing is in flight. The same end-state results from any process exit between start and reap. On the next process, `SpaceSession` is a fresh in-memory object: `tick()` calls `poll()`, gets `null` ("still running"), and returns without reaping — forever (`worker.ts:194-197`). `nextReady` returns `null` while the lock is held (`scheduler.ts:59-61`). There is no timeout, no lease, no `unlock`/`requeue` command, and no test for restart recovery.
*Failure scenario:* laptop sleeps mid-cast-gen; session dies. Every future drain/tick is a no-op; every accepted Idea queues behind a phantom job until someone hand-edits `data/queue.json`.
*Fix:* on startup/tick, detect a `running` job with no in-flight session op and reset it to `queued` (or `failed` with a notification); wrap `space.start` in try/catch that rolls the transition back; add an operator-facing `requeue` escape hatch.

**C4 · High · CONFIRMED — Failed jobs are dead ends that also block their Idea.**
`markFailed` keeps the job in the queue "for the Operator to see" (`scheduler.ts:139-145`), but: `enqueue` is idempotent per *idea* via `hasJobFor`, which matches any phase and any status (`queue.ts:69-71,91-93`) — so a failed cast job makes re-accepting/re-enqueueing that Idea a silent no-op; `enqueueRender` likewise refuses while a failed render job exists (`queue.ts:126`). No function removes or requeues a job, and the phase resolver counts a failed job as "live", so the Idea is not even reported stranded (`src/phase-resolver/resolve.ts:135`).
*Failure scenario:* one transient Space failure on `idea-…-03` → the notification fires once, and the Idea can never be produced again without hand-editing `queue.json`. `/run-pipeline resume` won't re-enqueue it either.
*Fix:* add a `requeueFailed(ideaId)` transition (or make `hasJobFor` ignore `failed`/`done` jobs), and make the phase resolver treat an accepted Idea whose only job is `failed` as stranded.

**C6 · High · CONFIRMED (collision trigger PLAUSIBLE) — The global queue is keyed by `idea_id` alone.**
Idea ids follow `idea-<run>-<nn>` with no brand component (`templates/idea-brief-template.md:2`), and multi-brand support is shipped. Dedupe (`hasJobFor`, `queue.ts:69`), enqueue idempotency (`queue.ts:91`), transitions (`indexOfJob`, `scheduler.ts:74`), and the lock (`lock.active_job` is a bare idea id) all ignore `brand`.
*Failure scenario:* two Brands both accept `idea-2026-W30-01`. The second `enqueueOnAccept` returns `already-queued`; that Brand's Idea silently never produces. Transitions could also target the wrong Brand's job.
*Fix:* key everything on `(brand, idea_id)` — or bake the brand into the id scheme and document it.

**C10 · High · CONFIRMED — The driver's poll loops cannot survive a real Space.**
`pollEdit`/`pollRun` poll up to `MAX_POLLS = 50` times with *zero delay* between polls (`driver.ts:126-144`), then declare failure. Against the fake (terminal on the second poll) this is fine; against a live op that takes minutes, 50 instantaneous polls elapse in milliseconds — every real run/edit would "fail" while also hammering the API. `port.ts:22-24` states polling is the driver's job, so this is not deferred-adapter territory.
*Fix:* injected sleep/backoff between polls and a time-based (not count-based) budget.

**C12 · High · CONFIRMED — mundotip defaults silently capture other Brands.**
`DEFAULT_LEDGER_PATH = "data/brands/mundotip/ledger.json"` (`ledger.ts:38`) and `DEFAULT_BRAND_PROFILE_PATH = …/mundotip/…` (`brand-profile.ts:22`) are the fallbacks in `enqueueOnAccept` (`enqueue-on-accept.ts:77`) and `composeSpec` (`compose.ts:59`).
*Failure scenario:* `enqueueOnAccept("idea-x", "acme")` — a plausible call, and exactly what `review-ideas.md` implies (C7) — authorizes acceptance against *mundotip's* ledger while stamping `brand: "acme"` on the job: wrongly refused (`unknown-idea`) in the good case, wrongly approved via a colliding mundotip id in the bad case. All defaults are also cwd-relative, so running any command outside the repo root reads/creates files elsewhere.
*Fix:* remove the brand-scoped defaults; require explicit paths (or a brand argument) at every I/O boundary. These constants were labeled "transitional" for issue #19 and have outlived the transition.

**C14 · Medium · CONFIRMED (path) — A finished Space op can be silently discarded.**
`tick()` with a terminal `result` but no `running` job in the loaded queue drops the result on the floor with the comment "already reaped" and just drains (`worker.ts:200-205`). If the queue save failed after start (C15's sibling window) or was hand-edited, a completed render's `asset_url` is lost without any notification — contradicting "failure is never fabricated *or hidden*" intent.
*Fix:* notify the Operator when a terminal result cannot be attached; log the orphaned outcome.

**C15 · Medium · CONFIRMED — Reap write-ordering has no failure handling.**
`reapCast`/`reapRender` write the ledger first, then save the queue (`worker.ts:246-273`), with no try/catch. `poll()` has already consumed the session's terminal result (`fake-space.ts:348-355` models exactly this). If `writeCast`/`writeAsset` throws (deleted brand dir, permission error), the queue still says `running`, the lock is still held, and the result is gone → the C3 deadlock, this time with the Asset lost too. Also, the transitions' `.ok` is never checked in the reap paths.
*Fix:* make `poll()` results re-deliverable until acknowledged, or write queue+ledger under a try/catch that marks the job `failed` with a notification.

**C21 · Medium · CONFIRMED — Readiness reads a baseline field that has never existed.**
`run-pipeline.ts:561` looks for `baseline.value: number`. Every producer and consumer of the baseline uses per-metric medians `{shares, comments, reactions, views, updated_at}` — the real ledger, `templates/brand-skeleton/ledger.json`, `buildEmptyLedger` (`scaffolder.ts:249-261`), and `performance-tracker.md`.
*Failure scenario:* even after `/track-performance` fills the baseline, the conductor computes `baseline = null` and emits "No Channel performance baseline exists yet" on every launch, forever. Three different notions of "baseline" now coexist (readiness `number`, report `updated_at`-only, tracker per-metric medians).
*Fix:* pick one baseline shape (the tracker's medians are the real one) and derive the readiness boolean from `updated_at !== null`.

**C22 · Medium · CONFIRMED — The Brand's display name is thrown away.**
The interview asks for "the Brand name", derives the slug, then builds the profile with `name: slugHint ?? finalSlug` (`run-pipeline.ts:362`) — the typed name (`rawName`, line 226) is discarded. A brand named "Mundo Tip!" gets `channel.name: "mundo-tip"`. This contradicts the module's own "answers are taken verbatim" principle (`scaffolder.ts:10-12`) and the interview docstring (which also falsely claims the slug-hint path asks for a display name; it never does, `run-pipeline.ts:192-205`).
*Fix:* keep `rawName` and pass it as `answers.name`.

**C39 · Low · CONFIRMED — Defensive parsing can manufacture a permanent lock.**
`parseQueueState` drops malformed jobs but preserves `lock.active_job` verbatim (`store.ts:47-55`). A lock pointing at a dropped (or never-existing) job makes `spaceBusy()` true with nothing to release — same symptom as C3, reachable purely through a bad file.
*Fix:* null the lock when no job matches it (with a warning).

**C43 · Low · PLAUSIBLE — Invented Apify actor slugs for platforms nobody verified.**
`APIFY_ACTORS` hardcodes Instagram/LinkedIn actor slugs (`scaffolder.ts:191-204`) that `templates/brand-skeleton/seeds.yaml` deliberately leaves as `"..."` (unknown). A scaffolded LinkedIn Brand carries a possibly-nonexistent actor into trend research. Also, `scaffoldBrand` re-serializes the YAML, so all of the template's guidance comments are lost in scaffolded Brands.

**C50 · Low · CONFIRMED — Any `stat` error reads as "Brand does not exist".**
`brandExists` (`resolver.ts:121-132`) and the scaffold overwrite-guard (`scaffold-brand.ts:81-89`) catch all errors as "not found". Under a permission error, the conductor would offer to *create* a Brand that exists — and the scaffold's `cp` would then fail confusingly or clobber-merge.

### 4.2 Alternative paths ("holding it wrong")

**C16 · Medium · PLAUSIBLE — Two processes can both drive the Space.**
Every writer does load→mutate→save with no file locking (`enqueueOnAccept`, `pickCastCommand:99-100`, `worker.drain/tick`). The single-Space guarantee rests on `queue.json`'s lock *plus* `SpaceSession.inFlight()` — but the session is per-process memory. ADR-0004's own design (drain on accept triggers, tick hosted in `/loop`) implies at least two concurrent Claude processes touching the same file.
*Failure scenario:* an accept-triggered drain in session A and a tick-triggered drain in session B interleave between load and save: both see the lock free, both `markRunning`, both `start()` — two Space generations at once, and one save clobbers the other.
*Fix:* an atomic lock protocol (lockfile / `O_EXCL` sentinel / single-writer worker process).

**C27 · Medium · CONFIRMED — The programmatic conductor can spin forever.**
`runPipelineCommand`'s default `getInput` returns `""` unconditionally (`run-pipeline.ts:847`), and the resume/fresh re-prompt loop is the only uncapped loop in the file (`run-pipeline.ts:642-648`; name/language/platform are capped at 3).
*Failure scenario:* any caller (or test) invoking `runPipelineCommand(brand)` without `getInput` against a Brand with in-flight work hangs in a tight generator loop.
*Fix:* cap the loop like its siblings, or make the default `getInput` throw.

**C36 · Medium · CONFIRMED — The fallback cast path can succeed with nothing to show.**
`recoverViaAgent` returns `ok: true` with whatever `fetchCast(port, FALLBACK_CAST_IDS)` yields (`driver.ts:320-337`); `fetchCreations` drops unknown ids silently, and `fetchCast` maps to URLs without preserving alignment (`driver.ts:230-236`), so `castIds` and `castUrls` can diverge in length (the fake zips them by index at `fake-space.ts:362-365`).
*Failure scenario:* fallback fires, creations don't match the hardcoded ids → the worker records an *empty* Cast and `casting` status; `/pick-cast` then reports "pick <n> must be between 1 and 0". No error anywhere.
*Fix:* fail the op when the fetched Cast is empty; return `{identifier, url}` pairs instead of parallel arrays.

**C41 · Low · PLAUSIBLE — The CLIs can silently do nothing.**
All three CLI entries gate on `import.meta.url === \`file://${process.argv[1]}\`` (`pick-cast.ts:123`, `queue.ts:36`, `report.ts:152`, `run-pipeline.ts:898`). `import.meta.url` percent-encodes (spaces → `%20`) and resolves symlinks differently than `argv[1]`.
*Failure scenario:* repo checked out under a path with a space → `npm run pick-cast …` exits 0 having done nothing.
*Fix:* compare via `fileURLToPath(import.meta.url) === resolve(process.argv[1])` or use a tiny bin wrapper.

### 4.3 Incoherences

**C9 · High · CONFIRMED — The production driver implements the fake, not a Space.**
Two fake-only conventions live in *production* code: pin confirmation searches for a node whose value is literally `PINNED:<character>` (`driver.ts:357-360`) — a marker only `FakeSpace.edit()` writes (`fake-space.ts:122-127,173-182`); and the agent-fallback path fetches the hardcoded creation ids `cast-1…cast-6` (`driver.ts:250-257`) — the fake's own ids. Every driver test passes by construction; a live adapter satisfying `SpaceMcpPort` honestly would make `pinCharacter` always return `pin_unconfirmed` and the fallback always fetch nothing.
*Fix:* move both conventions behind the port (e.g. `port.verifyPinned(character)`, and have the fallback edit return the produced creation ids) so the contract is implementable live; keep the markers in the fake.

**C19 · Medium · CONFIRMED — Two naming schemes for the same Spec file.**
`specPathFor` builds `<ideaId>.spec.json` from the *ledger* id → `idea-2026-W22-01.spec.json` (`store.ts:21-27`), while the briefs on disk are `idea-01.md` and CLAUDE.md/producer.md promise `idea-NN.spec.json` beside them. store.ts's own docstring ("sitting beside the Brief (`<ideaId>.md`)") is false for real data.
*Failure scenario:* the producer agent writes `idea-01.spec.json` per its instructions; code using `specPathFor` looks for the long name, misses it, and re-composes or reports it missing.
*Fix:* one convention, asserted by a test against the real mundotip tree.

**C20 · Medium · CONFIRMED — The deleted legacy folder is one default away from coming back.**
`DEFAULT_IDEAS_ROOT = "ideas"` (`store.ts:15`), used by `composeSpec` (`compose.ts:58`). Commit `18571f6` removed the root `ideas/` folder as legacy drift. `saveSpec` mkdir-recursives, so a default-options call quietly recreates it — while defaulting the brand profile to *mundotip's* (mixed scopes in one defaults set). Latent (no production caller today — itself part of C2) but a landmine for the first caller.
*Fix:* default to nothing — require `ideasRoot` explicitly, or derive it from a required brand argument via the resolver.

**C24 · Medium · CONFIRMED — The queue never learns the Cast gate cleared.**
The lifecycle gives a cast job no transition out of `awaiting_cast` (`scheduler.ts:19,126-128`): the pick enqueues a *new* render job and the old cast job sits at `awaiting_cast` permanently, even after the Idea is `produced`/`posted`.
*Failure scenario:* weeks later, `/queue mundotip` still lists `idea-…-01 [cast] awaiting_cast` for a published Reel; an Operator (or the conductor's gate detection in a future slice) reads a gate that doesn't exist.
*Fix:* `markCastConsumed` (→ `done`) invoked by `/pick-cast`, or make `/queue` render `awaiting_cast` jobs whose Idea has advanced as completed.

**C44 · Low · CONFIRMED — The off-niche convention watches the wrong channel.**
`check-config.ts:142` detects `OFF_NICHE:` inside the URL string; the only real off-niche seed is annotated in a YAML *comment* (`data/brands/mundotip/seeds.yaml:8`), which parsing discards. The advisory the mechanism exists for never fires on the only data that needs it. *(Also: `run-pipeline-readiness.ts:104` re-derives this count from raw seeds, and a non-string seed entry throws — see C26.)*

*(Related naming incoherence — `production-queue/render.ts` is a text formatter while "render" domain-wide means producing the Asset — is bundled in C49.)*

### 4.4 Affordance mismatches

**C23 · Medium · CONFIRMED — `/pick-cast` reports work it did not do.**
The success message always says "picked Cast member n — Character X … render queued" (`pick-cast.ts:102`) even when `enqueueRender` was an idempotent no-op (a render job already exists — queued, done, or failed), and there is no status guard: an Idea already `produced` or `posted` (its `cast` is still on the ledger) accepts a "pick" happily.
*Failure scenario:* Operator picks 2, changes their mind, picks 5 — output confirms Character 5 and a queued render; in reality nothing changed and (per C1) not even the first pick was stored.
*Fix:* branch the message on `enqueueRender`'s effect; refuse picks unless the Idea is `casting`.

**C25 · Medium · CONFIRMED — `fresh` is a label, not an action.**
Choosing `fresh` sets a local flag and prints "Starting a fresh weekly Run" (`run-pipeline.ts:667-670`) — no queue jobs are cleared, no `casting`/`accepted` Ideas are archived or reset. The next invocation detects the same in-flight work and asks again. The Gate-1 confirmation also asserts "Accepted Ideas have been enqueued for production" (`run-pipeline.ts:696`) regardless of whether anything was accepted or enqueued.
*Fix:* either make `fresh` actually archive/reset (destructive — needs a confirm), or rename the choice to what it does ("ignore and start Gate 1").

### 4.5 Missing functionality

**C2 · Critical · CONFIRMED — Nothing can actually produce.**
Four independent absences compound into "the core workflow is impossible as shipped":
1. **No live `SpaceMcpPort`/`SpaceSession` adapter exists** — grep confirms the only implementations are test fakes (`port.ts:15-21` says the live adapter "is deferred to the worker slice"; the worker slice shipped without it).
2. **No production code or script ever calls `drain`/`tick`** — `worker.ts` is imported only by the fake fixture and tests; there is no CLI entry, no npm script, no cron/loop host.
3. **No production code calls `composeSpec`** — the Spec-composition shell (`compose.ts:54`) has zero callers outside tests; the producer agent doc tells the agent to compose Specs but its "This slice's job" section (`producer.md:48-50`) explicitly stops there.
4. **The unattended-permission story is fiction** — `.claude/permissions/producer-worker.json` uses a schema (`mode: allowlist`, `magnific:spaces_edit`, `auto_approve`, `scope.space`) that no tool reads; Claude Code permissions live in `settings.json` `permissions.allow` with `mcp__<server>__<tool>` rules. The spike-identified blocker (auto-denied `spaces_edit`/`spaces_run`, `docs/producer-spikes-results.md`) is therefore still unsolved, while `docs/producer-worker-permissions.md:24-32` claims it is what "lets `drain` and `tick` run … unattended".
Meanwhile `run-pipeline.md:38-45` promises "the conductor auto-drains the Production Queue … generating character images unattended" and pick-cast.md promises an unattended render — and the CLI conductor's default Magnific probe hardcodes `accessible: false` (`run-pipeline.ts:145-151`), so even *its* production phase is permanently blocked.
*Failure scenario:* the Operator does everything right — accepts Ideas, waits. Nothing ever moves to `casting`. This is exactly the on-disk state of mundotip today (5 Ideas `accepted` since 2026-05-31, queue empty, zero `.spec.json` files).
*Fix:* build the live adapter + a worker entry point (a `npm run tick`/`drain` command hosted by `/loop` or a daemon), wire real ports into the conductor's `main()`, express the permission allowlist in real `settings.json` syntax, and update `producer.md` to own the whole flow — or, until then, rewrite the docs to say production is manual/not yet wired.

**C18 · Medium · CONFIRMED — The validator guards half the contract.**
`contract.ts` (and `producer.md:58-63`, CONTEXT.md) define per-clip rules: `id`, `clip_id`, `concept_title`, a Pixar-3D `image_prompt` **ending with `Aspect Ratio 9:16.`**, a `video_prompt`. `validate()` checks only array counts, `post_copy`, and `thumbnails` (`validate.ts:85-171`) — clip *contents* are never inspected; `clips: [1, 2, 3]` validates.
*Failure scenario:* an LLM-drafted Spec (the declared future) with a malformed clip sails through the "bad Specs never reach the Space" gate and wastes the run/credits the gate exists to protect.
*Fix:* validate clip shape and the aspect-ratio suffix (`ASPECT_RATIO_LINE` is already exported and unused by the validator).

*(C4 — no failed-job recovery — is also a missing-functionality finding; detailed under Correctness.)*

### 4.6 Boundary & safety

**C5 · High · CONFIRMED — Private exports have a documented path straight into git.**
Source → sink: CLAUDE.md ("Meta Content export (in `data/your-data/`)"), `.claude/rules/always/data-handling.md` rule 3, and `performance-tracker.md`'s example all direct the Operator to `data/your-data/` — the *pre-migration root path*. `.gitignore` covers only `data/brands/*/your-data/*` (line 7). Verified: `git check-ignore data/your-data/export.zip` matches nothing.
*Failure scenario:* Operator follows the always-on rule file literally, drops a Meta export (may contain non-public Insights) at the root path, runs `git add -A` — private data is committed and pushed. History is currently clean (verified); the trap is armed, not sprung.
*Fix:* add `data/your-data/` to `.gitignore` *and* fix the three docs to the per-brand path.

**C13 · Medium · CONFIRMED — The canonical files have no crash-safety and no parse guard.**
All persistence is a direct `writeFile` (no temp-file + rename): `store.ts:76`, `ledger.ts:220,301,363`, `scaffold-brand.ts:107-115`. All readers `JSON.parse` unguarded: `ledger.ts:46,68,129,206,282,349`, `store.ts:68`. The ledger docstring's "Defensive on parse: unknown shapes never crash a Run" holds only *after* a successful parse.
*Failure scenario:* crash/power-loss mid-write truncates `ledger.json` — the declared source of truth — and every subsequent command dies with `SyntaxError: Unexpected end of JSON input` that names no file. (Data files are git-tracked today, which is the only real safety net.)
*Fix:* write-temp-then-rename helper for all three writers; wrap parses to fail with the *path* and a recovery hint.

**C17 · Medium · PLAUSIBLE — Results are matched to jobs by coincidence.**
`SpaceOpResult` carries no idea/job identifier (`worker.ts:62-89`); `tick()` binds it to "the job that is `running`" (`worker.ts:201`). Correct only while the ≤1-running invariant holds — precisely what C3/C16 undermine. A misbinding writes another Idea's Cast/Asset into the ledger with no error.
*Fix:* stamp `idea_id` into the op result at `start()` and assert it at reap.

**C37 · Low · CONFIRMED — Brand slugs are trusted wherever they arrive.**
`resolveBrand(slug)` joins the slug into paths unvalidated (`resolver.ts:100-110`); callers pass raw CLI args (`pick-cast.ts:113-119`) and raw `queue.json` contents (worker's `resolveLedger(job.brand)`). `slugify` exists but is only applied in the interview path. `resolveBrand("../..")` → repo root. Local, Operator-driven tooling, hence Low — but it is the tenancy boundary.
*Fix:* validate slugs (`/^[a-z0-9-]{1,64}$/`) inside `resolveBrand`.

### 4.7 Documentation

**C7 · High · CONFIRMED — The accept path's one instruction is wrong.**
`review-ideas.md:28` instructs: auto-enqueue "by calling `enqueueOnAccept(<idea-id>)`". The real signature requires `brand` as the second argument and `ledgerPath`/`queuePath` options for any non-default Brand (`enqueue-on-accept.ts:72-79`). Followed literally (tsx does not type-check at runtime — `brand` arrives `undefined`), the enqueued job has no brand and `parseJob` *silently drops it on the next load* (`store.ts:29-33`): the accepted Idea vanishes from the queue. With a brand but no `ledgerPath`, acceptance is validated against mundotip's ledger (C12).
*Fix:* document the full call — `enqueueOnAccept(ideaId, brand, { ledgerPath: resolveBrand(brand).ledger })`.

**C8 · High · CONFIRMED — The feedback loop's entry condition is self-contradictory.**
`track-performance.md:12,19` selects Ideas "with a post_url and status `tracking` or `scored`"; `performance-tracker.md:19,26` selects "`posted` or `tracking`". `/log-post` sets `posted` (`log-post.md:26`); **nothing in any doc or code ever sets `tracking`** (code writes only `casting`/`produced`, `ledger.ts:169-172`; the tracker doc jumps `posted → scored`). Under the command doc's filter, a freshly posted Idea is never selected — the documented feedback loop dead-ends at its first step. The `tracking` status in CLAUDE.md's lifecycle has no setter anywhere.
*Fix:* align both docs on `posted | tracking`; either give `tracking` a real writer or remove it from the lifecycle.

**C31 · Medium · CONFIRMED — The always-loaded rules bind agents to a dead layout.**
`organicgrowth-rules.md` rule 7 names `data/brand-profile.yaml`, `data/seeds.yaml`, `ideas/<run>/`, `data/ledger.json` — none exist post-migration (ADR-0006). `data-handling.md` rules 2–3 repeat `data/seeds.yaml` (with a wrong flat `apify.*` key shape) and `data/your-data/` (the C5 trap). CLAUDE.md itself contradicts its own State section twice ("Data sources" and pipeline step 1 use root paths). `openspec/project.md:23-25` grounds the *developer agent* in the same dead layout, and four durable specs still mandate writes to `data/ledger.json` / root `ideas/` (`production-queue`, `cast-render`, `report-surface`, `production-spec` specs) — the very store `qa` verifies against.
*Fix:* one sweep replacing every root state path with the `data/brands/<slug>/…` form; these files are loaded into every session, so drift here propagates into every future slice.

**C32 · Medium · CONFIRMED — The conductor's contract exists in three disagreeing versions.**
(a) `run-pipeline.md:10-12` — "`<brand>` is required — omitting it is an error", loop is for an *existing* Brand only; the code ships no-arg new-vs-existing prompting and unknown-slug brand creation (`run-pipeline.ts:441-539`), which the conductor *spec* requires. An agent obeying the command doc refuses a shipped feature. (b) The spec's in-flight rule ("phase neither research nor done") vs the code's deliberate exclusion of `review` (`run-pipeline.ts:614-617`, with an explanatory comment) — and `run-pipeline.md` step 4 omits `accepted` from its in-flight list though `accepted` triggers the prompt. (c) `brand-commands/spec.md` demands `/queue` without brand be a usage error in one requirement and show-all in another; code implements show-all.
*Fix:* regenerate `run-pipeline.md` from the current behavior; reconcile the two specs.

**C33 · Medium · CONFIRMED —** `queue.md:13-16` says per-Brand filtering/labeling arrives "in a future slice" — `queueCommand(brandFilter)` and `[brand]` labels shipped (issue #21); the doc's own Step 2 (`npm run queue`, no brand) contradicts its own "brand required" guardrail.

**C34 · Medium · CONFIRMED —** README:24 says video is generated by "Happy Horse" while CONTEXT.md's Production Spec section says "Veo 3.1" (the spike inventory saw "Nano Banana"/"Seedream" cast nodes and a "Veo" clip node — neither top-level doc matches it fully). README's Quickstart (69-71) also tells a new user to edit `data/brand-profile.yaml`/`data/seeds.yaml` (don't exist) and lists every weekly command without its required `<brand>` argument — five commands that would all be refused as written.

**C35 · Medium · CONFIRMED —** `trend-scout.md:32`, `performance-tracker.md:20,27`, `track-performance.md:21` read actor slugs from flat `apify.trends_actor`/`apify.post_actor`; both real seeds files and the template nest per-platform (`apify.facebook.trends_actor`). An agent following its doc finds no actor and (per always-rule 8) must stop the Run.

**C42 · Low · CONFIRMED —** ADR-0005 (accepted, lines 45/62) states both engineering agents run on Opus, "model: opus"; both `.claude/agents/developer.md` and `qa.md` declare `model: sonnet` (CLAUDE.md agrees with sonnet). The ADR was never amended.

**C45 · Low · CONFIRMED —** all 10 W22 briefs end "OrganicGrowth stops here. The Operator writes the caption and shoots the Reel." — the pre-ADR-0002 model. An agent reading a brief verbatim could conclude no production step exists for it. The current template footer is correct.

**C46 · Low · CONFIRMED —** `fit_basis` appears on every ledger Idea but in no template, no TypeScript projection, and no doc. All writers happen to preserve unknown fields via spread — schema drift nobody owns.

**C47 · Low · CONFIRMED —** `.env.example:7-9` says actor defaults "also live in `data/seeds.yaml`" (dead path) and offers `APIFY_TRENDS_ACTOR`/`APIFY_POST_ACTOR` overrides that appear nowhere else in the repo — dead documentation. (Notably, *zero* `process.env` reads exist in `src/`; env is consumed only by agents via Bash.)

**C48 · Low · CONFIRMED — grouped doc nits.** `producer.md`'s frontmatter example invokes `/pick-cast idea-2026-W22-01 2` without the required brand (the body has it right). `docs/producer-spikes-results.md:99-100` ends with literal `</content>`/`</invoke>` tool-call artifacts. ADR-0001:19 uses the root `data/your-data/` path (and is cited by README/CLAUDE.md as current). `developer.md:72,85` and `qa.md:57` cite `data/ledger.json`/root `ideas/` in their binding instructions.

### 4.8 Developer experience

**C11 · High · CONFIRMED — The interactive conductor is unusable interactively.**
`main()` runs `runPipelineCommand`, which *collects* every turn and returns them; messages print only after the generator finishes (`run-pipeline.ts:881-896`). During the session the user sees bare prompts — "resume or fresh? (type 'resume' or 'fresh')" — while the context that explains them ("In-flight work detected…", the Brand list, readiness findings, gate instructions) is withheld until the end and then dumped at once.
*Fix:* print each turn's `message` before requesting its input (stream the generator in `main()` instead of using the collecting wrapper).

**C26 · Medium · CONFIRMED — Readiness misdiagnoses broken YAML and crashes on odd seeds.**
`runReadiness` maps *any* read/parse error to an empty config (`run-pipeline-readiness.ts:73-87`), so a `brand-profile.yaml` with a syntax error is reported as "niche is not set / voice is not set" — the Operator is sent to edit fields, not to fix line N. And `seeds.seed_pages` is cast to `string[]` unvalidated; a `null`/numeric entry makes `p.startsWith` throw (`:104`), crashing the conductor — against the repo's own defensive-parsing rule.
*Fix:* distinguish ENOENT from parse errors (report the YAML error verbatim); filter seeds to strings.

**C28 · Medium · BLOCKED — The declared Node floor probably can't run the tests.**
`engines: ">=20"` but the test script passes the quoted glob `"src/**/*.test.ts"` to `node --test` (`package.json:12`); glob resolution for test-runner positionals landed in Node 21. On Node 20 the runner should treat it as a literal missing file. Not confirmable here (host has Node 22 only); intended check: `nvm exec 20 npm test`.
*Fix:* raise `engines` to `>=21`/`>=22`, or pass the files via a discovery-compatible invocation.

**C29 · Medium · CONFIRMED (executed) —** `report.ts:144` prints `usage: npm run report <brand>`; `npm run report mundotip` fails with `Missing script: "report"`. `run-pipeline` has no script either — the two commands users are most likely to reach for are the two not wired into `package.json` (only `queue` and `pick-cast` are).
*Fix:* add the scripts (they're one line each) or fix the usage strings.

**C30 · Medium · CONFIRMED — `npm test` breaks when documentation is edited.**
`report.test.ts:183-264` asserts prose in CLAUDE.md and nine `.claude/**.md` files; `producer-agent.test.ts` asserts `producer.md` front-matter and wording; `run-pipeline.test.ts:626-667` regex-greps `run-pipeline.ts`'s *source text* for import statements. Consequences: fixing the doc drift in this report (C31/C32/C33) may fail the suite from test files nobody would associate with docs; a behavior-preserving refactor (renaming an import) fails AC7/AC8; and popping the known `stash@{0}` producer.md rewrite may immediately break `producer-agent.test.ts`. Doc-conformance checks belong in a separate, clearly-named suite (or `openspec validate`), not interleaved with unit tests.

**C38 · Low · CONFIRMED —** `parseJob` warns when dropping a job for missing `idea_id`/`brand` but silently drops for invalid `phase`/`status`/`enqueued_at` (`store.ts:34-36`) — a hand-typo'd status makes a job vanish from `/queue` with no trace.

**C40 · Low · CONFIRMED (executed) —** `/report nosuchbrand` → `/report failed: Error: ENOENT: no such file or directory, open 'data/brands/nosuchbrand/ledger.json'` — a raw errno where "unknown Brand (run `/queue --all` to list)" belongs. Asymmetry: `loadQueue` maps ENOENT→empty queue while `loadIdeas`/`loadReport` throw; neither contract is pinned by a test. All CLI catches use `String(err)`, discarding stacks.

**C49 · Low · CONFIRMED — grouped DX nits.** Exported interface typo `MagniticReadinessPort` (`run-pipeline-ports.ts:26`). `production-queue/render.ts` (a *text formatter*) collides with the domain's central verb "render". `--max-old-space-size=8192` on a 1.2-second suite (`package.json:12`) is leftover. Three `console.warn` lines leak into test output. `queueCommand` and its arg parsing have no test; `sortFindings`' 3-level ordering has no direct test; `isoWeek` has no ISO-year-boundary case (W52/W53/Jan-1). `harness.test.ts` and `resolver.test.ts:129-137` (constants equal themselves) inflate the pass count. No `lint` script exists (only tsc).

---

## 5. Design tensions

1. **Two conductors, no owner.** The weekly loop is specified twice — as agent behavior (`.claude/commands/*.md`) and as a typed CLI (`src/commands/run-pipeline.ts`) — and the two have already diverged on onboarding, in-flight rules, and readiness probes (C32, C2). Every future slice pays this tax twice. Decide which surface is canonical (most likely: agents call the CLI/library and the markdown shrinks to invocation notes), and enforce it with a conformance test rather than prose.
2. **The queue's job contract is too thin for the workflow it serializes.** A `QueueJob` is `{idea_id, brand, phase, status, enqueued_at}` — no chosen Character (C1), no Spec reference, no correlation id (C17), no attempt count (C4), no owner/lease (C3/C16). Each gap is being papered over with side-channels that don't exist yet. Widening the job record (or moving per-Idea production state into the ledger and making jobs pure pointers) resolves five findings structurally.
3. **A cross-process mutex made of a JSON field plus process memory.** The single-Space invariant is enforced half in `queue.json` (`lock.active_job`) and half in a per-process object (`SpaceSession.inFlight`), with non-atomic read-modify-write around both. That construction cannot survive the deployment ADR-0004 itself describes (accept-triggered drains + a `/loop`-hosted tick). Either a real lockfile protocol or a single-writer worker process is needed; the current design will work right up until it matters.
4. **Testing against a fake the production code helped write.** The driver embeds the fake's own conventions (`PINNED:`, `cast-1…6` — C9), so the hermetic suite proves driver-and-fake agree with each other, not that either matches Magnific. The port needs a contract sourced from live captures (record/replay fixtures from a one-time sanctioned live read), with all fake-isms confined to the fake.
5. **Multi-tenancy was retrofitted and the seams show.** Brand routing was added (issues #19–21) but the id scheme is brand-blind (C6), mundotip defaults linger at every I/O boundary (C12, C20), and the tenancy boundary (`resolveBrand`) doesn't validate its input (C37). Either finish the migration — composite keys, no brand-scoped defaults, validated slugs — or accept single-brand and say so.

---

## 6. Expectation gaps ("expected X, found Y")

- Expected `/pick-cast` to record the pick (its doc says so) → found it only prints it (C1).
- Expected accepting an Idea to auto-produce ("the producer drains the queue in the background") → found nothing that can run a Space: no adapter, no worker host, no permission path (C2).
- Expected `failed` jobs to be retryable ("failure is isolated") → found isolation means *abandonment* (C4).
- Expected "defensive on parse: never crash a Run" → found any truncated JSON file crashes every command with a bare `SyntaxError` (C13).
- Expected the readiness check to notice a real baseline → found it reads a field (`baseline.value`) that has never existed (C21).
- Expected `/queue` to show the current truth → found cleared Cast gates displayed as pending forever (C24).
- Expected `fresh` to start fresh → found it changes nothing on disk (C25).
- Expected the repo-recommended export location to be git-safe → found root `data/your-data/` commits (C5).
- Expected `npm run report` (the tool's own usage line) → found `Missing script` (C29).
- Expected editing a markdown doc to be test-neutral → found `npm test` asserts doc prose (C30).

---

## 7. What held up

- **The scheduler's state machine** (`scheduler.ts`): FIFO by injected timestamp, lock release at gates and on failure, `space_busy`/`unknown_job`/`invalid_transition` refusals, the two-jobs-per-Idea targeting fix — correct against its stated contract and thoroughly tested.
- **The Execution Protocol parser** (`parse.ts`): by-name resolution with the unique-name guard, exhaustive stable error codes, collects-all-failures semantics. Clean.
- **The brand-safety scanner** (`brand-safety.ts`): Unicode-aware whole-word boundaries (`(?<![\p{L}\p{N}])…`), regex escaping, field-path reporting. Careful work.
- **Spec generator/validator round-trip**: the generator provably emits only validator-passing Specs (shared constants), code-point-safe truncation, grapheme-cluster emoji counting — within the validator's (incomplete, C18) scope, solid.
- **The phase resolver and readiness classifier**: pure, deterministic, priority logic and phase-scoped gating match their specs exactly.
- **Test hygiene**: 524/524 pass in ~2s; every filesystem test uses `mkdtemp` + cleanup; two full runs left the tree byte-clean; no `.env` needed (zero `process.env` reads in `src/`); `dist/` inert and ignored.
- **Data integrity today**: ledger ⇄ brief cross-reference is 10/10 exact; all timestamps ISO-8601; queue file byte-matches `emptyQueue()`; git history contains no private data; tsconfig strictness matches CLAUDE.md's claims exactly.

---

## 8. Open questions (need a maintainer, not the code)

1. **What is the intended host for the worker?** ADR-0004 and `worker.ts` gesture at `/loop` as the tick host, but nothing invokes `drain`/`tick`. Is a daemon/CLI planned, or is the producer *agent* meant to call these functions ad hoc via `tsx`?
2. **What is the real permission mechanism** for unattended `spaces_edit`/`spaces_run`, given `.claude/permissions/producer-worker.json` is in a format Claude Code does not read? Was it ever exercised?
3. **Which conductor is canonical** — `run-pipeline.md` (agent behavior) or `run-pipeline.ts` (CLI)? The answer decides which side of every C32 divergence is the bug.
4. **Where should the Character pick live** — on the render `QueueJob`, or as a ledger field written at pick time? (C1 needs one of the two.)
5. **Is the idea-id scheme guaranteed brand-unique** by some convention not written down (e.g. one Brand per ISO week), or is C6 a real multi-brand collision risk?
6. **Which status filter is right for `/track-performance`**, and is the `tracking` lifecycle status supposed to have a writer, or should it be removed from the lifecycle?
7. **Which video model is actually wired** in the Space — "Happy Horse" (README) or "Veo 3.1" (CONTEXT.md)?
8. **Is the stashed producer.md rewrite** (`stash@{0}`) the intended future of the producer agent? If so, note that `producer-agent.test.ts`/`report.test.ts` pin the current wording (C30).

---

*Report generated by a full-repo adversarial audit on 2026-07-07. Left uncommitted by design.*
