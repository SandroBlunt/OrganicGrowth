---
name: gen-prompting-seedance-2-0
description: >
  Translate a user's video-generation intent into a production-ready prompt
  for ByteDance's Seedance 2.0. Covers text-to-video, image-to-video,
  multi-reference (per-modality caps of 9 images, 3 videos, 3 audio with a
  documented mix-budget heuristic), Edit vs Reference distinction,
  shot-script format with sub-second timecodes, the @Tag and <<<Image>>>
  notations, and first-and-last frame mode. Invoke whenever the user asks
  for a video clip on the Seedance stack.
user-invocable: true
---

# Prompting for Seedance 2.0

Use this skill to author prompts for ByteDance's Seedance 2.0 video
model. It covers four modes plus the **shot-script** technique that
dominates community results.

Modes:

- **T2V** — text-to-video, no reference.
- **I2V** — image-to-video, single image as starting frame.
- **MR** — multi-reference, per-modality caps: up to 9 images, 3
  videos, 3 audio clips (12 total). **Mix-budget heuristic applies.**
- **F/L** — first-and-last frame.

Layered techniques (apply on top of any mode):

- **Edit vs Reference** — when uploading a video, declare intent
  explicitly (Edit modifies; Reference extracts).
- **Shot-script format** — `[Basic Settings]` block + per-shot
  `[00:00–00:02]` timecode blocks + `[Constraints]` block. Highest-
  quality output mode for production work.
- **Sub-second timecodes** — fractional precision (`[0.0s–0.5s]`,
  `0.3s`, `0.5s`) for micro-timing of emotion beats and reaction
  shots.
- **Notation** — `@Image1` / `@Video1` / `@Audio1` is canonical.
  `<<<Image1>>>` is an accepted alternative used in Japanese-language
  community prompts and morphing templates. Stay consistent inside one
  prompt.

The shared discipline lives in
`../../../references/prompt-discipline.md`,
`../../../references/cinematography.md`,
`../../../references/lighting.md`,
`../../../references/photography.md`, and
`../../../references/production-design.md` (paths relative to
this skill folder). Read those first.

## When to invoke

- User asks for a generated video clip and names Seedance, Seedance 2,
  Seedance 2.0, or ByteDance's video model.
- User has a still and wants it animated on the Seedance stack.
- User has a mix of stills, short clips, and audio references (MR).
- User has a start frame and end frame (F/L).
- User wants a multi-shot shot-script with timecoded beats.
- User wants to extend or edit an existing Seedance clip.

Do not invoke for stills, for non-Seedance stacks, or for clips that
exceed the per-call duration cap (the consuming agent chains).

## Inputs the consuming agent provides

1. **Mode** — one of `T2V`, `I2V`, `MR`, `F/L`.
2. **Subject brief** — what the user wants. Free prose.
3. **Reference inputs**:
   - I2V: one image.
   - MR: lists keyed by modality — `images` (≤ 9), `videos` (≤ 3),
     `audios` (≤ 3). Subject to mix-budget heuristic.
   - F/L: exactly two images.
4. **Aspect ratio** — `16:9` or `9:16` (also `1:1`, `4:3`, `2.35:1` per
   community usage; document in metadata).
5. **Duration** — 4 to 15 seconds per call.
6. **Style anchor** — optional. Strongly prefer named traditions from
   `../../../references/production-design.md`.
7. **Motion intent** — what changes across the clip.
8. **Audio intent** (optional) — Seedance 2.0 supports synthesized
   audio: ambient, foley, dialogue (8+ languages, lip-synced).
9. **Edit vs Reference intent** (when a video reference is present) —
   declare which.

## Six-clause skeleton (video)

Apply the cross-model six-clause skeleton:

1. Subject
2. Action / pose (initial state)
3. Setting / context
4. Style / medium
5. Camera / framing / light
6. Motion / beat — what changes across the clip

Total prose under ~260 words for single-pass T2V; multi-shot
shot-scripts can run longer because each shot is itself concise. The
official guide recommends 60–100 words per shot; degradation begins
past ~260 words for a single shot.

## Mode 1 — Text-to-video (T2V)

### 6-step formula (single-pass)

```
[Subject], [Action], in [Environment], camera [Camera Movement],
style [Style], avoid [Constraints]
```

Each element gets one short clause. Total length 60–100 words.

### T2V worked example (single-pass)

```
A skateboarder lands a clean trick in an empty dawn parking lot,
camera low tracking shot then subtle rise, naturalistic film print
emulation with cool morning palette, 6 seconds, 16:9, avoid jitter
and bent limbs.
```

## Mode 2 — Image-to-video (I2V)

```
@Image1 as the first frame.
Animate: <preserve composition and colors; describe what moves>.
Camera: <slow push-in / static / etc.>.
Audio (optional): <ambient>.
Duration: <Ns>.
```

Don't re-describe what's in the image. Focus on motion + camera.

## Mode 3 — Multi-reference (MR)

Per-modality caps: ≤9 images, ≤3 videos, ≤3 audio (≤12 total).

### Edit vs Reference (critical for video inputs)

Always declare intent when a video is supplied:

- **Edit** = modify the existing video directly (replace a character,
  remove an object, change the plot). Format:
  `In @Video1, replace the woman with @Image1...`
- **Reference** = extract a quality from the video (camera movement,
  motion style, rhythm) and apply to a new generation. Format:
  `Reference @Video1's camera movement for a new scene...`

Conflating these is the most common cause of "Seedance ignored my
upload". Be explicit.

### Mix-budget heuristic (vendor-unconfirmed)

The official source publishes per-modality caps but does not publish
balance guidance. Heuristic:

- **Image floor when video or audio present** — at least 2 images for
  identity grounding. Without it, video and audio references drift
  the subject.
- **Effective video cap of 2** even though 3 is documented. Three video
  refs almost always blend.
- **Effective audio cap of 2** even though 3 is documented. Three audio
  refs blend into noise.
- **Per element, name the role** explicitly: motion vs style vs
  subject identity vs camera replication.

The build script raises a validation error when the heuristic is
violated. Pass `override_mix_budget=True` to bypass.

### MR prompt template

```
References:
  Images (<n>/9):
    1. <role: e.g. character ref / first frame / style ref / environment>
    ...
  Videos (<n>/3):
    1. [Edit | Reference] @Video1 — <role: motion source / camera / style / rhythm>
    ...
  Audios (<n>/3):
    1. @Audio1 — <role: background BGM / ambient / voice style>
    ...
Subject and action: <as for T2V>.
Setting: <as for T2V>.
Style and lighting: <inherits from references where named>.
Camera: <as for T2V>.
Motion: <as for T2V>.
Audio (optional): <as for T2V>.
```

## Mode 4 — First-and-last frame (F/L)

```
@Image1 as the first frame and @Image2 as the last frame.
Motion: <how the subject moves from first-frame state to last-frame
state>.
Camera: <hold or move>.
Style and lighting hold: <inherits from the two reference frames>.
Audio (optional): <as for T2V>.
```

## Shot-script format (highest-quality mode)

The shot-script format is what top community results use. Structure:

```
[Basic Settings]
Style: <named tradition — see production-design.md>
Duration: <total seconds>
Aspect ratio: <ratio>

[00:00–00:04] Shot 1: <Shot Name (Camera Type)>.
<Scene description with physical details>.
<Character action with specific body language>.
<Audio cue>.

[00:04–00:07] Shot 2: <Shot Name (Camera Type)>.
...

[00:07–00:10] Shot 3: <Shot Name (Camera Type)>.
...

[Constraints]
<Consistent constraints. Physics requirements. Palette notes.>
```

### Sub-second timecodes

For emotion beats, reaction shots, and rapid cuts:

- `[0.0s–0.5s]`, `[0.5s–1.0s]` — sub-second cut sequences.
- `0.3s`, `0.4 seconds`, `200–400 milliseconds` — pause/hold beats.

Rule of thumb: use sub-second markers when the beat is shorter than 1
second AND timing precision changes the meaning of the shot. Don't
over-fragment.

### Shot-script worked example (Mars astronaut sequence)

```
[Basic Settings]
Style: Denis Villeneuve sci-fi epic, IMAX 70mm, desaturated teal-orange palette
Duration: 10 seconds
Aspect ratio: 16:9

[00:00–00:04] Shot 1: The Scale (Extreme Wide Shot).
A lone astronaut in a white spacesuit stands at the edge of an
enormous crater on Mars. Red dust blows across the visor in gusts.
The crater stretches to the horizon — the scale of nature dwarfs the
human figure completely. Deep rumbling bass audio.

[00:04–00:07] Shot 2: The Discovery (Push-in to Close-up).
Camera slowly pushes from the wide shot into a tight close-up of the
astronaut's helmet visor. In the curved reflection, we see Earth —
tiny, blue, impossibly far away. The astronaut's breathing is
audible. Anamorphic lens flare streaks across the frame.

[00:07–00:10] Shot 3: The Decision (Low Angle, Static).
From below, the astronaut steps forward off the crater edge — a leap
of faith into the unknown. Dust particles float in slow motion around
the boots. Camera holds steady as the figure descends. Cut to black.

[Constraints]
Consistent spacesuit design. Realistic Mars dust physics. Epic
orchestral audio swell on final shot.
```

### Seven-image morphing template (sub-mode)

```
[Basic Settings]
structure: Single continuous shot (no cuts)
progression: Morphing N images sequentially
visibility: Each image clearly recognizable for an instant (no stopping)
transition: Always smooth and continuous
style: Cinematic, high-definition, dynamic, no flicker

[Prompt Body]
Start from <<<Image1>>>.
Seamless single shot, transforming in order:
<<<Image1>>> -> <<<Image2>>> -> ... -> <<<ImageN>>>.
Camera is constantly moving. Subject recognizability maintained.

[Camera Behavior]
Allowed: push-in, pull-out, horizontal tracking, orbit, light perspective.
Prohibited: sudden blur, loss of subject, unnatural jumps.

[Constraints]
Cut editing prohibited (complete single shot).
Reuse of the same effect prohibited.
Flicker, noise, breakdown prohibited.
```

## Camera rules (recap of high-impact items)

- **One primary camera instruction.** If you need compound motion,
  describe **primary then secondary**: `low tracking shot then subtle
  rise`.
- **Separate camera movement from subject movement.** Two distinct
  sentences.
- **If the camera is static, the world must move.** Add 2–3
  micro-motions (steam, fabric sway, blinking, condensation,
  drifting dust). Never both still at the same time.
- **Use rhythmic descriptors,** not technical specs (no f-stops, no
  ISO).

## Anti-patterns

- **Edit vs Reference conflated.** Always declare which when a video
  is uploaded.
- **"Fast" alone.** Causes total chaos. Make only one element fast.
- **Camera + subject motion mixed in one sentence.** "Spinning camera
  around a dancing person" → uncontrollable shake.
- **No style anchor.** "Cinematic" alone is too vague; use a named
  tradition.
- **Static camera with static world.** Dead clip. Add micro-motions.
- **Mixing `@Image1` and `<<<Image1>>>` notation in the same prompt.**
  Pick one and stay consistent.

## Community patterns (pointers; full detail in references)

- **JSON-style structured prompts** for VFX-heavy and POV pieces.
- **Multi-chapter long-form structure** when planning a 30–90 s arc
  end-to-end before any generation.
- **Hard-cut testing pattern** — `"no fade-in/fade-out, no
  transitions"` forces hard cuts; useful for music-video rhythm and
  for stress-testing identity consistency under aggressive cutting.

See `references/translation-notes.md` § Community patterns for the
expanded versions.

## Production design anchors

For the **Style** clause, prefer named traditions over adjectives. The
shared catalogue lives in `../../../references/production-design.md`.
Strong for Seedance: Tsui Hark Wuxia, DaVinci industrial-grade color
grading, naturalistic film print emulation, 100% real-life shooting
texture, Hollywood IMAX blockbuster quality.

## Translation notes

Model-specific quirks (per-modality caps, mix-budget heuristic, audio
behaviour, Edit vs Reference, shot-script, sub-second timecodes,
notation alternatives) live in `references/translation-notes.md`.

## Observability Checkpoint

```json
{
  "skill": "gen-prompting-seedance-2-0",
  "checkpoint": "prompt-emit",
  "inputs": {
    "mode": "T2V|I2V|MR|F/L",
    "image_ref_count": 0,
    "video_ref_count": 0,
    "audio_ref_count": 0,
    "edit_vs_reference": "edit|reference|n/a",
    "aspect_ratio": "16:9",
    "duration_s": 0,
    "audio_intent_present": false,
    "shot_script_used": false,
    "sub_second_timecodes_used": false,
    "mix_budget_within_heuristic": true
  },
  "decision": "emit|defer-to-user",
  "rationale": "<one-line: clauses present; per-modality caps respected; mix-budget heuristic respected or override acknowledged; if a video reference is present, Edit vs Reference declared>"
}
```

Pick `defer-to-user` if any per-modality cap is exceeded, if the
mix-budget heuristic is violated and the user has not opted to
override, or if a video reference is present without explicit Edit vs
Reference intent.

## Closing — validation

Run the helper script `scripts/build-prompt.py` to assemble and
validate the prompt before emitting it. The script enforces the
six-clause skeleton, refuses negation-only prompts, applies the
per-modality caps and the mix-budget heuristic to MR, and prints the
assembled prompt to stdout.

```
python3 scripts/build-prompt.py --mode T2V --subject "..." --action "..." \
    --setting "..." --style "..." --camera "..." --motion "..."
```

For MR, pass each reference as a JSON object `{"type": "image|video|
audio", "role": "..."}`; see `scripts/build-prompt.py --help`. The
script's tests live in `scripts/test_build_prompt.py` and run with
`python3 scripts/test_build_prompt.py`.
