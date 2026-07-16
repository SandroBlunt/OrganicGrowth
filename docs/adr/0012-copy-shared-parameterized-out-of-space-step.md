# Copy is a shared, parameterized, out-of-Space step drafted by the producer

**Status:** accepted — realises the copy decisions of the 2026-07 grilling; depends on ADRs 0009–0011.

Today the post's copy is a throwaway (`buildPostCopy` = the Idea title truncated + a fixed ` ☀️✨`), it
is a **required** field of the single Production Spec injected into the Space, the only enforced Brand
rule (`banned_words`) scans it there, and `required_cta`/`required_hashtags` are dead config. The Space
renders media; it does **not** tailor copy.

## Decision

- **Copy leaves the Space and the Production Spec entirely.** The Space makes media only. `post_copy` is
  removed from the Spec contract **and** its validator codes in the same change, so `compose.ts` still
  writes a valid Spec.
- **One shared copy step, per Asset.** It composes copy from: the **Format**'s voice/treatment + the
  **Recipe**'s copy **shape** (length, emoji rules, parts — the current 180 / 1–3-emoji values become
  the *Character Explainer with Cast* Recipe's parameters, not global constants) + the **Brand**'s hard
  rules + the **Idea**'s material.
- **The producer drafts it, late, in the Operator's session** — after the media (and any picked
  Character) exists, so the copy can refer to the realised media (e.g. "swipe for all 5", or naming the
  chosen Character). Drafting is an **LLM** task; voice is not a template.
- **Writing is split from checking.** The **checker** is a pure, hermetic, per-Recipe-parameterized
  validator (length, required CTA, required hashtags, banned words) the automated tests run every time;
  the **drafting** is the agent's job, exercised against the Magnific/model fake, never asserted against
  a live model.
- **Bring the dead Brand rules live.** Re-point the banned-word scan onto the **composed** copy
  (reject-only, never auto-edit unsafe text); enforce `required_cta`/`required_hashtags` by deterministic
  injection (append if absent, dedupe if present) with validation as a backstop — no unbounded model
  loop. Load them in `brand-profile.ts` (today only `banned_words` is loaded).
- **The watermark is not copy.** The @handle watermark is a **parameter inside the Space**, its value
  **inherited from the Brand**; the producer fills that Space parameter from the Brand's handle at run
  time (as today). It is out of the copy bundle.
- Copy is **stored structured on each Asset** and shown verbatim to the Operator at the publish gate
  (today it is dropped before the Operator sees it).

## Why

Voice-faithful copy needs a model, which fought the deliberately deterministic, model-free build.
Splitting a pure validator from agent-owned drafting resolves that without giving up test reliability.
Drafting late lets the copy name the real media.

## Consequences

A coordinated change across `contract.ts`/`validate.ts` (drop `post_copy`), `brand-safety.ts` (scan the
composed copy), `brand-profile.ts` (load CTA/hashtags), the ledger (store copy per Asset), and the
publish gate in `run-pipeline.ts` (surface it).
