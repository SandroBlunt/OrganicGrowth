## Why

Slice 1 stood up the runtime and auto-enqueues an accepted Idea onto the **Production Queue** (ADR-0004).
The next step in the Producer feature (PRD #1, user stories 3–5, 30) is turning that accepted **Brief**
into the strict **Production Spec** JSON that drives the Magnific Space's `JSON master` input node — and
doing so *safely*: a malformed Spec, or one that smuggles in a banned word, must never reach the Space
(it would waste a run and credits, or reintroduce something Review already filtered).

This slice delivers the **`production-spec`** capability: a pure validator that encodes the Space's
generation contract, a brand-safety filter over the Spec, a deterministic composer that builds a Spec
from a Brief, and persistence to `ideas/<run>/idea-NN.spec.json` (the machine-readable sibling of the
Brief, so the Operator can inspect exactly what will drive a render). It also adds the content
**`producer`** agent definition.

**Contract sourcing (Spike 3 is load-bearing).** `docs/producer-spikes-results.md` Spike 3 found the
Magnific read API truncates text nodes at ~1,900 chars and cuts the Space's system prompt off
mid-section, so the thumbnail/`post_copy` rules at the tail are **not** retrievable from the canvas
node. Therefore this slice does **not** source the generation contract from the truncated canvas
system-prompt node. Instead it encodes the contract as a **compact schema/style summary in code**
(`src/production-spec/contract.ts`) that `validate()` enforces. This is the cleanest hermetic path: it
needs no live WebFetch in tests (the published-Google-Doc-link path remains a documented alternative for
a future slice if the in-code summary proves insufficient). The decision is recorded in the contract
module's header comment.

## What Changes

- **Add the content `producer` agent definition** (`.claude/agents/producer.md`, model Opus) — joins
  trend-scout / idea-strategist / performance-tracker. It describes the Producer's full role per
  CLAUDE.md / CONTEXT.md (drives a Magnific Space: generates a Production Spec, runs cast, pauses at the
  Cast gate, renders the Asset after the Operator picks the Character; **generates, never publishes**).
  For *this* slice its job narrows to: turn an accepted Brief into a strict Production Spec saved beside
  the Brief.
- **Encode the Production Spec contract in code** (`src/production-spec/contract.ts`) — a compact,
  documented schema/style summary (exactly 3 `character_concepts`; exactly 3 `clips` using
  `character_concepts[0]`; top-level `post_copy` ≤180 chars with 1–3 emojis; top-level `thumbnails` of
  3 image prompts; image prompts ending with the `Aspect Ratio 9:16.` line). Sourced **without** the
  truncated canvas node, per Spike 3.
- **Add a pure `validate(spec) → { ok, errors }` deep module** (`src/production-spec/validate.ts`) that
  rejects malformed Specs with specific reasons before they could reach the Space: ≠3
  `character_concepts`; ≠3 `clips`; `post_copy` >180 chars; `post_copy` with 0 or >3 emojis; missing
  `thumbnails`; and `post_copy`/`thumbnails` nested inside `clips`/elsewhere instead of TOP-LEVEL.
- **Add a pure brand-safety filter** (`src/production-spec/brand-safety.ts`) that scans every text field
  of a Spec for `brand-profile.yaml` banned words, plus a defensive YAML reader
  (`src/production-spec/brand-profile.ts`) using the `yaml` package. A Spec containing a banned word is
  rejected — banned words never survive into a saved Spec (PRD story 30; always-rule 9).
- **Add a pure composer** (`src/production-spec/generate.ts`) — `generate(brief, contract, profile)`
  builds a contract-conformant Spec from an accepted Brief deterministically (no model call in this
  slice; the agent-reasoned path is a later concern). The generated Spec passes `validate()` and the
  brand-safety filter.
- **Persist the Spec** (`src/production-spec/store.ts` + a thin `composeSpec` orchestration shell in
  `src/production-spec/compose.ts`) to `ideas/<run>/idea-NN.spec.json`, refusing to write a Spec that
  fails validation or brand-safety.

This slice composes and validates JSON and writes a file. It has **no Magnific Space interaction** (like
Slice 1) — no `spaces_*` / `creations_*` calls, no credits, no board mutation, and **no Magnific fake is
needed**. Generating the Spec from the model and injecting it into the Space are later slices.

## Capabilities

### New Capabilities

- `production-spec`: generating the strict, schema'd **Production Spec** JSON from an accepted Idea and
  the Space's generation contract, validating it against that contract, enforcing brand-safety hard
  filters, and persisting it beside the Brief. Sourcing the contract from a compact in-code schema
  summary (not the truncated canvas node) is part of this capability.

## Impact

- **New dependency:** `yaml` (already present transitively) promoted to a declared dependency so the
  brand-profile reader does not rely on a transitive package.
- **New code:** `src/production-spec/` — `contract.ts`, `validate.ts`, `brand-safety.ts`,
  `brand-profile.ts`, `generate.ts`, `store.ts`, `compose.ts`, plus `*.test.ts` and `fixtures/`.
- **New agent:** `.claude/agents/producer.md` (Opus).
- **New state:** `ideas/<run>/idea-NN.spec.json` written by the Producer (passes validation).
- **No external calls:** no Magnific and no Apify; no live WebFetch in tests. The build stays hermetic.
- **Always-rules upheld:** generates, never publishes (this slice only writes a JSON Spec file — it
  never posts); brand-safety hard filters hold through production (banned words never survive into a
  saved Spec); the ledger stays canonical (the Spec is derived from an accepted Brief).
