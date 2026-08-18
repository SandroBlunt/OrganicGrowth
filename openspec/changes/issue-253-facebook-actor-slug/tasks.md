## 1. Confirm the terrain before writing any code

- [x] 1.1 Re-verify the issue's own evidence stands: `apify/facebook-post-scraper` (singular) is a dead
  slug, `apify/facebook-posts-scraper` (plural) is the real one — trusted from the issue body's own
  curl transcript (hermetic build: no live Apify calls made by this agent).
- [x] 1.2 `grep -rn "facebook-post-scraper"` repo-wide (excluding `node_modules` and
  `openspec/changes/archive/`) to enumerate every live occurrence, both the `apify/...` slash form and
  the `apify~...` tilde form the URL-builder produces — the tilde form was NOT caught by the issue's own
  file list and needed a second pass.
- [x] 1.3 Read `src/apify/platform.ts` (`resolveApifyActor`), `src/commands/track-performance.ts` (the
  existing seeds.yaml→actor I/O pattern to mirror), `src/commands/run-pipeline-readiness.ts` +
  `run-pipeline-ports.ts` (the existing injected-port pattern `probeToken`/`probeSpace` already use) —
  ground the new actor-existence probe in the SAME pattern, not a new one.
- [x] 1.4 Read `src/readiness/classify.ts`/`check-config.ts` to confirm they are contractually PURE (no
  I/O) — decide the new probe belongs in the I/O shell (`run-pipeline-readiness.ts`), not either pure
  module.

## 2. Correct every live occurrence of the dead slug (test-first only where a live assertion depended on it)

- [x] 2.1 `data/brands/mundotip/seeds.yaml`, `data/brands/straw-motion/seeds.yaml` (committing the
  Operator's own uncommitted #195-session fix properly), `templates/brand-skeleton/seeds.yaml`.
- [x] 2.2 `src/brand/scaffolder.ts`'s `APIFY_ACTORS.facebook.post_actor` — the scaffolder's own doc
  comment now explains both actors are the SAME real slug, like YouTube's.
- [x] 2.3 `.claude/agents/performance-tracker.md`'s runbook (curl example + the `smoke.ts` usage line,
  now naming the new required `<brand>` argument).
- [x] 2.4 Every test/fixture asserting or exampling the dead slug: `scaffolder.test.ts` (the actual
  bug — a green test asserting a 404), `check-config.test.ts`, `track-performance.test.ts`,
  `platform.test.ts`, `request.test.ts` (both the slash-form inputs AND the tilde-form expected
  outputs), `client.test.ts` (same both-forms fix), `normalize-metrics.test.ts`.
- [x] 2.5 Doc-comment-only mentions: `normalize-metrics.ts` (3 comments, rewritten to say ONE real
  actor serves both purposes, not two actors with the same shape), `src/apify/live/request.ts`,
  `src/apify/fixtures/README.md`.
- [x] 2.6 The two live OpenSpec spec files with a worked example baking in the dead slug:
  `openspec/specs/apify-live-client/spec.md` (the Scenario), `openspec/specs/
  apify-platform-integration/spec.md` (the Requirement prose) — corrected directly, no delta (see
  `proposal.md`'s "Spec delta scope").
- [x] 2.7 `npx tsc -p tsconfig.json --noEmit` + run every touched test file directly — green.

## 3. `src/apify/actor-config.ts` — read a Brand's own configured actor slug (test-first)

- [x] 3.1 Write `actor-config.test.ts` first: resolves a configured slug; missing seeds.yaml → null;
  unparseable YAML → null; platform absent → null; `"..."` placeholder → null; no `apify` block at all
  → null. Every case defensive (never throws).
- [x] 3.2 Implement `loadConfiguredActorSlug` — thin I/O wrapper around the existing pure
  `resolveApifyActor`, mirroring `trackPerformanceCommand`'s private `loadApifyConfig`.
- [x] 3.3 Add `src/apify/actor-config.ts` to `src/fs-boundary/allow-list.ts`'s `NODE_FS_ALLOW_LIST`
  (same "hand-maintained seeds.yaml" category as `run-pipeline-readiness.ts`/`track-performance.ts`) —
  confirmed required by running `node-fs-guard.test.ts`, which fails on an un-audited new violator.
- [x] 3.4 Run `actor-config.test.ts` — green.

## 4. `src/apify/live/smoke-diagnose.ts` — distinguish actor-failure from no-data (test-first)

- [x] 4.1 Write `smoke-diagnose.test.ts` first: an `ApifyRequestError` produces a message naming the
  slug, the HTTP status/statusText, and a tilde-converted verification `curl` command, and the message
  must NOT read like a "no data for this URL" result; a non-`ApifyRequestError` (e.g.
  `ApifyTokenMissingError`, a plain `Error`, a non-Error thrown value) returns `null`.
- [x] 4.2 Implement `describeActorRequestFailure` — pure, no I/O.
- [x] 4.3 Run the new test — first run caught a REAL self-inflicted bug (the message's own clarifying
  sentence literally quoted the phrase `"no data for this URL"`, tripping the very assertion meant to
  prove it never reads that way) — fixed the wording, re-ran, green. Captured in `handoff.md`'s Build
  Report as the red→green transcript for this module.

## 5. `src/apify/live/smoke.ts` — resolve the actor from the Brand, distinguish the failure mode

- [x] 5.1 Rewrite `main()`: require `<brand> <facebook-post-url>` (two args now, Brand explicit — never
  a silent default, data-handling rule 2); resolve `brandPaths.seeds` via `resolveBrand`; resolve the
  actor via `loadConfiguredActorSlug(seedsPath, "facebook", "post_actor")`; report plainly and exit
  if unconfigured (never fabricate a fallback slug).
- [x] 5.2 Wrap the `scrapePost` call's catch block with `describeActorRequestFailure` — print its
  message and exit distinctly when non-null; re-throw (falling through to the existing generic
  top-level catch) when null.
- [x] 5.3 Update the module docstring's Run example and `.claude/agents/performance-tracker.md`'s usage
  line to the new two-argument form.
- [x] 5.4 `npx tsc -p tsconfig.json --noEmit` — smoke.ts is never run by `npm test` but must still
  compile clean.

## 6. Readiness — probe every configured Apify actor slug for existence (test-first, "decide and record")

- [x] 6.1 Write `proposal.md`'s "Decision" section BEFORE implementing (argues placement + severity, per
  the issue's own instruction to argue rather than assume).
- [x] 6.2 `ApifyReadinessPort` (`run-pipeline-ports.ts`) gains `probeActorExists(actorSlug):
  Promise<"ok" | "not_found" | "unreachable">` — a new required method, so BOTH existing fake ports
  (`run-pipeline.test.ts`, `run-pipeline-onboarding.test.ts`) fail to compile until updated. Captured
  the resulting `tsc` errors in `handoff.md` as the compile-time red proof.
- [x] 6.3 Fix both fakes (permissive `"ok"` default, matching `probeToken`'s existing permissive-default
  convention for a healthy fixture) — `tsc` green again.
- [x] 6.4 Implement `probeConfiguredActors` in `run-pipeline-readiness.ts`: gather every distinct,
  non-placeholder configured slug across all 4 platforms × 2 purposes (deduped so a shared slug like
  YouTube's is probed once), probe each via the injected port (catching a thrown probe to
  `"unreachable"`, never letting it crash `runReadiness`), and turn `"not_found"`/`"unreachable"` into
  a `severity: "advisory"`, `phase: "research"` Finding with a per-slug-unique `code` (never
  deduplicated across two different bad slugs by `runReadiness`'s existing seen-by-code merge).
- [x] 6.5 Wire `probeConfiguredActors` into `runReadiness`'s existing `Promise.all` probe batch and its
  findings-merge step.
- [x] 6.6 `DEFAULT_APIFY_PORT` (`run-pipeline.ts`) gains a deferred `probeActorExists` returning
  `"unreachable"` (honest "never checked," matching the live-adapter-deferred convention `probeToken`/
  `probeSpace` already established) — no gating consequence either way, since this probe never blocks.
- [x] 6.7 Write 5 new tests in `run-pipeline.test.ts` grounded in the REAL dead slug from the issue's
  own evidence: confirmed-not-found → non-blocking advisory naming the slug + usage; probe throws →
  `"unreachable"` advisory, distinct from not-found, still non-blocking; confirmed-OK → zero findings;
  no `apify` block configured → probe never even called; a slug shared by two purposes → probed exactly
  once, message names both usages.
- [x] 6.8 Full-suite proof the checks actually fail: temporarily short-circuited
  `probeConfiguredActors` to `return [];`, ran `run-pipeline.test.ts` — 3 of the 5 new tests went RED
  (the two that assert zero findings/zero probe-calls stayed green, correctly, since "no findings" is
  what a broken-and-disabled probe also produces) — restored, reran, green again. Transcript captured
  in `handoff.md`.

## 7. Full suite, build, self-review, Build Report

- [x] 7.1 `npm test` (baseline 3662/953/0 on `cdb68a0`) → 3677/956/0 (+15 tests, +3 suites — exactly the
  3 new test files/blocks added: `actor-config.test.ts` 6, `smoke-diagnose.test.ts` 4,
  `run-pipeline.test.ts`'s new describe block 5).
- [x] 7.2 `npm run test:docs` — green, no docs-test needed updating (no prose it pins referenced the
  dead slug verbatim; `performance-tracker.md`'s `tools:` Bash allow-list pattern is a wildcard,
  unaffected by the new `<brand>` argument).
- [x] 7.3 `npm run build` — clean.
- [x] 7.4 `openspec validate issue-253-facebook-actor-slug --strict` and `openspec validate --all
  --strict` — green.
- [x] 7.5 Self-review/simplify pass: confirm no dead code, confirm every acceptance criterion maps to a
  specific test (see `handoff.md`'s self-assessment table).
- [x] 7.6 Write the Build Report into `handoff.md`, explicitly flagging every fake used and confirming
  no live Apify/Magnific call was made.
