---
name: gen-prompting-nano-banana-2
description: >
  Translate a user's image-generation intent into a production-ready prompt
  for Google's Nano Banana 2 image model (Gemini 3.1 Flash Image), with
  notes for the larger Nano Banana Pro (Gemini 3 Pro Image). Covers
  text-to-image, image-to-image edit, multi-reference edit (variant-aware
  caps), frame-sequence (the Nano-Banana-2-distinctive keyframe-handoff
  workflow), Thinking Mode, grounding via Google Search, expanded aspect
  ratios, and the new 512 (0.5K) resolution. Invoke this skill whenever
  the user asks for stills on the Google image stack.
user-invocable: true
---

# Prompting for Nano Banana 2

Use this skill to author prompts for Google's Nano Banana 2 image model
(Gemini 3.1 Flash Image; sibling Nano Banana Pro = Gemini 3 Pro Image).
It covers four modes plus configuration parameters that are not part of
the visible prompt.

Modes:

- **T2I** — text-to-image, no reference.
- **I2I** — image-to-image, single reference.
- **MR** — multi-reference edit, multiple references (variant-aware
  caps; see § Reference image caps).
- **frame-sequence** — Nano Banana 2's distinctive workflow: an ordered
  set of stills depicting the same subject through a short beat, sized
  to hand off to a downstream video model (Veo, Kling, Seedance) as
  keyframe inputs.

Configuration parameters (passed via the API, NOT part of the 120-word
prompt budget):

- **Thinking Mode** — `thinkingLevel` = `minimal` (default) or `High`;
  optional `includeThoughts`.
- **Grounding via Google Search** — `tools=[{"google_search": {}}]`;
  Image Search available on Gemini 3.1 Flash only.
- **Aspect ratio** — see § Aspect ratios.
- **Resolution** — 512 (Flash only), 1K (default), 2K, 4K.

The shared discipline lives in
`../../../references/prompt-discipline.md`,
`../../../references/photography.md`,
`../../../references/lighting.md`,
`../../../references/cinematography.md`, and
`../../../references/production-design.md` (paths relative to
this skill folder). Read those before writing a prompt for the first
time, then return here for model-specific behaviour.

## When to invoke

- User asks for a generated still image and names Nano Banana, Nano
  Banana 2, Nano Banana Pro, Gemini 3.1 Flash Image, Gemini 3 Pro
  Image, or "Google's image model".
- User asks to edit an image they uploaded on the Google image stack.
- User asks for a composite of multiple references on the Google image
  stack.
- User asks for a sequence of related stills as a precursor to a video
  generation — frame-sequence mode is the right fit.
- User asks for grounding (current events, web image references) or
  step-by-step "thinking" about the composition.

Do not invoke this skill for video itself, for OpenAI's image model, or
for non-Google image stacks.

## Inputs the consuming agent provides

1. **Mode** — one of `T2I`, `I2I`, `MR`, `frame-sequence`.
2. **Subject brief** — what the user wants. Free prose.
3. **Reference images** (I2I, MR, frame-sequence-with-anchor only) —
   list with role per image. See § Reference image caps for variant
   limits.
4. **Sequence intent** (frame-sequence only) — what changes across the
   ordered frames.
5. **Aspect ratio** — see § Aspect ratios.
6. **Resolution** — `512`, `1K`, `2K`, or `4K` (`512` is Flash-only).
7. **Style anchor** — optional. If absent, default to "natural
   photograph, neutral grade".
8. **Thinking Mode** (optional) — `thinkingLevel` `minimal` (default)
   or `High`; `includeThoughts` true/false.
9. **Grounding** (optional) — Web Search and/or Image Search (Image
   Search Flash-only).
10. **Negative cues** — optional. Rephrase to positive statements; the
    Gemini API does not expose a dedicated negative-prompt field.

## Mode 1 — Text-to-image (T2I)

### Five-clause skeleton

Apply the cross-model skeleton from `prompt-discipline.md`:

1. Subject
2. Action / pose
3. Setting / context
4. Style / medium
5. Camera / framing / light

The Google DeepMind guidance is explicit: **describe the scene, don't
just list keywords.** Narrative descriptive paragraphs outperform
disconnected word lists.

### Strengths

- Strong with naturalistic photography, especially environmental
  portraits and product hero shots.
- Composition fidelity holds for moderately complex scenes.
- Aspect-ratio honouring is precise.
- Excellent at legible stylised text (Gemini 3 family) — quote the
  desired words and name the typography.

### Known weaknesses

- Tends toward warm palettes by default; specify cool grading
  explicitly when needed.
- Repeated instances of identical objects ("seven apples in a row")
  drift past about five.

### T2I prompt template

```
<Subject in one short sentence>.
<Action or pose in one short sentence>.
<Setting and time in one short sentence>.
<Style anchor in one short sentence — pick a photographic stock, a
named illustration tradition, or a production-design anchor>.
<Camera, framing, light direction, light quality in one or two short
sentences.>
```

### T2I worked example — kawaii sticker

```
A kawaii-style sticker of a happy red panda wearing a tiny bamboo hat,
munching on a leaf.
The character has a cheerful, warm expression.
Pure white background (transparent backgrounds are not supported).
Bold clean outlines, cel-shading, vibrant colors.
Centred composition, full-body framing, even soft front light.
```

### T2I worked example — style transfer

```
An elderly Japanese ceramicist inspecting a glazed bowl.
Hands cradle the bowl at chest level; gaze is focused on the rim.
A rustic workshop with afternoon golden-hour light streaming through
a paper window.
Naturalistic film print emulation, 35mm-look, neutral warm grade.
85mm portrait close-up, three-quarter angle from camera-right, key
from the window camera-left, soft bokeh on the wall behind.
```

## Mode 2 — Image-to-image (I2I)

Single reference. Honours composition, identity, and most of lighting.
Use for: targeted edits, expression change, season change, outfit swap.

```
Reference: <one-line description of what is in the supplied image>.
Edit: <one short sentence per change.>
Preserve: <one short sentence — identity, framing, key light, brand.>
Style hold: <one short sentence — match original style unless overriding.>
```

## Mode 3 — Multi-reference edit (MR)

Nano Banana 2 accepts multiple reference images, with variant-aware
caps. Always name every role.

### Reference image caps (variant-aware)

The DeepMind guidance separates objects from characters and gives
explicit caps per variant:

| Variant | Objects | Characters | Total combined |
| --- | --- | --- | --- |
| Gemini 3.1 Flash (Nano Banana 2) | up to 10 | up to 4 | up to 14 |
| Gemini 3 Pro (Nano Banana Pro) | up to 6 | up to 5 | up to 14 |

Practical guidance: even within those caps, fewer high-quality
references beat many low-quality ones. The build script enforces a
practical guard at 14 (the documented total) and flags when the
character count crosses the variant's character cap.

```
References:
  Characters (k of <variant cap>):
    1. <role>
    ...
  Objects (n of <variant cap>):
    1. <role>
    ...
Goal: <one short sentence describing the composite.>
Composition: <one short sentence about framing and subject placement.>
Style hold: <one short sentence — usually inherits from the lighting
reference.>
```

## Mode 4 — Frame-sequence

Nano Banana 2's distinctive mode. The model produces an ordered set of
stills (typically 3 to 8 frames) depicting the same subject through a
short beat, designed to be handed off to a video model (Veo, Kling,
Seedance) as keyframes / first-and-last-frame anchors / reference-mode
inputs.

### When to use frame-sequence

- The downstream video clip needs strict subject identity across
  frames.
- The motion arc is short and well-defined ("the dancer raises both
  arms; the dress hem lifts").
- The user has a target video model in mind and needs the still
  preparation step before the video call.

Do not use frame-sequence for arbitrary "show me a story" requests —
that is a storyboarding task, not a key-frame task. For storyboarding,
use T2I per panel.

### Inputs

1. **Subject brief** — held identical across frames.
2. **Sequence intent** — short prose describing what changes from the
   first frame to the last. Two formats accepted:
   - **Endpoint pair** — describe frame 1 and frame N; the model
     interpolates intermediate beats.
   - **Beat list** — name each beat in order ("frame 1: hands at
     sides", "frame 2: hands rising", "frame 3: arms overhead").
3. **Anchor image (optional)** — a still that locks subject identity.
4. **Frame count** — 3 to 8. Default 4.

### Frame-sequence template

```
Subject (held constant): <one short sentence — same subject in every
frame, named precisely>.
Style and lighting (held constant): <one short sentence>.
Camera (held constant): <shot scale, lens, angle — same in every frame
unless the sequence intent calls for movement>.
Aspect ratio: <ratio — must match the downstream video model's input
shape>.

Sequence intent:
  Frame 1: <state of subject and any environment detail>.
  Frame 2: <next beat>.
  ...
  Frame N: <final beat>.

Hand-off: <one line naming the downstream video model and the input
mode it will use — first-and-last-frame, multi-reference, etc.>
```

### Frame-sequence anti-patterns

- Asking for too many frames (>8). Identity drifts; break into two
  sequences with a shared anchor.
- Changing camera between frames. The video model's interpolation
  breaks; let the video model handle camera motion.
- Omitting the hand-off line. The consuming agent does not know which
  video model to feed and in what mode.

## Thinking Mode (configuration parameter)

`thinkingLevel` controls how much reasoning the model does before
emitting the final image. **It is a configuration parameter, not part of
the 120-word prompt budget.**

- `minimal` (default) — lowest latency; suitable for routine generation.
- `High` — invest more thinking tokens; useful for complex compositions,
  multi-character scenes, infographics with required text accuracy.
- `includeThoughts: true` — the model returns its reasoning alongside
  the image. Useful for debugging composition mismatches.

Note: thinking tokens are **billed regardless of visibility setting**.

## Grounding via Google Search

Configuration parameter, not a prompt token. Two surfaces:

- **Web Search** — current events, weather, data. Available on both
  Flash and Pro.
- **Image Search** — visual reference from web image results. **Gemini
  3.1 Flash (Nano Banana 2) only.**

Configure with `tools=[{"google_search": {}}]`. The response carries
attribution via `groundingMetadata`.

When to use grounding: any prompt that depends on real-world facts the
model does not have, or a recognisable visual reference the user does
not supply directly.

## Aspect ratios

Supported (Nano Banana 2 / Pro): `1:1`, `1:4`, `1:8`, `2:3`, `3:2`,
`3:4`, `4:1`, `4:3`, `4:5`, `5:4`, `8:1`, `9:16`, `16:9`, `21:9`.

Pick the ratio before writing the prompt; it shapes how you describe
framing. For frame-sequence handing off to a video model, the aspect
ratio MUST match the downstream video model's supported input shape.

## Resolutions

`512` (Flash only), `1K` (default), `2K`, `4K`. Use uppercase `K`
notation; `512` requires no suffix.

## SynthID watermarking

All images produced by Nano Banana 2 / Pro carry an invisible **SynthID
watermark** indicating AI origin. The user cannot opt out. Surface this
to downstream consumers when relevant.

## Prohibited Use Policy

The Gemini API enforces Google's Prohibited Use Policy. The skill MUST
NOT generate deceptive content, infringing content, or content that
violates the policy. The user must hold rights to all input images.

## Translation notes

Model-specific quirks (warm palette default, repetition limit, variant-
aware caps, Thinking Mode, grounding, SynthID) live in
`references/translation-notes.md`.

## Observability Checkpoint

Before emitting the final prompt to the model, emit a structured log
line:

```json
{
  "skill": "gen-prompting-nano-banana-2",
  "checkpoint": "prompt-emit",
  "inputs": {
    "mode": "T2I|I2I|MR|frame-sequence",
    "variant": "flash|pro",
    "object_ref_count": 0,
    "character_ref_count": 0,
    "frame_count": 0,
    "aspect_ratio": "1:1",
    "resolution": "1K",
    "thinking_level": "minimal",
    "include_thoughts": false,
    "grounding_web": false,
    "grounding_image": false,
    "style_anchor": "<one-line>"
  },
  "decision": "emit|defer-to-user",
  "rationale": "<one-line: clauses present vs defaulted; for frame-sequence, hand-off target named; for MR, character cap respected for the variant; for grounding/Image Search, variant is Flash; SynthID acknowledged>"
}
```

For frame-sequence mode, the `decision` MUST be `defer-to-user` if the
hand-off target video model is not named — the downstream agent has no
basis to choose a video-input mode without it. Image Search grounding
on the Pro variant is also a `defer-to-user` (Pro does not support it).

## Closing — validation

Run the helper script `scripts/build-prompt.py` to assemble and
validate the prompt before emitting it. The script enforces the
five-clause skeleton, refuses negation-only prompts, validates frame
counts and hand-off naming for frame-sequence mode, applies the
variant-aware character/object caps for MR, and prints the assembled
prompt to stdout.

```
python3 scripts/build-prompt.py --mode T2I --subject "..." --action "..." \
    --setting "..." --style "..." --camera "..."
```

For frame-sequence:

```
python3 scripts/build-prompt.py --mode frame-sequence \
    --subject "..." --camera "..." --style "..." \
    --frame "Frame 1: ..." --frame "Frame 2: ..." \
    --handoff "Veo 3.1 first-and-last-frame"
```

For MR with variant-aware caps, pass `--variant flash` or `--variant
pro`. See `scripts/build-prompt.py --help` for the full argument list.
The script's tests live in `scripts/test_build_prompt.py` and run with
`python3 scripts/test_build_prompt.py`.
