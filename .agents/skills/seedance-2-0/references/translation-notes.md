# Translation notes — Seedance 2.0

Model-specific rules for Seedance 2.0 that override the cross-model
defaults in `../../../references/prompt-discipline.md`.

## Per-modality caps (documented)

- Images: ≤ 9
- Videos: ≤ 3
- Audios: ≤ 3
- Total combined: ≤ 12

These caps are documented and enforced as hard limits by the build
script. Exceeding any one raises a validation error.

## Mix-budget heuristic (vendor-unconfirmed)

Field-experience guidance for balancing inside the documented caps:

- **Image floor when video or audio present** — at least 2 images for
  stable identity grounding. Without it, video and audio references
  drift the subject.
- **Effective video cap of 2** even though 3 is documented. Three
  video references almost always blend into composite motion artifacts.
- **Effective audio cap of 2** even though 3 is documented. Three
  audio references blend into noise.

The build script raises a validation error when the heuristic is
violated. Pass `override_mix_budget=True` (CLI:
`--override-mix-budget`) to bypass; the override is recorded in the
assembled prompt and in the Observability Checkpoint rationale.

**Vendor-unconfirmed; verify against latest official docs.**

## Edit vs Reference distinction

When uploading a video, **always declare intent**:

- **Edit** = modify the existing video directly. Examples: replace a
  character, remove an object, add an element, change the plot.
  Format: `In @Video1, replace the woman with @Image1...`.
- **Reference** = extract a quality from the video — camera movement,
  motion style, rhythm, sound — and apply to a new generation.
  Format: `Reference @Video1's camera movement for a new scene...`.

The two routes through the model are different. Conflating them is
the most common cause of unexpected output. Always be explicit.

## Notation alternatives

- **Canonical:** `@Image1`–`@Image9`, `@Video1`–`@Video3`,
  `@Audio1`–`@Audio3`. Tags assigned in upload order.
- **Alternative:** `<<<Image1>>>`, common in Japanese-language
  community prompts and morphing templates. Provides visual emphasis
  in long prompts.

Stay consistent inside one prompt. Mixing notations causes the model
to mis-resolve references.

## Audio synthesis

- Seedance 2.0 supports synthesized audio output: ambient and foley
  reliably; lip-synced dialogue in 8+ languages.
- Audio decisions should be explicit. Either include an `Audio:` line
  or omit it deliberately.
- For audio reference (using a reference video's sound), use:
  `Background BGM references the sound effects from @Video1.`

## Multi-beat behaviour

- Seedance 2.0 partially honours multi-beat shot lists, and supports
  **automatic multi-camera narrative coverage** when the prompt
  describes a scene that calls for shot-reverse-shot.
- For maximum control, use the **shot-script format** (see SKILL.md
  § Shot-script format) with explicit timecodes.

## Sub-second timecodes

For micro-timing of emotion beats, reaction shots, and rapid cuts,
fractional second markers are accepted: `[0.0s–0.5s]`, `0.3s`,
`0.4 seconds`, `200–400 milliseconds`.

Use sub-second markers when the beat is shorter than 1 second AND
timing precision changes the meaning of the shot. Don't over-fragment.

## Camera rules

- **One primary camera instruction per shot.** Compound is allowed via
  "primary then secondary" phrasing: `low tracking shot then subtle
  rise`. More than that → conflict and jitter.
- **Separate camera movement from subject movement.** Two distinct
  sentences.
- **If the camera is static, the world must move.** Add 2–3
  micro-motions (steam, fabric sway, blinking). Never both still.

## Negation behaviour

- Negation in prose is unreliable. Use positive description.
- The skill's "avoid X" constraint clause is accepted but should be
  used for noun-phrase exclusions, not semantic control.

## Aspect ratio

- Documented platform ratios: 16:9 (YouTube/landscape), 9:16
  (TikTok/Reels/Shorts), 1:1 (Instagram feed), 4:3 (vintage), 2.35:1
  (cinematic widescreen — add to style line).

## Community patterns (pointers)

- **JSON-style structured prompt** — alternative to shot-script;
  compact and machine-readable. Strong for VFX and POV.
- **Multi-chapter long-form** — write one master script with explicit
  `Chapter 1 / Chapter 2 / Chapter 3` blocks; each chapter is its own
  15-second clip, planned upfront and stitched in post.
- **Hard-cut testing pattern** — `"no fade-in/fade-out, no
  transitions"` forces hard cuts; useful for music-video rhythm and
  for stress-testing identity consistency under aggressive cutting.

Full versions of these patterns and the EvoLinkAI community catalogue
live in the vendor doc bundle (see `official-guidelines.md` for the
list of source paths).

## Production design anchors

For the `Style` clause, prefer named traditions over generic
adjectives. The full anchor catalogue lives in
`../../../references/production-design.md`. Strong for Seedance: Tsui
Hark Wuxia, DaVinci industrial-grade color grading, naturalistic film
print emulation, 100% real-life shooting texture, 35mm handheld film
camera with natural grain, Hollywood IMAX blockbuster quality.

## Compliance

- Seedance 2.0 does NOT support realistic human face photo uploads
  (the "Face-to-Voice" feature was suspended after privacy concerns).
  For human reference inputs, use illustrated or AI-generated virtual
  characters.
- Reference videos cost more credits than image-only or text-only
  generations.

## Audit

Last reviewed: 2026-04-28. Cross-check against
`references/official-guidelines.md` (Seedance source) before relying
on any rule above. Pay particular attention to whether per-modality
balance guidance has since been published.
