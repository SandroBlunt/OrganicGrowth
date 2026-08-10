# A Recipe may drive no Space: script Assets (text + collected media)

**Status:** accepted — **revises ADR-0010** (every Recipe declared "which Space it drives"; the Space
target becomes optional). Captured in the 2026-08 Unhypped Daily grilling.

ADR-0010 — and the registry built from it — assumed every Recipe renders media through a Magnific
Space: `Recipe.space` and its `specInput`/`clipRunPoint` node names are required today. The **News
Short Script** Recipe breaks that assumption: its Asset is a ready-to-record teleprompter script plus
a **Shot List** of collected media. There is nothing to render.

## Decision

- A Recipe's **Space target becomes optional**. A Space-less Recipe's Asset is written words (the
  script, its Copy) plus collected media (the Shot List's downloads).
- Everything else a Recipe owns is **unchanged and still required**: its gate list (zero..many), its
  Production-Spec shape + banned-word scan, its copy shape + copy Skill, its producer Skill, and its
  six ordered Phase Contracts — Space-bound phases declare empty/no-op checklists, exactly as the
  zero-gate News Carousel already does for its `gate` phase.
- The thin Producer skips canvas work (bind slots, drive run-points, watermark) for a Recipe that
  declares no Space; its "render" work for such a Recipe is collecting the Shot List's media —
  best-effort download (video preferred), with a clearly marked link fallback when a clip can't be
  pulled. A failed download never fails the job.

## Why

The alternative — producing scripts outside the Recipe model, or forcing a dummy Space — would fork
production into two pipelines. Keeping one model preserves the Production Queue, the per-Recipe ledger
grain (ADR-0011), Review's recipe-picking, and the Phase-Contract self-audit for free.

## Consequences

- Registry types widen (`space` optional, or a discriminated Recipe kind — the build slice decides).
- Schedule/export eligibility does not change: a script Asset publishes manually (YouTube), never
  through the images-only bulk path.
- Re-use of collected third-party media in the recorded video stays the Operator's per-clip editorial
  call — collection is a convenience, not a judgment.
