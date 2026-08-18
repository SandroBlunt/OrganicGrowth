## Why

`runPipelineCommand` (`src/commands/run-pipeline.ts`) only ever printed readiness output when a
`block`-severity Finding was present that run. Its own comment said so plainly: the conductor is
"SILENT when all findings are advisory-only." An `advisory` Finding is computed correctly by
`runReadiness` — pushed into the returned array, sorted, deduplicated — and then simply never reaches
the Operator unless some unrelated `block` Finding happens to co-occur the same launch. A warning
nobody ever sees is indistinguishable from no check existing at all.

This was found live, during QA of issue #253 (a Facebook actor-slug advisory shipped invisible). #253's
own QA Round 1 defect reproduced it, and #253's fix closed the gap for exactly two Finding `code`s
(`apify_actor_not_found:*` / `apify_actor_unreachable:*`) via a narrow, named carve-out
(`isActorExistenceFinding`) — deliberately, explicitly leaving the general case alone (see #253's own
"Round 2 addendum" and "Known limits," and its QA Round 2 Verdict's own informational note flagging the
carve-out as a hand-maintained, non-compiler-enforced list). Seven other advisory `code`s predate #253
and share the exact same defect: `space_inaccessible_advisory`, `credits_low_advisory`, `null_baseline`,
`off_niche_seed`, `niche_unset`, `config_todo`, `voice_unset`, `empty_banned_words` (from
`src/readiness/classify.ts` and `src/readiness/check-config.ts`). One of them left a visible scar: the
pre-existing `run-pipeline.test.ts` "C21" test ("still shows the no-baseline advisory…") had to **force**
an unrelated research block (an invalid Apify token) purely so the `null_baseline` advisory would have
something to ride alongside and become observable — a test shaped around a defect, not around the
behaviour anyone actually wants.

This change closes the general case: the two-code carve-out is replaced with the same rule applied to
every Finding, so no future advisory code needs to be added to a hand-maintained allow-list to reach the
Operator.

## Decision: the conductor's advisory-print policy, argued

**Decision: every readiness Finding the conductor computes is printed, unconditionally — `block` and
`advisory` alike — and the readiness output is silent ONLY when there are literally zero Findings (a
fully healthy Brand and healthy probes).** Printing is fully decoupled from blocking: whether a Finding
is shown to the Operator no longer has anything to do with whether it — or any other Finding — has
`severity: "block"`. Blocking stays governed solely by `findingsBlockPhase`'s existing, unchanged,
severity-only check.

This was not assumed; the alternative (some findings suppressed as "too noisy") was considered and
rejected:

1. **A suppressed-but-computed advisory is the exact bug this ticket exists to close, one layer
   deeper.** Any rule that keeps some advisory codes silent by default reproduces "and nothing notices"
   for whichever codes are left out — exactly what happened to the seven codes #253 left untouched, and
   exactly the shape of gap the `null_baseline`-C21 test had already silently worked around. A policy
   that requires a human to notice a *new* advisory code needs adding to an allow-list is the same
   defect in a different shape — it just fails later, for the *next* advisory nobody thought to add.
2. **Every advisory Finding that exists today is already actionable and specific.** Reading through
   `classify.ts` and `check-config.ts`, each advisory names precisely what's wrong and where to fix it
   (a missing niche, an empty banned-words list, an unreachable Space, a stale actor slug, an unmeasured
   baseline) — none is generic noise. There is no evidence any of the eight advisory codes in the
   system today would be better left unseen. If a genuinely noisy advisory is ever added later, it can
   be redesigned (rate-limited, batched, or downgraded to a log line) at that point, on its own merits —
   that is a different, forward decision, not a reason to keep the CURRENT eight buried today.
3. **"Advisories always print, never block" is the simplest rule that removes the whole class of bug.**
   A rule keyed on severity alone — `block` prints (as `[BLOCK]`) and blocks; `advisory` prints (as
   `[WARN]`) and never blocks — needs no per-code list, no maintenance, and cannot silently regress when
   a new Finding `code` is added anywhere in `classify.ts` or `check-config.ts`: it is printed by
   construction, not by inclusion in a table someone has to remember to update. This is exactly the
   "mechanism that can't drift silently" #253's own QA Round 2 Verdict recommended for the follow-up.
4. **It is a real, visible change in what every run looks like — acknowledged, not hidden.** A Brand
   that has never yet had a performance baseline measured will now see a `[WARN]` line about it on every
   launch until one exists; a Brand with an empty `banned_words` list will see that noted every launch
   until it's filled in. This is the intended, honest behaviour: these are real, unresolved gaps in the
   Brand's setup, and the whole point of a readiness check is that the Operator sees them. The
   alternative — silence — is what let a dead actor slug (#253) and, before this ticket, seven other
   advisory conditions go unremarked indefinitely.

## What Changes

- **`runPipelineCommand`'s readiness-print branch is replaced.** It now prints every Finding in
  `runReadiness`'s returned (already sorted, already deduplicated) array — unconditionally — under the
  existing `"Readiness check:"` header, `[BLOCK]` for `severity: "block"`, `[WARN]` for
  `severity: "advisory"`. It is silent only when the array is empty. `findingsBlockPhase` (and every
  phase-scoped stop it drives) is untouched — advisories still never block any phase.
- **#253's narrow carve-out is deleted, not layered on top.** `isActorExistenceFinding`
  (`src/commands/run-pipeline-readiness.ts`) and its call site in `run-pipeline.ts` are removed — the
  general rule already covers the two actor-existence codes it singled out, so the carve-out is now
  dead code, not a second mechanism doing the same job.
- **The C21 test that forced an unrelated block is fixed to test the actual behaviour.** "still shows
  the no-baseline advisory when the ledger baseline has no updated_at" no longer injects an invalid
  Apify token to manufacture a block finding — it now asserts the `null_baseline` advisory prints on
  its own, with NO block finding present, which is the whole point of this ticket. Its sibling
  ("suppresses the no-baseline advisory…") is likewise simplified to use a plain healthy fixture.
- **Two pre-existing tests that asserted "no readiness output when healthy" are corrected to a
  genuinely healthy fixture.** Both used the default empty ledger (`baseline.updated_at: null`), which
  — under the OLD silent-when-advisory-only policy — happened to print nothing anyway (no block
  co-occurred), masking the fact that a `null_baseline` advisory was already being computed and
  swallowed for both fixtures. Both now supply a ledger with a baseline already measured, so "healthy"
  genuinely means zero Findings, not zero Findings printed.
- **New tests prove the general rule for the specific codes issue #260 names as still-silent**, each
  driving `runPipelineCommand` end to end and asserting on its printed `turns` (not `runReadiness`'s
  return value alone) — the exact blind spot #253's QA verdict identified: `null_baseline`,
  `empty_banned_words`, `niche_unset`, `voice_unset`, `config_todo`, `off_niche_seed`,
  `space_inaccessible_advisory` (alongside its own co-occurring `space_inaccessible` block),
  `credits_low_advisory` (alongside its own co-occurring `credits_low` block), plus a fully-healthy
  fixture proving the silent-when-zero-findings case still holds.
- **`.claude/commands/run-pipeline.md`** is corrected: it previously said readiness is "Only surfaces
  issues when there are blocking gaps," which was the exact stale, disproven claim.

## Spec delta scope

One MODIFIED Requirement (`run-pipeline-conductor`): the base readiness Requirement's print/silence
policy — title kept unchanged (`Readiness runs every launch, is silent when healthy, and surfaces gaps
with phase-scoped blocking` remains an accurate title once "healthy" means zero Findings), body and
Scenarios updated to the new unconditional-print rule.

One REMOVED Requirement (`run-pipeline-conductor`): "The conductor prints an actor-existence advisory to
the Operator even when it is the only finding present" (added by issue #253) — its behaviour is now
fully subsumed by the MODIFIED base Requirement above, so keeping both would leave the spec describing
the same guarantee twice, once narrowly and once generally.

The Requirement describing what `probeConfiguredActors` *computes* ("Readiness probes every configured
Apify actor slug for existence, reporting unreachable rather than failing hard") is untouched — this
change only affects what the conductor *prints*, not what `runReadiness` returns.

## Impact

- **Modified code:** `src/commands/run-pipeline.ts` (the print branch), `src/commands/
  run-pipeline-readiness.ts` (`isActorExistenceFinding` removed), `.claude/commands/run-pipeline.md`.
- **Modified tests:** `src/commands/run-pipeline.test.ts` — 2 existing tests corrected to a genuinely
  healthy fixture, 2 C21 tests rewritten to stop forcing an unrelated block, 1 existing advisory test
  strengthened to assert the `[WARN]` line itself (not just "the loop didn't stop"), plus a new describe
  block covering the seven previously-silent codes named in the issue.
- **Untouched:** `src/readiness/classify.ts`, `src/readiness/check-config.ts` (both stay pure — this
  change touches only how the conductor prints, never what it computes), `findingsBlockPhase`,
  `probeConfiguredActors`, every other production code path.
- **Hermetic, no live Space/Apify calls.** Every test injects a fake `MagnificReadinessPort`/
  `ApifyReadinessPort`; see this change's `handoff.md` for the explicit fake/fixture list.
- **Always-rules upheld:** advisories still never block a run (rule/ADR-0011 lifecycle untouched); no
  content generation, publication, or metrics fabrication is touched by this change.
