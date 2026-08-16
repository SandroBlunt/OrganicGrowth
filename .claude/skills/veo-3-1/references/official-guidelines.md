# Official guidelines — Veo 3.1

Distilled summary of Google's prompt guidance for Veo 3.1. Any rule
below that conflicts with the latest official source MUST be treated
as stale.

## Sources

- **Primary URL (Google Cloud blog):**
  https://cloud.google.com/blog/products/ai-machine-learning/ultimate-prompting-guide-for-veo-3-1
- **Vendor doc — Ultimate prompting guide:**
  `Ultimate_prompting_guide_for_Veo_3.1_Google_Cloud_Blog.md`.
- **Vendor doc — Veo 3.1 Prompt Guide:** `Veo_3.1_Prompt_Guide.md`.
- **Vendor doc — Best Veo 3.1 Prompts (LTX Studio):**
  `Veo_3.1_Prompt_Guide_Best_Veo_3.1_Prompts_LTX_Studio.md`.
- **Vendor skill bundle:** `veo-31-prompt-optimizer.skill`.
- **Secondary URL (DeepMind overview):** https://deepmind.google/models/veo/
- **Fetched at:** 2026-04-28
- **Vendor:** Google (Google Cloud + DeepMind)

## Headline points (distilled, 2026-04-28)

- Prompt with the five-part formula (Cinematography + Subject + Action
  + Context + Style & ambiance), plus an Audio block AFTER all
  visuals.
- **Cinematography leads.** The encoder weights the opening phrase
  for spatial framing.
- **Variable clip length:** 4, 6, or 8 seconds (discrete).
- **Aspect ratio:** 16:9 or 9:16.
- **Resolution:** 720p or 1080p.
- **Synthesized audio** is rich: dialogue (with explicit speaker
  attribution and quoted lines), SFX (with `SFX:` prefix), ambient
  noise (with `Ambient noise:` prefix), music intent.
- **Reference inputs:**
  - **I2V:** single image as starting frame.
  - **Ingredients to Video** (formerly MR / R2V): 1 to 3 reference
    images for character, object, scene, or style consistency. Audio
    generation supported.
  - **F/L:** first and last frame; the model interpolates motion;
    audio supported.
  - **Add/Remove Object:** introduces or removes an object in an
    existing video. **Uses Veo 2 model. No audio.**
- **Mode exclusivity:** Ingredients to Video and F/L cannot be combined
  in one call.
- **Timestamp prompting:** direct a multi-shot sequence inside a
  single clip via `[MM:SS-MM:SS]` brackets.
- **Negative prompt** uses noun phrases only.
- **SynthID watermark** on every output.

## Strengths called out by the source

- Adherence to motion descriptions including shot-list-style.
- Native audio synthesis with dialogue and lifelike lip-sync.
- High visual fidelity at 1080p / 16:9.
- Reliable subject-identity preservation in F/L when the two frames
  share camera state.
- Multi-shot via timestamp prompting in one generation.
- F/L hand-off from Nano Banana 2 is a documented production workflow.

## Caveats called out by the source

- Negation is best-effort in prose; use the noun-phrase negative
  prompt field.
- Ingredients to Video and F/L cannot be combined.
- Duration is discrete (4 / 6 / 8 s) and reference-mode forces 8 s.
- Camera drift between F/L frames degrades interpolation.
- Add/Remove Object uses Veo 2 and does not produce audio.

## Mapping to this skill

| Source guidance | Skill location |
| --- | --- |
| Five-part formula + audio block | `SKILL.md` § Six-clause skeleton (video) |
| Cinematography in opening position | `references/translation-notes.md` § Cinematography in opening position |
| Audio (dialogue, SFX, Ambient, Music) | `SKILL.md` § Mode 1 § Audio; `SKILL.md` § Dialogue and SFX syntax; `references/translation-notes.md` § Audio synthesis |
| Ingredients to Video (formerly MR) | `SKILL.md` § Mode 3 — Ingredients to Video |
| F/L | `SKILL.md` § Mode 4 — F/L; `references/translation-notes.md` § F/L hand-off |
| Add/Remove Object (Veo 2, no audio) | `SKILL.md` § Mode 5 — Add/Remove Object |
| Timestamp prompting | `SKILL.md` § Timestamp prompting |
| Mode exclusivity | `references/translation-notes.md` § Mode exclusivity |
| Motion clause primacy | `references/translation-notes.md` § Motion clause is mandatory |
| Negative prompt (noun phrases) | `SKILL.md` § Negative-prompt guidance; `references/translation-notes.md` |
| F/L from Nano Banana 2 | `SKILL.md` § Mode 4 § F/L hand-off |
| SynthID | `references/translation-notes.md` § SynthID watermark |
| Production design anchors | `../../../references/production-design.md` |

## Audit and verification

- **Last reviewed:** 2026-04-28.
- **Verification cadence:** re-fetch all source URLs on every minor or
  major version bump.
- **Vendor unconfirmed assertions:** none. The mix-budget heuristic
  does not apply here.
