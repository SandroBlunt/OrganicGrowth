# Format vs Recipe: the multi-format content model

**Status:** accepted — supersedes the single-format assumptions in ADR-0002/0003; **breaks the "one
Idea → at most one Asset" invariant**. Captured in a design grilling (2026-07).

OrganicGrowth was built around one hard-wired production format (the 9:16 character Reel: 3 character
concepts → pick a **Character** → render). We are generalizing to many formats. The grilling found the
word "format" was doing two jobs and split it, then set the cardinality.

## Decision

- **Format** = a Brand's **editorial line** — its subject + treatment (e.g. Straw Motion's *"Unhypped
  News"*: AI/tech news explained in-depth, in plain terms). A Format sits **above Ideas** and holds
  many; a Brand runs one or several. It owns its voice/treatment, its trend sources, and its
  peer-vs-curated mode (see ADR-0013 for where it lives and how a Run is scoped).
- **Recipe** = a **production plan** (e.g. *"Character Explainer with Cast"*, carousel, meme) — how one
  Idea becomes one publish-ready **Asset**. Recipes are **brand-agnostic** and defined **in-repo**
  (ADR-0010); **every Recipe is available to every Brand**.
- **Cardinality:** Brand → 1..N Formats → many Ideas → the Operator picks **1..N Recipes per Idea** →
  **one Asset per Recipe** → one Post per Asset. This **retires** the old "one Idea yields at most one
  Asset" invariant.
- **Gates are per-Recipe.** Each Recipe declares its own human pick-gates (zero, one, or several). The
  old fixed **Cast pick** is just the *Character Explainer with Cast* Recipe's local gate;
  "Cast"/"Character" are that Recipe's vocabulary, **not** universal terms.
- **The Operator chooses the Recipes at Review.** Each suggested Idea arrives with its Format's
  **default Recipes** pre-filled; the Operator trims/extends conversationally; accepting enqueues one
  production job per chosen Recipe. A declined Recipe is logged verbatim, like a Rejection Reason
  (logged-only for v1).
- **Retire the media-sense of "format".** `brand-profile.yaml`'s `formats:[reel]` and the per-Idea
  `format:reel` tag are renamed so **Format** only ever means the editorial line (see ADR-0011 for the
  migration).

## Why

The two concepts have different owners (Brand vs shared system) and different lifecycles; conflating
them is what blocked multi-format. Operator-chosen fan-out at Review keeps credit-spend and human gates
bounded while giving full flexibility (the "many" is a per-Idea choice, not automatic).

## Consequences

- The ledger grain, queue key, spec path, gate model, driver, and copy step all gain a **Recipe**
  dimension (ADRs 0010–0012).
- "Cast/Character" demote to Recipe-local terms; `CONTEXT.md` records them as the *Character Explainer
  with Cast* Recipe's pick.
- The reshape is cheap **now** — no Brand has produced a real Asset yet — and expensive the moment the
  first one lands.
