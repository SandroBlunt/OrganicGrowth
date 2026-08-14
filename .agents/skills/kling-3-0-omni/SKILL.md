---
name: gen-prompting-kling-3-0-omni
description: >
  Translate a user's video-generation intent into a production-ready prompt
  for Kuaishou's Kling 3.0 Omni — the multi-modal variant of Kling 3.0
  that accepts up to seven mixed inputs (images and short video clips),
  binds voice tone to characters, and supports video character reference
  (3-8 second multi-angle clips). Covers text-to-video, image-to-video,
  video-to-video, multi-reference (with a documented mix-budget
  heuristic), first-and-last frame, native audio with voice binding, and
  multi-shot up to 15 seconds. Invoke this skill when the request mixes
  input types — video clips as references, voice binding, or up to 7
  mixed reference inputs; for plain text/image-driven Kling generation
  use gen-prompting-kling-3-0 instead.
user-invocable: true
---

# Prompting for Kling 3.0 Omni

Use this skill to author prompts for Kuaishou's Kling 3.0 Omni model.
Omni is the multi-modal upgrade of Kling 3.0: it adds **video
character reference** and **per-element voice binding** on top of the
3.0 capabilities (multi-shot, native audio, element binding,
multilingual dialogue, dialects).

Modes covered:

- **T2V** — text-to-video, no reference.
- **I2V** — image-to-video, single image as starting frame.
- **V2V** — video-to-video, single short reference clip as the motion
  / style / subject source.
- **MR** — multi-reference, up to seven mixed inputs (images and short
  video clips). Subject to a **mix-budget heuristic**.
- **F/L** — first-and-last frame.
- **Multi-Shot** — up to 6 shots, total duration up to 15 seconds.
- **Native audio with voice binding** — bind a voice tone to a
  character element so the same character speaks consistently across
  videos and shots.

The shared discipline lives in
`../../../references/prompt-discipline.md`,
`../../../references/cinematography.md`,
`../../../references/lighting.md`,
`../../../references/photography.md`, and
`../../../references/production-design.md` (paths relative to
this skill folder). Read those before writing a prompt for the first
time.

## When to invoke

- User asks for a generated video clip and names Kling Omni or Kling
  3.0 Omni.
- User has a reference video clip and wants its motion / style applied
  to a new generation (V2V).
- User has a 3–8 s character video and wants to extract appearance
  and voice tone (Video Character Reference; Omni's headline upgrade).
- User wants the same character (with bound voice) to appear across
  multiple videos.
- User has a mix of stills and short clips as references (MR).
- User has a still and wants it animated (I2V).
- User has a start frame and end frame (F/L).
- User wants multi-shot output up to 15 seconds with native audio.

Do not invoke this skill for stills, for non-Kling stacks, or for the
non-Omni Kling 3.0 model (use `kling-3-0` instead).

## Inputs the consuming agent provides

1. **Mode** — one of `T2V`, `I2V`, `V2V`, `MR`, `F/L`. Multi-shot and
   audio layer on top of any mode.
2. **Subject brief** — what the user wants. Free prose.
3. **Reference inputs**:
   - I2V: one image.
   - V2V: one short reference clip (3–10 s).
   - MR: a list of mixed inputs, each with a type (`image` or `video`)
     and a role. Total inputs ≤ 7. Subject to mix-budget heuristic.
   - F/L: exactly two images (`first`, `last`).
   - Video Character Reference (sub-mode of MR / I2V): 3–8 s
     character video; system extracts appearance + native voice tone.
   - Multi-image character element: up to 4 images; can attach a 5–30 s
     voice recording to bind a voice tone.
4. **Aspect ratio** — `16:9` or `9:16`.
5. **Duration** — up to 15 s.
6. **Multi-shot intent** — `single`, `auto`, or `custom`.
7. **Audio intent** — optional. May include dialogue (with attribution
   and language), ambient, SFX, voice-tone binding.
8. **Style anchor** — optional. Prefer named traditions from
   `production-design.md`.

## Six-clause skeleton (video)

Apply the cross-model six-clause skeleton:

1. Subject
2. Action / pose (initial state)
3. Setting / context
4. Style / medium
5. Camera / framing / light
6. Motion / beat — what changes across the clip

Total prose under ~150 words for Kling Omni single-shot. Multi-shot
prompts can run longer because each shot is itself concise.

## Mode 1 — Text-to-video (T2V)

```
<Subject in one short sentence>.
<Initial pose or state in one short sentence>.
<Setting and time in one short sentence>.
<Style anchor in one short sentence — see production-design.md>.
<Camera scale, lens, angle, light direction, light quality.>
Motion: <what changes across the clip>.
```

## Mode 2 — Image-to-video (I2V)

```
Reference (frame 1): <one-line description of the supplied image>.
Motion: <what changes from frame 1>.
Camera: <hold or move>.
Style and lighting hold: <match the reference>.
```

## Mode 3 — Video-to-video (V2V)

A short reference clip drives motion, style, or subject identity. Be
explicit about which dimension(s) the reference clip provides.

```
Reference clip (V2V source): <one-line description: subject, motion,
or style of the reference clip>.
Reference clip role: <subject identity | motion source | style source>
(name one or two; do not name all three).
Subject and action: <as for T2V — describe the new subject if the
reference clip is for motion only, or override the reference's subject>.
Setting: <as for T2V>.
Style: <inherit from reference if role includes style, else as for T2V>.
Camera: <as for T2V>.
Motion: <inherit from reference if role includes motion, else as for
T2V>.
```

### Video Character Reference (Omni's headline upgrade)

A 3-to-8-second video of a character — recommended **multi-angle**
(front, ¾, profile) — extracts both the visual likeness and the native
voice tone. Both can be reused across separate videos.

- **Multi-angle is recommended.** Single-angle clips lock the model to
  that angle's lighting and pose; multi-angle gives the model a
  rotational understanding of the character.
- The extracted voice can be replaced with a separate clean voice
  recording if the source audio is noisy.
- **Once a voice is bound to a character, do not re-specify the voice
  tone in the prompt body.** That over-constrains the model.

## Mode 4 — Multi-reference (MR), up to 7 mixed inputs

Kling Omni accepts up to seven mixed inputs in MR mode: any
combination of images and short reference clips, total ≤ 7. Each input
takes a role.

### Mix-budget heuristic (vendor-unconfirmed)

The official guidance does not publish a per-modality cap inside the
overall 7-input budget. Field experience produces the following
heuristic:

- **Cap video clips at 2.** Beyond 2 video references, motion sources
  conflict and produce visible blending.
- **Reserve at least 3 image slots when any video is present.** Images
  carry stable identity that grounds the video references; less than 3
  → identity drift.
- **Audio inputs (if accepted by API tier): cap at 1.** Multiple audio
  references almost always blend into noise.
- **Remaining budget: images.** Up to 7 images total in pure-image MR
  is the documented maximum.

Worked examples:

- 7 images, 0 video, 0 audio — pure-image MR. OK.
- 5 images, 2 video, 0 audio — mixed. OK (within heuristic).
- 3 images, 3 video, 1 audio — over budget on video; reduce to 2 video.
- 1 image, 4 video — under image floor and over video cap; rebalance.

**Vendor-unconfirmed; verify against latest official docs.** This
heuristic lives in `references/translation-notes.md` and may change
between releases.

### MR prompt template

```
References (mixed, up to 7 total; mix-budget heuristic in
translation-notes):
  1. [image] <role>
  2. [video] <role: subject identity | motion | style | character video reference>
  3. [image] <role>
  ...
Subject and action: <as for T2V>.
Setting: <as for T2V>.
Style and lighting: <inherits from references where named>.
Camera: <as for T2V>.
Motion: <as for T2V>.
[Optional] Audio: <as in §Voice binding>.
```

## Mode 5 — First-and-last frame (F/L)

```
First frame: <one-line description of the first-frame image>.
Last frame: <one-line description of the last-frame image>.
Motion: <how the subject moves from first-frame state to last-frame
state>.
Camera: <hold or move>.
Style and lighting hold: <inherits from the two reference frames>.
```

## Multi-Shot (up to 6 shots, up to 15 seconds total)

Omni supports the same Multi-Shot system as 3.0 (Auto and Custom). Up
to 6 shots per generation; total duration up to 15 s.

```
Shot 1 (Xs): <single beat, single camera move, optional one line of
  dialogue>.
Shot 2 (Ys): <next beat>.
Shot 3 (Zs): <payoff>.
[Total duration X+Y+Z must be 3–15 s.]
```

## Voice binding (Omni's distinctive audio capability)

Voice binding lets you attach a voice tone to a character element so
the same character speaks consistently across videos and shots.

Two routes:

1. **Video Character Reference** (Mode 3 sub-mode). Upload a 3–8 s
   clip of the character speaking. The system extracts both
   appearance and the native voice tone.
2. **Multi-image character element + voice clip.** Upload up to 4
   reference images of the character plus a 5–30 s clean voice
   recording (recommended: low background noise, moderate speech
   speed, neutral consistent emotion).

Once bound, **do not re-specify voice tone in the prompt body for
that character.** Re-specifying over-constrains the model and
produces uncanny output. The build script flags this when both a
voice-bound element and an in-prompt voice-tone descriptor for that
character are present.

### Dialogue attribution (same as 3.0)

Pattern: `[Character name + descriptor, tone (optional, omit if voice-
bound), optional language]: "line."`

- Anchor every line with a physical action immediately before it.
- Use linking words (*immediately, then, after a beat, pause,
  suddenly*).
- Multi-character coreference (3+ named speakers) supported.
- Five languages: Chinese, English, Japanese, Korean, Spanish.

## Worked example — multi-character dialogue with pet (3 chars, 8 s)

```
Elements: @Grace (multi-image with bound voice), @Alan (multi-image
with bound voice), @Samoyed (multi-image), @Image (sofa scene).

Shot 1 (3s): Mid-shot, background @Image. @Grace sits on the sofa
eating cookies as @Alan walks in holding @Samoyed. @Samoyed lunges
for the cookie in @Grace's hand. @Grace says, "Hey! Watch your dog!"

Shot 2 (2s): @Alan sits beside her, pulling the leash and lifting
@Samoyed. Close-up. @Alan says, "He just likes cookies more than me."

Shot 3 (3s): Close-up. @Grace smiles and says, "Well, he has good
taste at least."

Style: Naturalistic film print emulation, warm interior practicals.
```

## Translation notes

Model-specific quirks (mix-budget heuristic, V2V role naming, native
audio with voice binding, multi-angle reference best practice, aspect-
ratio rules) live in `references/translation-notes.md`.

## Observability Checkpoint

```json
{
  "skill": "gen-prompting-kling-3-0-omni",
  "checkpoint": "prompt-emit",
  "inputs": {
    "mode": "T2V|I2V|V2V|MR|F/L",
    "image_ref_count": 0,
    "video_ref_count": 0,
    "audio_ref_count": 0,
    "video_character_reference_used": false,
    "voice_bound_element_count": 0,
    "multi_shot": "single|auto|custom",
    "shot_count": 0,
    "audio_present": false,
    "dialogue_languages": [],
    "aspect_ratio": "16:9",
    "duration_s": 0,
    "mix_budget_within_heuristic": true
  },
  "decision": "emit|defer-to-user",
  "rationale": "<one-line: clauses present; MR mix-budget within heuristic; V2V role named; voice binding not double-specified; multi-shot per-shot durations sum to total>"
}
```

Pick `defer-to-user` if MR exceeds the mix-budget heuristic and the
user has not explicitly opted to override it, or if a voice-bound
element also has an in-prompt voice-tone descriptor for the same
character.

## Closing — validation

Run the helper script `scripts/build-prompt.py` to assemble and
validate the prompt before emitting it. The script enforces the
six-clause skeleton, refuses negation-only prompts, applies the
mix-budget heuristic to MR, and prints the assembled prompt to stdout.

```
python3 scripts/build-prompt.py --mode T2V --subject "..." --action "..." \
    --setting "..." --style "..." --camera "..." --motion "..."
```

For MR, pass each reference as a JSON object `{"type": "image", "role":
"subject"}`; see `scripts/build-prompt.py --help`. The script's tests
live in `scripts/test_build_prompt.py` and run with
`python3 scripts/test_build_prompt.py`.
