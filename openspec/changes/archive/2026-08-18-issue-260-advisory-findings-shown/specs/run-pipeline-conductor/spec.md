## MODIFIED Requirements

### Requirement: Readiness runs every launch, is silent when healthy, and surfaces gaps with phase-scoped blocking

The conductor SHALL run a readiness check at every launch. The check SHALL NEVER be cached. It SHALL:
- Live-probe the Magnific Space for accessibility and credit balance.
- Live-ping the Apify token for validity.
- Sanity-check the Brand config (via `checkConfig`).
- Feed all probe results to `classify` and combine the findings.

The conductor SHALL print EVERY Finding it computes — `block` and `advisory` severity alike —
unconditionally, under a `"Readiness check:"` header: a `block`-severity Finding as a `[BLOCK]` line, an
`advisory`-severity Finding as a `[WARN]` line. Printing a Finding SHALL NEVER depend on any OTHER
Finding — of either severity — also existing that same run. The readiness output SHALL be silent ONLY
when the computed Finding list is literally empty (a fully healthy Brand and healthy probes). This
supersedes the PRIOR policy ("silent when all findings are advisory-only") and the narrow, per-Finding
-code carve-out issue #253 introduced to work around it for exactly two codes
(`apify_actor_not_found:*` / `apify_actor_unreachable:*`, previously identified by
`isActorExistenceFinding`) — that carve-out is now REMOVED as redundant (see the REMOVED Requirements
section of this change) because this Requirement's general rule already covers it, and covers every
OTHER advisory `code` `classify.ts`/`check-config.ts` produce today or add in the future without
requiring any hand-maintained allow-list.

Printing SHALL remain entirely independent of phase-scoped blocking. When one or more `block`-severity
findings exist, the conductor SHALL apply phase-scoped blocking exactly as before: a `block` on
`research` stops the launch; a `block` on `production` allows research to proceed but stops production;
a `block` on `publish` allows research and production to proceed but stops publication. An
`advisory`-severity finding SHALL NEVER stop or block any phase, regardless of whether it is the only
Finding printed that run or is printed alongside one or more `block` findings. The conductor SHALL list
only the blocking/advisory findings for the current and upcoming phases — it SHALL NOT surface findings
for phases already complete.

The live probes SHALL be modelled behind injectable port interfaces (`MagnificReadinessPort` and
`ApifyReadinessPort`) so that tests can inject fakes and the build remains hermetic (no live
`spaces_*`/`creations_*` calls, no credits, no board mutation).

#### Scenario: Healthy readiness produces no output

- **GIVEN** a Brand with valid config, accessible Space, sufficient credits, a valid Apify token, and a
  Channel performance baseline already measured (a literally empty Finding list)
- **WHEN** `/run-pipeline <brand>` performs the readiness check
- **THEN** no readiness output is shown to the Operator
- **AND** the conductor proceeds to the rename hint

#### Scenario: Research block stops the launch

- **GIVEN** a Brand whose Apify token is invalid (probe returns false)
- **WHEN** `/run-pipeline <brand>` performs the readiness check
- **THEN** a finding with `severity: 'block'` and `phase: 'research'` is surfaced as a `[BLOCK]` line
- **AND** the conductor stops and does not proceed to the loop

#### Scenario: Production block allows research but stops production

- **GIVEN** a Brand whose Magnific Space is inaccessible (`accessible: false`)
- **WHEN** `/run-pipeline <brand>` performs the readiness check
- **THEN** a finding with `severity: 'block'` and `phase: 'production'` is surfaced as a `[BLOCK]` line
- **AND** the conductor proceeds through research and review but stops before production

#### Scenario: An advisory finding reaches the Operator with no block finding present

- **GIVEN** a Brand whose config is otherwise entirely healthy except that its ledger carries no
  Channel performance baseline yet (`baseline.updated_at` is `null` — an advisory-only finding,
  `code: "null_baseline"`)
- **WHEN** `/run-pipeline <brand>` performs the readiness check
- **THEN** the printed output contains a `[WARN]` line naming the missing baseline
- **AND** no `[BLOCK]` line appears
- **AND** the conductor proceeds to the loop (the advisory does NOT block any phase)

#### Scenario: An advisory printed alongside a co-occurring block still leaves phase-scoped blocking unchanged

- **GIVEN** a Brand whose Apify token is invalid (a `block` on `research`) AND whose `banned_words` list
  is empty (an `advisory` on `research`, unrelated to the token)
- **WHEN** `/run-pipeline <brand>` performs the readiness check
- **THEN** the printed output contains both a `[BLOCK]` line and a `[WARN]` line
- **AND** the conductor stops before research proceeds — caused by the `block`, not by the co-occurring
  `advisory`

## REMOVED Requirements

### Requirement: The conductor prints an actor-existence advisory to the Operator even when it is the only finding present

**Reason**: This Requirement (added by issue #253, Round 2) described a narrow, named carve-out —
`isActorExistenceFinding` singling out exactly two Finding `code`s
(`apify_actor_not_found:*` / `apify_actor_unreachable:*`) for unconditional printing, while every OTHER
advisory-only Finding kept the old silent-when-advisory-only default. Issue #260 replaces that default
itself: the MODIFIED "Readiness runs every launch, is silent when healthy, and surfaces gaps with
phase-scoped blocking" Requirement above now prints EVERY Finding unconditionally, for EVERY code,
without a per-code allow-list. Keeping this Requirement alongside the new general rule would describe
the same guarantee twice — once narrowly (naming only two specific codes) and once generally — leaving
the spec internally redundant. `isActorExistenceFinding` itself is deleted from
`src/commands/run-pipeline-readiness.ts` as dead code; its two Finding codes are printed by the same
general mechanism as every other code now.

**Migration**: See the MODIFIED "Readiness runs every launch, is silent when healthy, and surfaces gaps
with phase-scoped blocking" Requirement's own "An advisory finding reaches the Operator with no block
finding present" Scenario — the general rule covers the exact same guarantee this Requirement described,
for these two codes and every other advisory code alike. The three Scenarios this Requirement previously
carried (dead-slug-alone, unreachable-probe-alone, co-occurring-block) remain true of the system's
behaviour today; they are simply no longer a SPECIAL case worth its own Requirement — they are ordinary
instances of the general rule, covered by `src/commands/run-pipeline.test.ts`'s existing actor-existence
test describe block (unchanged by this ticket) plus the new tests this ticket adds for the other seven
previously-silent codes.
