## ADDED Requirements

### Requirement: Review is the single authorship point — the attended Producer reads the Spec Review already wrote, never authoring its own (ADR-0031)

`.claude/agents/producer.md`'s Author phase SHALL no longer instruct running a Recipe's own producer
Skill to author a Production Spec. It SHALL instead read the Spec Review already saved for this (Idea,
Recipe) — the SQL-backed Spec for a job the unattended worker drives, or the file-backed Spec beside the
Brief for a job the attended Producer drives — and proceed straight to Bind/Watermark/Drive-the-canvas.
`auditAuthorPhase` SHALL still run against that Spec before advancing, as defense-in-depth confirmation
that what Review produced is well-formed — never as the primary catch for an authorship problem, which
now happens at accept time.

#### Scenario: The attended Producer's flow completes correctly against a Spec Review already authored

- **GIVEN** an accepted (Idea, Recipe) whose Spec was already authored and saved at accept time (via
  `acceptIdeaCommand`)
- **WHEN** the attended Producer's own drive sequence runs for that job (mirroring
  `carousel-end-to-end.test.ts`'s own shape: author-phase self-check against the ALREADY-saved Spec,
  bind-media, drive the canvas)
- **THEN** it completes to a finished Asset exactly as it would have if it had authored the Spec itself
  — the result is unaffected by the Spec having already existed when the Producer's own turn started

### Requirement: A News Carousel job accepted this way reaches produced through the unattended worker alone, with no attended session

`src/commands/run-worker.ts`'s `drainQueue`, run against a News Carousel job that `acceptIdeaCommand` enqueued (its Spec already authored and persisted to SQL at accept time), SHALL carry that job all the
way to a `produced` Asset — claiming it, passing its (unchanged) author-phase self-check because a Spec
is now always present, binding its media slots, driving the gate-free canvas to a finished render,
composing and self-checking its Copy, and saving the Asset `produced` with its media and Copy Variant —
with `runOneJob`/`drainQueue` never invoked by a human and no attended Producer session involved at any
point.

#### Scenario: accept -> drainQueue -> produced, zero attended session

- **GIVEN** a `suggested` ledger Idea, a Brand with a committed `brand-logo` Brand Asset, and a
  throwaway SQL database seeded with that Brand/Format
- **WHEN** `acceptIdeaCommand(brand, ideaId, ["news-carousel"], [], { db, ... })` is called, followed by
  `drainQueue(db, fakeCarouselSpace, options)` — the SAME function `/run-worker` runs, driven against the
  Magnific fake, never the live Space
- **THEN** `drainQueue`'s own outcome reports the job `done`, the SQL Asset's `status` is `produced`, it
  carries at least one `asset_media` row, and a Copy Variant is saved for the Brand's primary Channel —
  achieved with no call to `runOneJob` made by hand and no attended Producer agent session anywhere in
  the test

### Requirement: The unattended worker still parks a gated Recipe's job, exactly as before this change

A Recipe declaring at least one pick-gate (the wired *Character Explainer with Cast* Recipe), accepted and authored through the SAME `acceptIdeaCommand` path, SHALL still park at `awaiting_pick` once
`drainQueue` drives its first leg to that gate — never rendering past it — regardless of the fact that
its Spec was authored at accept time rather than by an attended Producer session.

#### Scenario: A gated Recipe's job parks, never renders past its Cast gate

- **GIVEN** a Character Explainer with Cast job whose Spec `acceptIdeaCommand` already authored and
  persisted
- **WHEN** `drainQueue` claims and drives that job's first leg
- **THEN** the outcome is `parked` at the `cast` gate — the Asset's `status` stays `in_production` with
  `pending_gate: "cast"`, and no clip/render leg has run

### Requirement: Deliberately broken authorship fails loudly at accept time, never reaching either queue silently empty or partial

Forcing an authorship failure (e.g. a banned word appearing in the Idea's own title, later configured as a Brand banned word) SHALL produce a visible, named failure in `acceptIdeaCommand`'s returned message —
never a Spec-less job silently reaching `data/queue.json` or the SQL `job` table, and never a partially
authored or empty Spec persisted anywhere.

#### Scenario: A forced failure never reaches the queue

- **GIVEN** the same forced banned-word setup as `accept-idea-command`'s own matching Scenario
- **WHEN** `acceptIdeaCommand` is called
- **THEN** neither `data/queue.json` nor the SQL `job` table gains any row for that Recipe, and no
  `asset.spec_json`/on-disk Spec file is ever written for it
