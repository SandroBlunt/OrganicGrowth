# idea-strategist-briefs Specification

## Purpose
TBD - created by archiving change 111-copy-quality-skill. Update Purpose after archive.
## Requirements
### Requirement: idea-strategist briefs state a specific angle, a specific hook concept, and concrete, specific talking points

`.claude/agents/idea-strategist.md` SHALL instruct that an Idea brief's **angle** states the specific
tension or contrast the Idea rides, named with real entities from the Trend, never a generic theme; its
**hook concept** names the exact surprise or reframe that stops the scroll (still a concept, never the
finished opening line); and its **talking points** carry AT LEAST 4 entries, where EACH ONE grounds one
concrete, specific fact — a real name, a number, a date, or a direct claim pulled from the Trend's own
evidence, never invented — such that "a talking point with no specific is not acceptable." This SHALL
NOT weaken the existing hard boundary that a brief stops at concept-level material and never contains a
finished caption, script, or on-screen copy.

#### Scenario: The angle instruction requires a specific, named tension — not a generic theme

- **GIVEN** the agent's documented brief shape
- **WHEN** its Hard Boundary section is read
- **THEN** it states the angle must name the specific tension/contrast with real entities from the
  Trend, and must never be a generic/vague theme

#### Scenario: The hook concept instruction requires naming the exact surprise, still concept-level

- **GIVEN** the agent's documented brief shape
- **WHEN** its Hard Boundary section is read
- **THEN** it states the hook concept names the exact surprise or reframe, while still stating this is
  a CONCEPT, not the finished opening line the human writer lands

#### Scenario: The talking-points instruction requires a minimum count and a concrete specific per point

- **GIVEN** the agent's documented brief shape
- **WHEN** its Hard Boundary section is read
- **THEN** it states talking points carry at least 4 entries, each grounding one concrete, specific
  fact (a real name, number, date, or claim from the Trend's own evidence), and that a talking point
  with no specific is not acceptable

### Requirement: The drafting process instructs concreteness explicitly, and a standing guardrail reinforces it

The agent's Process section SHALL instruct, at the step where briefs are drafted, that every brief must
be concrete rather than generic — pulling specific names/numbers/dates/claims straight out of the
Trend's own evidence (never inventing one) — and SHALL name the consequence of skipping this: a thin
brief starts the downstream copy from nothing. The agent's Guardrails section SHALL carry a standing
rule ("Be concrete, never generic") independent of the Process step, so this is never a one-off
instruction that can silently lapse on a future edit.

#### Scenario: The Process step instructs concreteness, sourced from the Trend's own evidence

- **GIVEN** the agent's documented Process section
- **WHEN** the drafting step is read
- **THEN** it instructs pulling specific names/numbers/dates/claims from the Trend's own evidence
  (never inventing one) and states that a thin brief starts the downstream copy from nothing

#### Scenario: A standing Guardrails bullet requires concreteness independent of the Process step

- **GIVEN** the agent's documented Guardrails section
- **WHEN** it is read
- **THEN** it carries a bullet requiring every angle/hook concept/talking point to be grounded in a
  specific, named fact — never generic enough to describe any story in the Format

### Requirement: Richer-brief guidance is proven by a regular, always-on test (not incidental doc conformance)

The richer-brief guidance above SHALL be proven by pinning the agent's own documented text, in a
REGULAR `.test.ts` file (not `*.docs-test.ts`) — because idea-strategist.md is a prompt-driven agent
(no compiled TS brief schema exists — a Brief stays a freeform, agent-authored markdown file) — mirroring
`src/format/format-docs.test.ts`'s own established precedent that a slice's HEADLINE acceptance
criterion, expressed as prompt guidance, runs under `npm test`'s always-on gate rather than the
separate `npm run test:docs` pass reserved for incidental documentation conformance.

#### Scenario: The richer-brief guidance is pinned in a file matched by npm test's glob

- **GIVEN** the repo's test files under `src/`
- **WHEN** `npm test`'s glob (`src/**/*.test.ts`) is applied
- **THEN** a file asserting every Requirement above is matched and runs as part of the always-on suite

