# Translation notes — Seedream 4.5

Model-specific rules for ByteDance's Seedream 4.5 that override the
cross-model defaults in `../../../references/prompt-discipline.md`. This
skill is **front-end / prompting focused** — it covers what you type and
the on-screen options you pick, not API code.

## Natural language, not keyword stacking

Seedream's official guidance is explicit: **describe the scene in plain
sentences.** Concise, precise prose beats long, ornate keyword lists.
Stacking adjectives dilutes the result.

## Earlier-token weighting

Seedream **weights concepts mentioned earlier in the prompt more
heavily.** Put the single most important element first — usually the
subject. The thing you open with is the thing the model commits to
hardest.

## Word budget

- Aim for **30–100 words.** Past ~100 words, earlier detail starts to
  wash out. The build script hard-stops at 120 words.
- When you need to add something, cut adjectives, not whole clauses.

## In-image text (signature strength)

- **Quote the literal text in double quotes.** `the title "VISIT KYOTO"`
  renders; `titled Visit Kyoto` does not, reliably.
- Name the typography (bold, serif, hand-lettered) and placement.
- Keep each text element short — roughly 1–10 words is most reliable.
  Long paragraphs, very small text, mixed-language and complex non-Latin
  scripts degrade; verify and regenerate when text accuracy matters.
- The build script refuses an in-image-text argument that is not
  double-quoted.

## Reference images (Edit / MR)

- Address uploads by **on-screen order**: "Image 1", "Image 2", …
- Seedream relies **most on the first reference for identity** — upload
  the cleanest face / hero object as Image 1.
- Recommended upload order: **identity → style → palette →
  material/layout.**
- Practical cap: **~10 reference images.** Fewer high-quality references
  beat many weak ones. (Different front-ends publish slightly different
  caps; 10 is the safe ceiling. The build script guards at 10.)
- Edit mode = exactly one uploaded image.

## Sequential consistent-set (distinctive)

- One prompt → a coherent series of stills sharing a character and a
  style. Trigger it by naming the series and a count: "a set of 6…", "a
  series of four panels…".
- **Lock the style globally** — state one style/lighting clause for the
  whole set; do not vary it per panel, or identity drifts.
- Set count 2–8. For larger sets, split into two runs and reuse an
  anchor image to hold identity.
- Set the matching image count on the front-end control.

## Negation

- Seedream has **no negative-prompt field**, and in-prompt negation
  ("no people", "without text") is unreliable. Prefer positive
  description ("a clean, empty plaza").
- The build script refuses prompts that lean entirely on negation
  tokens.

## Quirks and weaknesses

- **Plasticky / over-beautified people** by default. For realism, ask
  for natural skin texture and a documentary grade.
- Overly long prompts confuse the model (see word budget).
- Very small or very long text degrades (see in-image text).

## On-screen settings (not prompt text)

- **Aspect ratio:** 1:1, 4:3, 3:4, 16:9, 9:16, 3:2, 2:3, 21:9. (Exact
  published list varies by front-end; the build script accepts this
  common set.)
- **Resolution:** 1K, 2K (default), 4K (up to 4096 px).
- **Image count / set size:** how many outputs the run returns; drives
  sequential-set.

## Parameters this skill deliberately excludes

Some third-party guides publish **Stable-Diffusion-style parameters**
that Seedream does **not** have: `guidance_scale`, `num_inference_steps`,
`scheduler`, `clip_skip`, `negative_prompt`. Do not author prompts
around them — they do nothing on Seedream. Steer the result through
**language**, not numeric controls.

API-only knobs (seed, watermark toggle, batch count, safety checker)
exist for programmatic callers but are **out of scope** for this
front-end skill.

## Provenance and policy

- Some front-ends stamp a visible wordmark (e.g. Jimeng's "★ 即梦AI");
  others offer a watermark toggle. Surface to consumers when provenance
  matters.
- The user must hold rights to every uploaded reference image, and the
  output must comply with the platform's content policy.

## Audit

Last reviewed: 2026-06-04. Cross-check against
`references/official-guidelines.md` (the vendor sources) before relying
on any rule above. Several facts about Seedream 4.5 (exact max
resolution, exact reference cap) vary across sources — see the
official-guidelines audit notes.
