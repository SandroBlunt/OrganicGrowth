## MODIFIED Requirements

### Requirement: The loop pauses only at the three human gates and never renders past a gate

The conductor SHALL pause the loop exclusively at the three human gates: Review (Gate 1), Cast pick
(Gate 2), and Publish (Gate 3). It SHALL NOT render an Asset before the Operator picks a Character,
and it SHALL NOT auto-publish. Between gates, it SHALL drive the loop autonomously. The loop STATE
(current phase, pending gates, queue) SHALL be recoverable from `ledger.json` + `queue.json` across
turns and days — the Operator can re-invoke `/run-pipeline <brand>` and it will resume from the
correct gate. At Gate 3, for each produced Asset, the conductor SHALL surface that Asset's composed
Copy (`caption` + `hashtags`, when present) VERBATIM alongside the Recipe-explicit `/log-post` hint
(ADR-0012, issue #58) — never a summary or a paraphrase — so the Operator reviews the exact text before
publishing it.

#### Scenario: Loop pauses at Gate 1 (Review) and waits for the Operator

- **GIVEN** a Brand in the `"review"` phase (suggested Ideas exist)
- **WHEN** the conductor reaches Gate 1
- **THEN** it invokes review-ideas and pauses for the Operator's accept/reject decisions
- **AND** it does NOT auto-drain production before the Operator acts

#### Scenario: Loop pauses at Gate 2 (Cast pick) and waits for the Operator

- **GIVEN** a Brand with `casting` Ideas (Cast generated, Character not yet picked)
- **WHEN** the conductor reaches Gate 2
- **THEN** it presents the Cast and pauses for the Operator's Character pick
- **AND** it does NOT render the Asset before the pick

#### Scenario: Loop pauses at Gate 3 (Publish) and waits for the Operator

- **GIVEN** a Brand with `produced` Ideas (Asset generated, not yet published)
- **WHEN** the conductor reaches Gate 3
- **THEN** it displays the Asset for review and pauses for the Operator to publish and `/log-post`
- **AND** it does NOT publish automatically

#### Scenario: Gate 3 surfaces the composed Copy verbatim, and the /log-post hint names the Recipe

- **GIVEN** a Brand with a produced Asset carrying a composed `copy: { caption, hashtags }`
- **WHEN** the conductor reaches Gate 3
- **THEN** it prints that Asset's `copy.caption` and `copy.hashtags` VERBATIM
- **AND** the accompanying `/log-post` hint explicitly names the Idea's id AND the Asset's Recipe (never
  inferred, always-rules #5)

#### Scenario: Loop resumes correctly from ledger+queue state across invocations

- **GIVEN** a Brand that previously reached Gate 2 (phase = `"production"`, gate = `"cast-pick"`)
- **WHEN** `/run-pipeline <brand>` is invoked in a new session
- **THEN** the conductor detects the in-flight work, offers resume, and resumes at Gate 2
- **AND** does NOT restart from research
