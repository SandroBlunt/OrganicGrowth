# Producer generates the Asset; the human gate moves to publication

**Status:** accepted — supersedes the "never generate finished content" principle in ADR-0001's spirit
and `.claude/rules/always/organicgrowth-rules.md` rule 1.

OrganicGrowth originally drew its hard line at *content generation*: an Idea stopped at a Brief and a
human shot the Reel. As of June 2026 we add a **Producer** agent that renders an accepted Idea into a
publish-ready **Asset** by running a pre-defined **Magnific flow** (adapting the Brief to that flow's
parameters). We decided to **move the human gate from creation to publication** rather than remove it:
the system now *generates* the Asset, but a human still reviews and *publishes* the Post (and logs the
URL — attribution stays explicit, never inferred).

**Why:** automated rendering is now good enough to be the bottleneck-breaker for a one-person Operator,
and the brand-safety / authenticity value of OrganicGrowth was never really in "a human pressed the
render button" — it was in "a human decides what goes live on the Channel." That decision is preserved.

**Consequences:**
- Lifecycle gains a `produced` state: `suggested → accepted → produced → posted → tracking → scored`.
- The ledger Idea record gains `asset_url` / `asset_ref` and `produced_at`.
- Rule 1 ("never generate finished content") is reworded to "never *publish*"; the public-metrics-only,
  relative-not-absolute, and explicit-attribution rules are unchanged.
- New agent `producer` (Sonnet/Opus TBD) joins trend-scout / idea-strategist / performance-tracker.
