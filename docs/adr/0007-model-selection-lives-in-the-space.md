# Model selection lives in the Space, not in OrganicGrowth

**Status:** accepted — extends ADR-0003 (the Space is the source of truth for *how to run*).

Two top-level docs disagreed on the video model: the README said Magnific's **"Happy Horse"**, while
CONTEXT.md's Production Spec section said **"Veo 3.1"** (audit finding C34). The one piece of live
evidence — the Spike inventory (`docs/producer-spikes-results.md`) — only exercised the Cast phase, so
it confirmed the *image* models (**Nano Banana** / **Seedream**) but never captured the *video* model
name. Neither doc could be proven right.

The disagreement is a symptom of a category error: OrganicGrowth was documenting a model name as if it
*chose* one. It does not. The **Production Spec carries no model field** (verified in
`src/production-spec/contract.ts`) — it supplies only prompts (`image_prompt` / `video_prompt`) that
the Space's own generator nodes consume. Which models actually run is a property of the **Space's
flow**, exactly like the run-points in ADR-0003.

**Decision**

- **The Space's flow selects the models.** OrganicGrowth SHALL NOT hardcode, assert, or require a
  specific image or video model. It drives whatever the pre-defined Space is configured with.
- **Default = the Space's setting.** When no model is otherwise specified, the model is simply the one
  the Space's flow already has set. OrganicGrowth reads/produces nothing to change that.
- **The Operator overrides in the Space.** Changing a model is done on the Space's canvas (its
  generator nodes), not through an OrganicGrowth field or flag. This mirrors ADR-0003: the Space is
  self-describing and evolves independently of the thin runner.
- **Docs name models only as illustrative examples**, tied to what the current Space happens to use
  (e.g. character art via Nano Banana / Seedream) — never as a contract OrganicGrowth enforces.

**Consequences**

- The README/CONTEXT contradiction is resolved by *removing the hardcoded claim*, not by picking a
  winner: both now defer to the Space and cite this ADR.
- If the Space swaps its clip model tomorrow, no OrganicGrowth doc or code goes stale — there is
  nothing to update, because nothing here names the model as authoritative.
- A future feature that lets the Operator pass a model preference *through* OrganicGrowth (rather than
  editing the Space) would be a new capability and would need its own change/spec — it is explicitly
  out of scope here.
