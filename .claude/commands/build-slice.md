---
name: build-slice
description: "Run the autonomous engineering pipeline for ONE GitHub build slice: the developer implements it (OpenSpec, test-first, fake Magnific), qa verifies, and on pass it opens a PR for your one-click merge approval."
---

# /build-slice

Run the two-agent engineering pipeline that **builds the Producer feature code** for exactly one build
slice. Required arg: a **GitHub issue number** in repo `SandroBlunt/OrganicGrowth`. One issue per run →
one branch → one PR. This is **not** the weekly content loop; it builds the code, it does not run it.

## Steps

1. **Pre-flight — gate on the issue.** Refuse and stop with an explanation if **no issue number** is
   given. Otherwise fetch the issue (`gh issue view <issue#> --repo SandroBlunt/OrganicGrowth`). Refuse
   unless it is labeled **`ready-for-agent`**. Read its **"Blocked by"** references and verify **every**
   blocker is **closed/merged**; if any is still open, stop and list the open blockers. On any refusal,
   explain why and do nothing else — no branch, no agents.
2. **Branch off main.** Derive a slug from the issue title and create `<slice-N-slug>` off `main`
   (`N` = the issue number). The branch name is the **same** string as the OpenSpec change-id. All
   work for this slice lives on this one branch.
3. **Invoke the developer agent.** Hand it the issue. It authors the full **OpenSpec** change under
   `openspec/changes/<slice-N-slug>/` (proposal + `tasks.md` + spec deltas as Requirements with
   Scenarios), runs `openspec validate --strict`, then implements **test-first against the fake Magnific
   Space** (never the live Space), does one self-review/simplify pass, and writes its **Build Report**
   into the Slice Handoff at `openspec/changes/<slice-N-slug>/handoff.md` (what changed, files touched,
   how to run build/tests, an acceptance-criteria self-assessment mapping each criterion to the test that
   proves it, the fakes/fixtures used with the Magnific fake explicitly flagged, self-review notes,
   known limits).
4. **Invoke the qa agent.** It **reads, runs, and reports only** — it never edits product code. It runs
   the full test suite and confirms green, verifies the code satisfies **every acceptance criterion** of
   the issue, verifies the developer's OpenSpec spec **faithfully matches the issue** (catches a misread
   or self-consistent-but-wrong spec), confirms **no live-Space calls** exist (the fake is used), and
   confirms the always-rules hold in the built code (generate-never-publish, public-metrics-only,
   relative-not-absolute, explicit-attribution, ledger-as-source-of-truth). It **appends** its **QA
   Verdict** to the same Slice Handoff (overall pass/fail, per-criterion and per-scenario results, a
   defect list with severity and repro steps). Nothing already written is overwritten.
5. **On qa FAIL — bounded retry.** Hand the QA defects back to the developer, which fixes and resubmits;
   re-run qa to re-verify. Each round appends a fresh **Round-N** block to the Slice Handoff (never
   overwrite). **Cap = 2 retry rounds (3 qa attempts total).** If it is still failing after 2 rounds,
   **STOP**: post the defect list, notify the Operator, and **do not open a PR** — no branch merge, no
   loop.
6. **On qa PASS — archive, commit, open the PR.** Archive the OpenSpec change **within this same branch**
   (`openspec archive <slice-N-slug>` — the spec deltas fold into `openspec/specs/`). Commit and push the
   branch, then open a PR via `gh` with the **QA Verdict attached** (the Slice Handoff rides in the PR).
   Notify the Operator and **SUGGEST merging this specific PR** — do not merge yet.
7. **On the Operator's verbal approval — merge.** Run `gh pr merge` for **that** PR yourself and close
   the issue. The Operator never uses the GitHub merge UI; merge happens only here, only on explicit
   approval.

## Guardrails
- This command is the **ONLY** trigger for the engineering pipeline. The developer and qa agents are
  never invoked any other way.
- **One issue per run → one branch → one PR.** No self-selection of work — the slice is always the
  explicit issue number handed in, and only if it is labeled `ready-for-agent` with all blockers closed.
- **Hermetic build loop.** Tests use a **FAKE Magnific Space** only — **no live `spaces_*`/`creations_*`
  calls, no credits spent, no board mutation.** Live-Magnific testing is **deferred** (added later only
  if the fake proves insufficient); the developer is not given the magnific tools.
- **Never auto-merge.** A PR merges only on explicit Operator approval (Step 7). After 2 failed retry
  rounds, stop and notify — never loop, never open a PR on a fail.
- **Separate from the weekly content loop.** This pipeline shares **none** of the content gates —
  Review, Cast pick, and Publish are Operator **content** gates, not build gates. The engineering
  `developer` agent (writes code) is distinct from the content `producer` agent (drives a Space at
  runtime); do not conflate them.
