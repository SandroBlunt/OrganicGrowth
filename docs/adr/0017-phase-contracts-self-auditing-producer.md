# Every production phase declares a checkable contract; the Producer self-audits before advancing

**Status:** accepted — extends ADR-0010 (Recipe owns its spec + copy shapes) and ADR-0002
(generate-never-publish). Captured in the 2026-07 recipe-architecture wayfinding (map #70, ticket #71).
**Decided, build pending.**

The Recipe already owned a Production-Spec validator and a copy-shape check, but as isolated checks, not a
uniform notion of "is this phase's output correct?" The Operator wanted **observability**: at any phase, an
agent — the Producer, or a QA pass — should be able to audit that phase's output against a clear contract.

## Decision

- A Recipe run moves through **phases** — author the prompt → bind media → gate → render → copy → save —
  and **each phase declares a contract**: what a valid output for that phase looks like.
- The contract is a **written checklist** (the *lighter* form): the Producer reads it and **audits its own
  output before advancing** — redraft on a soft miss, **STOP** on a banned word or a broken shape; never
  proceed past a failing contract.
- **A QA pass (or the Producer acting as QA) re-runs the same checklist** against the saved artifacts —
  "does this run stick to the contract of the phase it is in?"
- **Where a mechanical check already exists it stays as code, listed inside the checklist** — the
  Production-Spec validator, the copy length/emoji/required-parts check, the banned-word scan (now also
  covering a carousel's `image_prompt` fields). **No new per-phase code framework**: checklist-driven,
  agent-audited, code where code already earns its place.

## Why

A per-phase contract turns the pipeline into something auditable at every step without a heavy validation
framework — it reuses the deterministic checks that already exist and adds agent judgement for the parts
code can't check (is the subject "grounded"?). The map's #77 prototype validated it: the carousel
author-phase checklist ran as code and passed 10/10 on freshly authored prompts.

## Consequences

- The Recipe declares its phase list + each phase's checklist (mechanical items pointing at existing
  validators, plus agent-judged items).
- The stored Production Spec keeps the structured fields the checklist audits (the carousel keeps
  `role, card_style, stat_callout, text` beside `image_prompt`), so QA re-checks fields rather than parsing
  prompts — "thin" is not "minimal".
- QA gains a uniform way to audit any Recipe's run, not just the wired one.
