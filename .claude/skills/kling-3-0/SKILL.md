---
name: gen-prompting-kling-3-0
description: >
  Translate a user's video-generation intent into a production-ready prompt
  for Kuaishou's Kling 3.0 (non-Omni). Covers text-to-video, image-to-video
  with element binding (up to 3 reference images per element), multi-shot
  (auto and custom), first-and-last frame, native audio (dialogue, dialects,
  multilingual), motion intensity, and negative prompting. Invoke this skill
  whenever the user asks for a video clip on the Kling stack (non-Omni).
user-invocable: true
---

# Prompting for Kling 3.0

Use this skill to author prompts for Kuaishou's Kling 3.0 video model
(non-Omni variant). Kling 3.0 is a unified multimodal model: it
synthesizes audio (dialogue, ambient, SFX), supports multi-shot
narratives up to 15 seconds, binds elements (subjects, props, sets) for
consistency, and accepts a separate negative-prompt parameter.

Modes covered:

- **T2V** — text-to-video, no reference. Single shot or multi-shot.
- **I2V** — image-to-video; the image is the start frame. Optionally bind
  elements with up to 3 reference images per element.
- **MR (element binding)** — multi-reference structured by **element**:
  each element (subject, prop, set) takes 1–3 reference images.
- **F/L** — first-and-last frame, two images that anchor a beat.
- **Multi-Shot** — Auto or Custom; up to 6 shots per generation, total 3–15
  seconds. Custom Multi-Shot lets you set per-shot duration.
- **Audio** — native synthesis: dialogue with quoted lines, multi-character
  coreference (3+ speakers), dialects/accents, and five languages.

The shared discipline lives in
`../../../references/prompt-discipline.md`,
`../../../references/cinematography.md`,
`../../../references/lighting.md`,
`../../../references/photography.md`, and
`../../../references/production-design.md` (paths relative to
this skill folder). Read those before writing a prompt for the first
time.

## When to invoke

- User asks for a generated video clip and names Kling, Kling 3, Kling
  3.0, or Kuaishou's video model (non-Omni).
- User has a still and wants it animated on the Kling stack.
- User has multiple stills per element (1–3 per element) and wants them
  bound for consistency.
- User has a start frame and end frame.
- User wants multi-shot output (shot-reverse-shot dialogue, sequenced
  storyboard) up to 15 seconds.
- User wants synthesized audio: dialogue, multilingual, dialects.

Do not invoke for stills, for non-Kling video stacks, or for Kling 3.0
Omni (use `kling-3-0-omni` instead, which adds video-character reference
and per-element voice binding).

## Inputs the consuming agent provides

1. **Mode** — one of `T2V`, `I2V`, `MR`, `F/L`. (Multi-shot and audio
   are layered on top of any mode.)
2. **Subject brief** — what the user wants. Free prose.
3. **Reference inputs**:
   - I2V: one image (start frame). Optional element bindings (1–3
     images per element).
   - MR: a list of elements, each with 1–3 reference images.
   - F/L: exactly two images (`first`, `last`).
4. **Aspect ratio** — `16:9`, `9:16`, `1:1`, or `4:5`.
5. **Duration** — 3–15 seconds.
6. **Multi-shot intent** — `single`, `auto`, or `custom` (with per-shot
   durations summing to total duration; max 6 shots).
7. **Audio intent** — optional. If present, may include dialogue lines
   (with attribution and language), ambient and SFX cues, voice tone.
8. **Motion intent** — what changes across the clip.
9. **Motion intensity** — optional 0.1–1.0 scalar (subtle to dynamic).
10. **Negative prompt** — optional separate parameter; NOT counted in the
    prompt-character budget.

## Six-clause skeleton (video)

Apply the cross-model six-clause skeleton:

1. Subject
2. Action / pose (initial state)
3. Setting / context
4. Style / medium
5. Camera / framing / light
6. Motion / beat — what changes across the clip (or, for multi-shot,
   per-shot beats)

Total prose under ~500 visible characters per Kling's UI guidance for a
single shot; multi-shot prompts can run longer (the official UI accepts
up to ~2,500 characters total). Per-model character counts go in the
build-script validator.

## Mode 1 — Text-to-video (T2V)

### Strengths

- Strong dynamic motion and physics on continuous beats.
- Painterly and stylised aesthetics hold up better than peers.
- Multi-shot understanding for shot-reverse-shot dialogues.
- Native audio with multi-character coreference.

### Known weaknesses

- Ultra-close beauty/skin detail (frame slightly wider).
- Multiple subjects performing complex independent actions
  simultaneously (stagger or split into shots).
- Numerical specifics ("5 trees", "6 puppies") — say "a small cluster".
- Physics-defying actions (levitation, impossible balance) — fights you.

### T2V single-shot template

```
<Subject in one short sentence>.
<Initial pose or state in one short sentence>.
<Setting and time in one short sentence>.
<Style anchor in one short sentence — see production-design.md>.
<Camera scale, lens, angle, light direction, light quality.>
Motion: <what plays out across the clip; describe the arc and the
physics, not just the appearance>.
[Optional] Motion intensity: <0.1–1.0>.
```

## Mode 2 — Image-to-video (I2V) with element binding

A single image is the start frame. Kling 3.0 generates motion forward.
**Element binding** (the 3.0 upgrade): after uploading the start frame,
attach 1–3 reference images per element (e.g. front + side + expression
of a character) to lock identity through camera motion.

### I2V template

```
Reference (start frame): <one-line description of the supplied image>.
[Optional] Bound elements:
  Element 1 — <name and role>: <count> images (1–3).
  Element 2 — <name and role>: <count> images (1–3).
Motion: <what changes from the start frame across the clip>.
Camera: <hold or move; if hold, say "static"; if move, name the move>.
Style and lighting hold: <match the reference unless explicitly
overriding>.
```

## Mode 3 — Multi-reference, element binding (MR)

Kling 3.0's MR mode is **element-structured**: each element (subject,
prop, set) takes **1 to 3 reference images**. The model uses these to
lock identity across camera motion. Multiple elements per scene are
supported.

### Element structure

```
Elements:
  Element 1 — <name and role, e.g. "subject's face">:
    image 1.1
    [up to 3 per element]
  Element 2 — <name and role, e.g. "the leather satchel">:
    image 2.1
    image 2.2
  ...
```

Practical guidance:

- 1 to 3 images per element. Beyond 3 → composite drift.
- Two to four elements per prompt. Beyond that, elements blend.
- Each element's images should depict the same thing from different
  angles or in different lighting. Do not mix two different subjects in
  one element.
- For character elements, you can also bind a voice tone (separate from
  the visual element) so the same character speaks consistently across
  shots.

### MR prompt template

```
Elements:
  Element 1 — <name and role>: <count> images (1–3).
  Element 2 — <name and role>: <count> images (1–3).
  ...
Subject and action: <as for T2V>.
Setting: <as for T2V>.
Style and lighting: <inherits from elements where named>.
Camera: <as for T2V>.
Motion: <the beat or the multi-shot sequence>.
[Optional] Audio: <as in §Audio mode>.
```

## Mode 4 — First-and-last frame (F/L)

Two images: first frame and last frame. Kling renders the beat between
them.

```
First frame: <one-line description of the first-frame image>.
Last frame: <one-line description of the last-frame image>.
Motion: <one short sentence describing the beat from first-frame state
to last-frame state>.
Camera: <hold or move>.
Style and lighting hold: <inherits from the two reference frames; name
which to follow if they differ>.
```

## Mode 5 — Multi-Shot (Auto and Custom)

Multi-Shot is core to Kling 3.0. Up to 6 shots per generation; total
duration 3–15 seconds.

- **Auto Multi-Shot** — flip the "Multi-Shot" switch on; let the model
  plan transitions, framing, and angles from your prompt. Best for
  shot-reverse-shot dialogue scenes and naturalistic coverage.
- **Custom Multi-Shot** — also requires "Multi-Shot" on; you specify
  each shot's content and duration explicitly. Best for precise pacing,
  commercials, and sequences where a specific 3 + 5 + 2-second split
  matters.

### Inline multi-shot template (Auto or freeform)

```
<Scene setup paragraph: location, time, atmosphere, ambient audio.>
Shot 1: <camera + character + action>. <Optional dialogue line>.
Shot 2: <camera move or new angle>. <Optional dialogue line>.
Shot 3: <reaction shot>. <Optional dialogue line>.
Shot 4: <resolution beat>.
[Style anchor as a final clause.]
```

### Custom Multi-Shot template (precise per-shot duration)

```
Shot 1 (Xs): <single beat, single camera move, optional one line of
  dialogue>.
Shot 2 (Ys): <next beat>.
Shot 3 (Zs): <payoff>.
[Total duration X+Y+Z must be 3–15 s.]
```

### Anti-pattern: still calling for "one beat per prompt"

Kling 3.0 (non-Omni) **no longer renders only one beat per prompt** —
that was the 2.6/legacy behaviour and is now obsolete. If a previous
agent or doc tells you to chain clips at the consuming-agent layer for
multi-beat work, ignore that legacy guidance and use Multi-Shot.

## Audio mode (native; layered on T2V/I2V/MR/F/L)

Kling 3.0 synthesizes audio natively. Audio is written **inline** with
the visuals; the model lip-syncs and voice-places against the prompt.

### Dialogue attribution

Pattern: `[Character name + descriptor, tone, optional language]: "line."`

- **Anchor every line with a physical action immediately before it.**
  "She slams her hand on the table." then `[Detective, sharp]: "Where
  is the truth?"`.
- **Use linking words** between lines (*immediately, then, after a
  beat, pause, suddenly*) to keep lip-sync clean.
- **Multi-character coreference (3+ named speakers).** Kling 3.0 handles
  three or more named speakers in a single scene, attributing each line
  correctly when characters are named verbatim.

### Multilingual

Five languages: Chinese, English, Japanese, Korean, Spanish. Tag the
language inline. Out-of-set languages auto-translate to English.

### Dialects and accents

Tag the speaker's dialect or accent in the dialogue label. Robust
support for Chinese dialects (Northeastern, Beijing, Taiwanese,
Cantonese, Sichuanese) and English accents (American, British, Indian).

### Ambient and SFX

Ambient: write at scene-top as a setting sentence ("Rain tapping softly
on the roof. Low lo-fi music from the speakers.").
SFX: explicit, optionally with `SFX:` prefix ("SFX: thunder cracks in
the distance.").
**Physics-derived audio** is the highest-leverage trick: describe the
surface and material, and the model infers the sound. "Footsteps on
concrete" beats "add ambient footsteps".

### Audio control vocabulary

- **Structured naming** — unique consistent character labels.
- **Visual anchoring** — describe an identifying action before each line.
- **Audio details** — distinctive tone/voice descriptor per character,
  reused.
- **Temporal control** — *immediately / then / pause / suddenly* between
  lines.

## Motion intensity (0.1–1.0)

Drop a numerical intensity into the action sentence to control energy:

- **0.1–0.3** — subtle (breathing, slight sway, slow blink).
- **0.4–0.6** — natural (walking, conversational gestures).
- **0.7–1.0** — dynamic (running, fast camera moves, intense action).

Word-only equivalents work too: *barely-perceptible / natural / explosive*.

## Physics-based motion (anti-pattern fixes)

- **Walking — heel-first.** "Each foot lands heel-first, then rolls
  forward with visible weight transfer; arms swing naturally at the
  sides." Prevents floating-feet AI moonwalk.
- **Hands — anchor to an object.** "Her fingers grip the rim of the
  ceramic mug" beats "she gestures with her hands." Hand-against-object
  beats hand-in-air every time.
- **Text on objects — declare stability.** For on-screen text or logos:
  "ensuring the text 'X' remains stable and readable throughout the
  motion."

## Negative prompt (separate parameter)

Kling 3.0 supports a separate `negative_prompt` field. **It does NOT
count against the visible prompt's character budget.** Use it for
recurring artifacts; keep targeted, not over-stacked.

Drop-in default:

```
motion blur, face distortion, warping, morphing, inconsistent physics,
floating objects, unnatural movements, extra limbs, background shifting,
duplicated characters, low detail, watermark, text artifacts
```

Targeted negatives by problem (face morphs, hand errors, physics
breaks, background drift, lip-sync errors) live in
`references/translation-notes.md`.

## Worked examples

### Example 1 — Multi-character dialogue (Auto Multi-Shot, native audio)

Outdoor terrace of a European villa, by a dining table with a blue and
white checkered tablecloth, soft afternoon ambient noise of cicadas and
distant water. The young woman, in a blue and white striped short-sleeve
shirt and khaki shorts, sits barefoot opposite a young man in a white
T-shirt.

Shot 1 — medium two-shot, slow push in. The young woman swirls juice in
a glass; her gaze drifts toward the distant woods. `[Young Woman, soft
contemplative tone]: "These trees will turn yellow in a month, won't
they?"`

Shot 2 — close-up reverse on the young man. He lowers his head and then
looks up. `[Young Man, gentle hopeful tone]: "But they'll be green
again next summer."`

Shot 3 — medium close-up on the young woman, smiling. `[Young Woman,
amused warm tone]: "Are you always this optimistic? Or just about
summer?"`

Shot 4 — close-up on the young man, lifting his head. `[Young Man,
quiet earnest tone]: "Only about summers with you."`

Style: Naturalistic film print emulation, golden Mediterranean
late-afternoon palette. Motion intensity 0.4.

### Example 2 — Time-coded performance (Custom Multi-Shot, single character)

`Shot 1 (2s)`: Medium shot — Goro, weathered face, gestures emphatically
with a lit cigarette walking toward a row of dented industrial metal
lockers. Smoke curls around his hand as he punctuates each beat.
`Ambient: faint organic crackle of the cigarette tip; low room tone.`

`Shot 2 (2s)`: Close-up — Goro's face fills the frame, eyes wide, jaw
working. `[Goro, intense gravelly tone]: "You opened it — pop — and
heat hit your face."`

`Shot 3 (2s)`: Cutaway — Kaiko, young woman with a blonde buzzcut and a
scar on her eyebrow, looks down at her athletic-taped hands. Stoic,
absorbing.

`Shot 4 (2s)`: Close-up — Goro's mouth forms the word "pop"; a small
puff of white smoke escapes on the consonant. `[Goro, settling]: "Now?
Wax paper. Burger sweats, gets soggy. Bun dissolves into meat."`

Style: 35mm handheld film camera, natural grain, subtle organic shake.
Motion intensity 0.6.

## Translation notes

Model-specific quirks (multi-shot rules, element-binding rules, native
audio, dialect support, motion intensity, negative-prompt boundary,
character-budget) live in `references/translation-notes.md`.

## Observability Checkpoint

Before emitting the final prompt to the model, emit a structured log line:

```json
{
  "skill": "gen-prompting-kling-3-0",
  "checkpoint": "prompt-emit",
  "inputs": {
    "mode": "T2V|I2V|MR|F/L",
    "multi_shot": "single|auto|custom",
    "shot_count": 0,
    "element_count": 0,
    "images_per_element": [],
    "audio_present": false,
    "dialogue_languages": [],
    "motion_intensity": null,
    "negative_prompt_present": false,
    "aspect_ratio": "16:9",
    "duration_s": 0
  },
  "decision": "emit|defer-to-user",
  "rationale": "<one-line: clauses present; multi-shot vs single chosen; element image counts within 1–3; audio attribution applied; negative prompt boundary respected>"
}
```

Pick `defer-to-user` if any element has 0 or more than 3 images, if a
Custom Multi-Shot's per-shot durations don't sum to the requested total,
or if dialogue is supplied without speaker attribution.

## Closing — validation

Run the helper script `scripts/build-prompt.py` to assemble and validate
the prompt before emitting it. The script enforces the six-clause
skeleton, refuses negation-only prompts, validates per-element image
counts (1–3) for MR, validates Custom Multi-Shot durations, and prints
the assembled prompt to stdout.

```
python3 scripts/build-prompt.py --mode T2V --subject "..." --action "..." \
    --setting "..." --style "..." --camera "..." --motion "..."
```

For MR, pass each element as a JSON-encoded element spec; for Custom
Multi-Shot, pass `--shot` repeated with `{"duration_s": N, "text":
"..."}`. See `scripts/build-prompt.py --help`. The script's tests live
in `scripts/test_build_prompt.py` and run with
`python3 scripts/test_build_prompt.py`.
