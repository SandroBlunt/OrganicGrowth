# A separate engineering build pipeline (developer + qa) authors OpenSpec changes and ships the Producer code

**Status:** accepted — adds a build-time pipeline alongside the content pipeline; references ADR-0002,
ADR-0003, ADR-0004 and PRD issue #1.

The Producer feature (ADR-0002/0003/0004) has to be *built*, not just specified. We decided to do that
with **two coding agents — `developer` and `qa` — that are a different species from the content
agents** (trend-scout, idea-strategist, producer, performance-tracker). The content agents run the
weekly content loop at runtime; these run at build time and write feature code. They share nothing but
the model. **The `developer` agent (writes code) is not the content `producer` agent (drives a Magnific
Space at runtime)** — the name collision is deliberately avoided everywhere.

**Decision**

- **Hard separation; no vocabulary pollution.** `developer` and `qa` are **not domain vocabulary** and
  are **not** added to `CONTEXT.md`, the Agents table, or the weekly-loop description. They are
  documented only in a new **Engineering agents** section of `CLAUDE.md`, kept distinct from the content
  Agents and the pipeline.
- **One entry point: `/build-issue <issue#>`.** A single slash command is the **only** trigger, handed
  an explicit GitHub issue number (repo `SandroBlunt/OrganicGrowth`). One issue → one branch → one PR.
  No self-selection of work. **Pre-flight refusal:** the agents refuse to run unless the issue is
  labeled `ready-for-agent`, and they verify every "Blocked by" issue is closed/merged; otherwise they
  stop and explain.
- **Autonomous OpenSpec spec authoring (Model B).** The `developer` turns the issue into a full
  **OpenSpec change** — proposal + `tasks.md` + spec deltas written as Requirements with Scenarios —
  under `openspec/changes/<issue-N-slug>/`, then implements **test-first**. **No human reads the
  proposal.** The only safety net is `openspec validate --strict` + the `qa` agent + the test suite. The
  `developer` must respect `CONTEXT.md` vocabulary, the always-rules, ADR-0002/0003/0004, and PRD issue
  #1.
- **Fake Magnific, live deferred.** Tests run against a **fake/stand-in for the Magnific Space**, never
  the live Space. The build/CI loop is **hermetic**: no live `spaces_*` or `creations_*` calls, no
  credits spent, no board mutation. The `developer` is **not given the `magnific` MCP tools**.
  Live-Magnific testing is **deferred** — added later only if the fake proves insufficient.
- **Developer self-review before handoff.** Before handing off, the `developer` must have
  `openspec validate --strict` green, the **full test suite** green, and complete **one self
  code-review / simplify pass**.
- **One bidirectional Slice Handoff.** Communication is a single document per slice at
  `openspec/changes/<issue-N-slug>/handoff.md`. The `developer` writes a **Build Report** (what changed,
  files touched, how to run build/tests, an acceptance-criteria self-assessment mapping each criterion to
  the test that proves it, the fakes/fixtures used with the **Magnific fake explicitly flagged**,
  self-review notes, known limits). The `qa` agent appends a **QA Verdict** (overall pass/fail,
  per-criterion and per-scenario results, a defect list with severity and repro steps). Retries append
  **Round-N** blocks; **nothing is overwritten**. The doc rides in the PR and is archived with the
  change. It is **not** a session handoff and **not** OpenSpec `tasks.md`.
- **qa is the sole non-human gate, on opus.** `qa` does three jobs: (a) run all tests and confirm green;
  (b) verify the code satisfies **every acceptance criterion** of the issue; (c) verify the
  `developer`'s OpenSpec spec **faithfully matches the issue** — catching a misread, self-consistent-but-
  wrong spec. `qa` also confirms **no live-Space calls** exist in tests (the fake is used) and that the
  always-rules hold in the built code (generate-never-publish, public-metrics-only, relative-not-
  absolute, explicit-attribution, ledger-as-source-of-truth). **`qa` reads, runs, and reports only — it
  never edits product code.**
- **Bounded retries, then escalate.** On a `qa` fail, `/build-issue` hands the defects back to the
  `developer`, which fixes and resubmits; `qa` re-verifies. **Cap = 2 retry rounds (3 qa attempts
  total).** Still failing after that → **STOP**, post the defect list, notify the Operator. No PR, no
  merge, no infinite loop.
- **PR, then verbal-approval merge.** On a `qa` pass, open branch `<issue-N-slug>` (the same string as
  the OpenSpec change-id) + a PR via `gh`,
  attach the QA Verdict, notify the Operator, and **suggest merging that specific PR**. On the Operator's
  verbal approval the agent runs `gh pr merge` itself and closes the issue — **the Operator never uses
  the GitHub merge UI.** The **OpenSpec archive** (folding spec deltas into `openspec/specs/`) rides
  inside this same PR.
- **Both agents on opus.** `developer` and `qa` both run on the strongest model (`model: opus`).

**Why:** building the Producer is a distinct concern from running the weekly loop, so it gets its own
agents and its own entry — fused into the content vocabulary it would only blur the domain. Model-B
autonomous spec authoring trades a human spec review for a tighter machine net (`validate --strict` + an
independent `qa` + tests), which fits a one-person Operator who gates *outcomes*, not drafts. A hermetic
fake keeps the build loop fast, free, and side-effect-free, deferring the cost of live-Space testing
until it's proven necessary. A single append-only handoff gives a clean audit trail that rides the PR.
One non-human gate on the strongest model, bounded to two retries, prevents both unreviewed merges and
runaway loops — and the verbal-approval merge keeps the human's hand on what ships, mirroring the
content pipeline's "generate but never publish without a human" ethos.

**Consequences**

- New agent files `.claude/agents/developer.md` and `.claude/agents/qa.md`; new command
  `.claude/commands/build-issue.md`.
- New `openspec/` scaffold (one-time plumbing): `project.md`, `specs/`, and `changes/`. Each run adds
  `openspec/changes/<issue-N-slug>/` (proposal, `tasks.md`, spec deltas, `handoff.md`); on merge the
  deltas fold into `openspec/specs/`.
- `CLAUDE.md` gains an **Engineering agents** section, explicitly separate from the content Agents table
  and weekly loop. **`CONTEXT.md` stays untouched.**
- A second class of agent now exists in the repo; readers must not confuse the build-time `developer`
  with the runtime content `producer`.
- The build loop depends on `openspec` (CLI + `validate --strict`) and `gh` being available, and on
  issues being curated with `ready-for-agent` labels and accurate "Blocked by" links.
