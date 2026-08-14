---
name: build-issue
description: >-
  Run the autonomous engineering pipeline for ONE GitHub issue: the developer implements it (OpenSpec, test-first, fake Magnific),
  qa verifies, and on pass it opens a PR for one-click merge approval.
---

# Build Issue Workflow

Usage: `build-issue <issue#>`

Run the two-agent engineering pipeline that **builds the Producer feature code** for exactly one build
slice. Required arg: a **GitHub issue number** in repo `SandroBlunt/OrganicGrowth`. One issue per run →
one branch → one PR. This is **not** the weekly content loop; it builds the code, it does not run it.

## Steps

1. **Pre-flight — gate on the issue:**
   - Verify issue number is provided.
   - Run `gh issue view <issue#> --repo SandroBlunt/OrganicGrowth`.
   - Refuse unless labeled `ready-for-agent` and all "Blocked by" issues are closed/merged.
2. **Branch off main:** Create branch `<issue-N-slug>` from `main`.
3. **Invoke `developer` subagent (Gemini 3.7 Pro):**
   - Authors OpenSpec change under `openspec/changes/<issue-N-slug>/` (proposal, tasks.md, spec deltas).
   - Validates via `openspec validate --strict`.
   - Implements test-first against fake Magnific Space.
   - Runs self-review pass and writes Build Report in `openspec/changes/<issue-N-slug>/handoff.md`.
4. **Invoke `qa` subagent (Gemini 3.7 Flash):**
   - Runs full test suite and confirms green.
   - Verifies all acceptance criteria are proven by real tests.
   - Verifies OpenSpec faithfulness against issue.
   - Confirms no live Space calls and always-rules compliance.
   - Appends QA Verdict to `handoff.md`.
5. **On QA fail (bounded retry):**
   - Return defects to `developer` to fix; QA re-verifies.
   - Maximum 2 retry rounds (3 QA attempts total). If still failing, stop and notify Operator.
6. **On QA pass:**
   - Archive OpenSpec change: `openspec archive <issue-N-slug>`.
   - Commit, push branch, and open PR via `gh` with QA Verdict attached.
   - Suggest merging that specific PR to the Operator.
7. **Merge on Operator approval:**
   - Run `gh pr merge` and close issue upon approval.

## Guardrails
- Hermetic build loop: Tests use fake Magnific Space only.
- Never auto-merge: PR merges only on explicit Operator approval.
