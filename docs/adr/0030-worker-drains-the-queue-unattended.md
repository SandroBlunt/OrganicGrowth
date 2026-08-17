# The worker drains the Production Queue unattended, partially reversing ADR-0008

**Status:** accepted — **supersedes, in part, ADR-0008** (`0008-producer-drives-the-space-attended.md`).
Operator decision recorded 2026-08-17, epic #195, issue #208.

ADR-0008 decided the `producer` drives the Magnific Space **attended**, in the Operator's own session,
and stated in as many words: *"No headless worker host, no unattended-permission wiring, no cross-process
lock."* That was a deliberate, considered choice at the time, for two stated reasons — Claude Code's
`auto`-mode permission classifier re-blocks Space mutations even when the tool is allow-listed, so an
unattended runtime could only clear that by running headless in a locked-down bypass mode; and the wired
Recipe's own Cast gate meant a human was present partway through every job regardless, so full automation
bought little. Neither reason holds universally anymore. Epic #195's build-out (issues #201–#207) landed
two things ADR-0008 predates: a SQL job table with a real atomic claim-with-owner-and-expiry (issue #203,
`docs/adr/0029`) — the "real lock" ADR-0008 itself said a cross-process worker would need — and a second
wired Recipe, *News Carousel*, that declares **zero** gates (a third, *News Short Script*, also declares
zero but is Space-less). ADR-0008's own justification ("a human is present partway through every job
regardless") was never true for either of them.

## Decision

- **A worker process drains the Production Queue with no human present**, for every wired Recipe that
  drives a Magnific Space (`producer/uses-space.ts`'s `usesSpace(recipe) === true` — today, *News
  Carousel* end to end, and *Character Explainer with Cast*'s resumed, post-pick leg). It is a plain Node
  process (`src/commands/run-worker.ts`'s `drainQueue`, composing `src/command-surface/worker.ts`'s
  `runOneJob`), started by the Operator and holding its **own** Magnific MCP credentials — it is not a
  Claude Code agent session, so Claude Code's `auto`-mode permission classifier (ADR-0008's own stated
  blocker) never applies to it in the first place.
- **The permission-classifier reason ADR-0008 gave does not bind this worker.** Nothing here disables or
  bypasses Claude Code's own safety gate — that gate simply does not sit between this process and the
  Magnific MCP tools, because the process is not a Claude Code agent turn.
- **The "a human is present anyway" reason no longer holds universally.** It is still true for the ONE
  gated wired Recipe (*Character Explainer with Cast*'s Cast gate) — the worker still pauses there
  exactly as before, releasing the Space (`awaiting_pick`, never claimable again by `claimJob` until a
  NEW job row is enqueued for the resumed leg — issue #203's own eligibility rule). It has never been
  true for *News Carousel*, which declares no gate at all.
- **Serialization is strictly-sequential processing, not a cross-process lock.** `drainQueue`'s own loop
  never starts a second job's `runOneJob` call before the current one reaches `done` / `awaiting_pick` /
  `failed`, so the Magnific Space's own one-generation-at-a-time constraint (ADR-0004) holds by
  construction. If more than one worker process is ever run concurrently against the SAME queue, the SQL
  atomic `claimJob` (issue #203, `docs/adr/0029`) is the arbitration primitive — this ADR does not
  introduce a second one; a genuinely concurrent multi-worker deployment is out of scope for now.
- **The attended `producer` content agent is UNCHANGED.** It still drives the Space interactively, in the
  Operator's own session, exactly as ADR-0008 described. This ADR adds a SECOND, parallel path — an
  unattended worker for the zero/single-gate wired Recipes — it does not remove or replace the first. The
  Operator may still choose to drive a Space by hand.
- **The Space-less *News Short Script* Recipe is out of scope for the worker** (`usesSpace(recipe) ===
  false`) — it has no Space for an unattended process to drive in the first place; nothing about it is
  decided here.

## Why

- The permission-classifier problem ADR-0008 cited is a fact about Claude Code's own `auto` mode, not
  about the Magnific Space itself — it never applied to a plain process holding its own credentials, only
  to an *agent session* attempting the same call. A worker sidesteps it by construction, not by disabling
  any safety gate.
- ADR-0008's "cross-process lock" cost argument is mooted by what already exists: issue #203 built exactly
  that lock (an atomic `UPDATE ... WHERE ... RETURNING` claim with owner + expiry, proven against
  genuinely concurrent OS processes) for an unrelated reason (fixing the file-based queue's own lost-
  update bug). Reusing it here is not new cost.
- Two of the three wired Recipes were built, after ADR-0008, specifically declaring zero gates
  (`recipe/registry.ts`'s `gates: []`) — the "human present anyway" argument was sound for the ONE Recipe
  that existed in 2026-07-10 and has not been sound for the other two since they were wired.

## Consequences

- **Nobody watches a render happen in real time on the unattended path — this is the real thing being
  given up.** The attended model's protective property was never just "a human approves the Magnific
  calls"; it was that the Operator could SEE a render happening — a garbled canvas, a wasteful loop, an
  obviously-wrong image — and stop or redirect it in the moment. On the unattended path, no one is
  watching. The two backstops that exist instead are narrower than that: the phase self-audits
  (`author`/`bind-media`/`copy`) catch a broken Production-Spec SHAPE, a missing REQUIRED Brand Asset, or
  a banned WORD — never a structurally-valid render that is simply visually wrong, off-brand in tone, or
  a low-quality generation the Space itself reports as "succeeded." Generate-never-publish (ADR-0002)
  catches nothing until a human later reviews the `produced` Asset before Publish — by which point Space
  credits are already spent and the render already exists. This ADR accepts that gap deliberately, for
  the two zero/single-gate wired Recipes, in exchange for throughput; it is not free, and a future
  Recipe with a higher visual-quality bar than News Carousel's should weigh this cost explicitly before
  being added to the worker's unattended path.
- **`docs/adr/0008` carries a forward-pointer to this ADR** (the repo's established pattern — see how
  ADR-0011 points at ADR-0028, and ADR-0014 at ADR-0029), rather than being silently contradicted.
- **`.claude/rules/always/organicgrowth-rules.md` rule 11 is rewritten, not merely appended to**, so it
  states ONE current, coherent rule: the attended path (Review, each Recipe's picks, Publish; the
  `producer` content agent drives the Space attended in the Operator's session) stays exactly as
  written, AND a separate, unattended worker now exists for the zero/single-gate wired Recipes, started
  by the Operator, holding its own credentials, self-auditing each phase, never publishing. A reader must
  not find two sentences in the same rule contradicting each other.
- **AC9-class live proof (one real Asset produced by the worker against the live Space) stays
  Operator-gated.** This ADR authorizes the decision; it does not itself constitute the live run, which
  issue #208's own Build Report documents as an explicit Operator action.
- **The file-based `data/queue.json`/`scheduler.ts` path is untouched.** The worker drains the SQL `job`
  table (issue #203/#205), not the file queue — this ADR does not change ADR-0006's global-queue layout
  or retire the file-based path, which the attended `producer` content agent still reads.
- **Generate-never-publish (ADR-0002) is unaffected.** The worker stops at a `produced` Asset; publishing
  stays a human act on either path, attended or unattended.
