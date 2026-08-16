# Producer ↔ Magnific Space — feasibility spike results

**Run:** 2026-06-04/05 · **Space:** `a1f05d67-1b98-4d10-9251-6603bea3b578` (the "JSON master"
cast→clips studio, 55 nodes, single-concurrency) · **Method:** direct `magnific` MCP `spaces_*` calls.

These are the two spikes ADR-0003 gated the build on, plus a third (system-prompt retrieval) from the
handoff. Bottom line: **both gating spikes PASS; the design's load-bearing mechanisms work. One new
risk surfaced (read-API truncation) that ADR-0003's "reads the contract from the canvas at run time"
assumption needs to account for.**

## Spike 1 — can `spaces_edit` set node contents? (ADR-0003 spike i) — **PASS**

`spaces_edit` delegates to the Space's in-canvas agent (`spaces_specialist`); poll `spaces_edit_status`
to terminal, then verify with `spaces_get_nodes`.

- **1a — set the `JSON Master` *text* node.** Replaced its entire content with a tiny schema-valid
  Production Spec (3 `character_concepts`, 3 `clips` with `image_prompt`/`video_prompt`, `post_copy`,
  3 `thumbnails`), each field marked `SPIKE7F3A`. Readback matched **exactly**. ✅
- **1b — re-pin the `Character #2` *creation* node.** Re-pinned `MXP5IQ6DCm → 74uMiWLJAL`; readback
  confirmed `creationIdentifier=74uMiWLJAL`, and the node's outgoing reference connections to the clip
  generators were preserved. ✅

**Conclusion:** the Fallback Protocol's two state mutations (inject the Production Spec; pin the
Character) are both achievable via `spaces_edit` — across **both** node types (text *and* creation).
ADR-0003's Fallback Protocol stands.

> Process note: each `spaces_edit` (and `spaces_run`) is auto-denied by the Claude Code permission
> classifier as "modifying shared infrastructure" and needs explicit per-action operator approval —
> even with blanket verbal consent. Relevant for any **unattended/background** Producer run (ADR-0004):
> a headless queue worker will hit this gate. Flag for the build: the Producer needs a permission path
> (allowlist rule / non-auto permission mode) or it cannot drain the queue unattended.

## Spike 2 — does `spaces_run(downstream)` stop cleanly at the Cast? (ADR-0003 spike ii) — **PASS**

Ran `spaces_run(startNodeId="Character Variants Generator" bfd20cd1…, mode="downstream")` against the
test spec from Spike 1. Terminal after exactly **6 nodes, all Cast-phase**:

`Character Variants Generator → Character concepts list → Nano Banana Style (3 imgs) + Seedream Style
(3 imgs) → their two list nodes`.

Produced **6 new creations (the Cast)**. Ran **zero** clip image-generators, **zero** video
generators, **no** Video Combiner.

**Why it stops cleanly:** the clip generators take their reference from the *manually-pinned*
`Character #2` creation node — which is **not** a downstream output of the variant generators. The
human Cast pin is the natural cut between Phase A and Phase B, so `downstream` can't spill past it.
ADR-0003's two-phase split around the Cast gate is sound; no need for per-node `singular` runs.

**Bonus:** edited `JSON Master` → ran cast → got a fresh, on-spec Cast (mug/apple/book) in one chain —
end-to-end confirmation of Phase A, not just the boundary.

## Spike 3 — is the full generation contract retrievable from the canvas? — **PARTIAL / FAIL**

ADR-0003 (lines 13–16) assumes "the Producer reads both [the generation contract (system prompt) and
the Execution Protocol] from the canvas at run time."

**Finding:** the MCP read tools (`spaces_state` *and* `spaces_get_nodes`, even scoped to the single
node) **truncate large text-node values at ~1,900 characters.** The `Assistant Prompt #2` system
prompt exceeds that — it cuts off mid-section-4 ("Social Media Copy & Thumbnails"), so the thumbnail-
prompt guidance at the end is **not** retrievable via the read API. The same cap truncated the
toothbrush `JSON Master` example mid-word.

**Implications for ADR-0003:**
- A Producer that reads the system prompt **only** from the canvas gets a **partial** contract and
  would under-specify the tail (thumbnails / post_copy rules). This is a real gap, not cosmetic.
- The Execution Protocol JSON (`Producer Protocol` node, proposed in ADR-0003) is fine **only while it
  stays under ~1.9k chars**; a larger protocol would be silently truncated too. Keep it compact, or
  read it by another path.

**Mitigations to fold into the PRD:**
1. The canvas already links out: an `Assistant Prompt Link #2` node holds a **published Google Doc URL**
   with the full contract. The Producer can fetch the full text there (WebFetch) instead of the
   truncated canvas node.
2. Question whether the Producer *needs* the full system prompt at all: if the Producer/strategist
   generates the Production Spec itself, the Space's prompt-generator nodes are what consume the system
   prompt — the Producer may only need the *schema/style summary*, which fits under the cap.
3. If reading from the canvas is required, keep contract + protocol nodes **under ~1.9k chars** (or
   chunk them), and treat the read API's truncation as a hard constraint.

## State left on the board (mutations from these spikes)

- `JSON Master` (6bc54e3e…): now holds the **`SPIKE7F3A` mug test spec**. The original toothbrush
  example **could not be fully snapshotted** for restore (it too exceeded the ~1.9k read cap and came
  back truncated mid-word). It's example data the Producer overwrites every run, so not load-bearing —
  but it is **not** the original.
- `Character #2` (ba631f44…): re-pinned to `74uMiWLJAL` (was `MXP5IQ6DCm` — this value *is* known and
  can be restored exactly on request).
- 6 new Cast creations added to the board from the Spike-2 run.

## Net effect on the design

- ADR-0003 **spikes (i) and (ii): both PASS** — Fallback Protocol mutations and the `downstream` Cast
  boundary both work. No decision reversal needed.
- **New risk to capture:** read-API text truncation (~1.9k chars) undercuts "read the full contract
  from the canvas at run time." Resolve via the linked Google Doc, a compact schema summary, or
  size-bounded protocol nodes.
- **Build constraint (ADR-0004):** `spaces_edit`/`spaces_run` need explicit permission each call;
  an unattended queue worker needs a permission allowlist or it stalls at the gate.
