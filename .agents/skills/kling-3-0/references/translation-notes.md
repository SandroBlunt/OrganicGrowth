# Translation notes — Kling 3.0

Model-specific rules for Kling 3.0 (non-Omni) that override the
cross-model defaults in `../../../references/prompt-discipline.md`.

## Multi-shot is core (not single-beat)

Kling 3.0 supports **multi-shot per generation** — up to 6 shots in one
clip totalling 3–15 seconds. Two operating modes:

- **Auto Multi-Shot** — model plans transitions and framing from the
  prompt. Best for naturalistic dialogue scenes.
- **Custom Multi-Shot** — explicit per-shot duration and content;
  hard-capped at 6 shots; durations must sum to the requested total.

The legacy "Kling 3.0 renders one beat per prompt" rule from 2.6 is
**obsolete**. Single-shot is still a valid choice (turn Multi-Shot off,
or describe one continuous beat); it is no longer the only option.

## Native audio is supported

Kling 3.0 synthesizes audio inline with the visuals. Removed: the prior
"ships silent" claim. New rules:

- **Dialogue** — quote the line and attribute the speaker:
  `[Character + descriptor, tone, optional language]: "line."`. Anchor
  every line with a physical action immediately before it.
- **Multi-character coreference (3+ named speakers).** The 3.0 upgrade
  reliably attributes lines to three or more named characters in the
  same scene.
- **Multilingual** — Chinese, English, Japanese, Korean, Spanish.
  Out-of-set languages auto-translate to English.
- **Dialects and accents** — tag per speaker (Cantonese, Sichuanese,
  Indian English, etc.).
- **Ambient and SFX** — write inline; explicit `SFX:` prefix supported
  for designed sound moments. Physics-derived audio is the highest-
  leverage approach: describe the surface and material, the model
  infers the sound.
- **Audio-toggle credit math** — the Native Audio mode costs more per
  second than the No Native Audio mode; document the user's choice when
  the consuming agent emits the prompt.

## Element binding (1–3 images per element)

- Each element (subject, prop, set) takes **1 to 3 reference images**
  (the official UI cap is 3 per element).
- Two to four elements per prompt.
- For character-based elements, voice tone can be bound separately so
  the same character's voice persists across shots.
- The build script enforces 1–3 per element; previous "2–4" guidance is
  superseded by the official UI cap of 3.

## Motion intensity (0.1–1.0)

- 0.1–0.3 subtle; 0.4–0.6 natural; 0.7–1.0 dynamic. Word-only
  equivalents (subtle / natural / explosive) are also accepted.
- Drop the value into the action sentence: "she walks slowly through
  the garden, motion intensity 0.5, relaxed natural pace."

## Negative prompt is a separate parameter

- Kling 3.0 supports a dedicated `negative_prompt` field. **It does NOT
  count against the visible prompt's character budget.**
- Drop-in default: `motion blur, face distortion, warping, morphing,
  inconsistent physics, floating objects, unnatural movements, extra
  limbs, background shifting, duplicated characters, low detail,
  watermark, text artifacts`.
- Targeted negatives by problem:
  - Face morphs: `face distortion, warping eyes, melting features,
    mouth artifacts`
  - Hand/limb: `extra fingers, fused hands, missing limbs, malformed
    hands`
  - Physics breaks: `floating objects, levitation, gravity errors,
    clipping through surfaces`
  - Background drift: `background morphing, environment shifting, scene
    inconsistency`
  - Lip-sync: `misaligned mouth, robotic lips, voice mismatch,
    asynchronous speech`
- Use sparingly — over-stacked negatives can flatten output.

## Physics-based motion fixes (anti-pattern → fix)

- **Walking — heel-first, weight transfer.** Forces ground-contact
  calculation; prevents AI moonwalk.
- **Hands — anchor to an object.** Hand-against-object beats hand-in-
  air; reduces extra-fingers and morphing.
- **Text on objects — declare stability.** "Ensuring the text 'X'
  remains stable and readable throughout the motion." Critical for
  branded content.

## Aspect ratio

- Supported ratios: 16:9, 9:16, 1:1, 4:5. (Earlier docs listed only 16:9
  and 9:16; the Kling 3.0 UI now accepts the social-square and portrait
  ratios as well.)

## Mix-budget heuristic

- Not applicable to Kling 3.0 (non-Omni). All MR inputs are images
  (1–3 per element). Video-reference inputs are an Omni feature; voice
  tone is a per-element binding, not a separate ref slot.

## Aesthetic strengths

- Painterly and stylised aesthetics survive better in Kling than in
  most peers.
- Shot-reverse-shot dialogue, macro close-ups, and profile shots are
  understood natively.
- On-image text preservation is strong (logos, signs, captions).

## Known weaknesses

- Ultra-close beauty/skin detail. Pull back slightly.
- Multiple subjects performing complex independent actions
  simultaneously. Stagger or split into shots.
- Numerical specifics ("5 trees", "6 puppies"). Use "a small cluster".
- Physics-defying actions (levitation, impossible balance) — fights you.
- Complex projectile arcs / juggling — unreliable.

## Production-design anchors

For the `Style / medium` clause, use named traditions instead of
generic adjectives. The full anchor catalogue lives in
`../../../references/production-design.md`. Strong for Kling: Tsui Hark
Wuxia, Ridley Scott prestige, Naturalistic film print emulation,
DaVinci industrial-grade color grading.

## Audit

Last reviewed: 2026-04-28. Cross-check against
`references/official-guidelines.md` (Kling 3.0 vendor docs and the
Pro Prompting Manual) before relying on any rule above.
