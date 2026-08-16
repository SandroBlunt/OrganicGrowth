# Translation notes — Veo 3.1

Model-specific rules for Veo 3.1 that override the cross-model defaults
in `../../../references/prompt-discipline.md`.

## Mode exclusivity

- **Ingredients to Video (multi-reference) and F/L are mutually
  exclusive in a single call.** Choose one or the other; the build
  script enforces this.
- **I2V is single-image-only**: the supplied still is treated as the
  first frame. Do not mix with first/last-frame inputs.

## Mode naming

- **Ingredients to Video** is the official name for what previous
  versions of this skill called "MR" (multi-reference). MR / R2V are
  legacy aliases. The build script accepts `--variant mr` for backward
  compatibility but the canonical mode label is `Ingredients`.

## Motion clause is mandatory

- The motion clause (sixth in the skeleton) is the single highest-
  signal clause for Veo. Empty motion → the model fills with bias and
  the clip often defaults to a slow zoom or static hold.
- Describe the arc, not every frame. "Subject lifts arms from sides to
  overhead" beats "frame 1 arms down, frame 2 mid-rise, frame 3
  overhead" — Veo interpolates better than it follows shot lists.

## Audio synthesis

- Veo 3.1 supports synthesized audio: ambient, foley, dialogue, SFX,
  and music intent.
- **Dialogue syntax is explicit.** Use one of:
  - `<Speaker> says, "<line>."`
  - `<Speaker> says in a <tone> voice, "<line>."`
  Speaker attribution is required for accurate lip-sync.
- **SFX uses an explicit `SFX:` prefix.** Example: `SFX: thunder
  cracks in the distance.`
- **Ambient uses `Ambient noise:` prefix.** Example: `Ambient noise:
  the quiet hum of a starship bridge.`
- **All audio AFTER all visual description.** Never interleave.
- Audio decisions should be explicit. Either include an audio block
  or omit it deliberately; do not leave it ambiguous.

## Timestamp prompting (multi-shot in one generation)

- Bracket format: `[MM:SS-MM:SS]` per segment.
- Each segment can have its own cinematography, subject focus, and
  audio.
- Segments must sum to the requested duration (4, 6, or 8 s).
- Up to 4 segments fits comfortably in an 8-second clip.

## Add/Remove Object mode (lower priority)

- **Uses the Veo 2 model.**
- **Does NOT generate audio.**
- Preserves original composition; only the named object is changed.
- When the user needs audio, switch to a 3.1 mode (T2V/I2V/
  Ingredients/F/L).

## Aspect ratio

- Supported ratios: 16:9 (preferred) and 9:16. The build script
  rejects other ratios.

## Duration

- Discrete options: 4, 6, or 8 seconds. No other integers, no floats.
- **Reference-mode constraint:** any of I2V / Ingredients / F/L forces
  duration to 8 seconds.
- The per-call duration cap is set by the API tier. The consuming
  agent is responsible for chaining clips when the user wants longer
  sequences.

## Reference type on Veo 3.1

- Only `"asset"` reference type is supported on 3.1.
- Style references require Veo 2.

## F/L hand-off from Nano Banana 2

- The Nano Banana 2 frame-sequence mode is designed to hand off frames
  1 and N to Veo F/L. Camera state must match between the two stills;
  if it drifts, Veo's interpolation breaks.
- Workflow: NB2 generates start frame → NB2 generates end frame → Veo
  3.1 F/L renders the in-between with the F/L prompt describing the
  arc (camera + motion + dialogue/audio).

## Negation behaviour

- Negation in prose is unreliable. Use positive description.
- The dedicated `negative_prompt` field accepts **noun phrases only**
  (e.g. `blurriness, distortion, extra limbs`). NOT `"no X"` or `"don't
  show Y"` syntax.

## SynthID watermark

- All Veo 3.1 outputs are marked with **SynthID** to indicate AI
  origin. The user cannot opt out. Surface to consumers when relevant.

## Cinematography in opening position

- Veo's encoder weights the opening phrase for spatial framing. Always
  lead with shot type and camera movement. The build script does not
  enforce this (the order of clauses is the agent's responsibility);
  document the choice in the Observability Checkpoint.

## Mix-budget heuristic

- Not applicable to Veo 3.1: reference inputs are images only (1–3 in
  Ingredients, two in F/L, one in I2V). No video or audio reference
  inputs.

## Production design anchors

For the `Style & ambiance` clause, prefer named traditions over
generic adjectives. The shared catalogue lives in
`../../../references/production-design.md`. Strong for Veo: format-and-
stock anchors ("shot on 1980s color film, slightly grainy"),
anamorphic lens flare, named director + format pairings (e.g.
"Christopher Nolan grounded, IMAX 70mm").

## Audit

Last reviewed: 2026-04-28. Cross-check against
`references/official-guidelines.md` (Google Cloud + DeepMind sources)
before relying on any rule above.
