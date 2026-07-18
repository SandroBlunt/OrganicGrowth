# Official guidelines — Grok Imagine (image generation)

Distilled summary of the prompt guidance for xAI's Grok Imagine image
generation (text-to-image and image editing). Any rule below that
conflicts with the latest source MUST be treated as stale. This skill is
front-end / prompting focused — it covers what you type and the on-screen
options you pick, not API code.

## Sources

- **xAI / Grok Imagine prompting guide (pixeldojo):**
  https://pixeldojo.ai/guides/xai-video-prompting-guide
- **Illumination & portrait photography with Grok Imagine (Medium,
  Carolletta):**
  https://medium.com/@carolletta/mastering-illumination-with-grok-imagine-portrait-photography-f7f9a197e21b
- **Fetched at:** 2026-07-17
- **Vendor:** xAI. Product: Grok Imagine, reached on grok.com, on X, and
  in the Grok Imagine app. The image side ships under the **Grok Imagine
  1.5** suite umbrella; xAI does not publish a separate image-model
  version number (see § Known uncertainties). This skill is the
  still-image companion to the Grok Imagine 1.5 video skill.

## Headline points (distilled, 2026-07-17)

- **Two modes:** text-to-image (new scene from a text prompt) and image
  editing / image-to-image (targeted change on one uploaded image).
- **Image generation is less strict than video** — no motion analysis —
  but filters still scan photorealism signals, real-person likenesses,
  violence, explicit content, and brands.
- **Recommended workflow:** generate a strong base image first, then
  iterate with targeted edit prompts. Faster and more consistent than
  full rewrites.
- **Lead with the main subject** — the start of the prompt carries the
  most weight.
- **Natural language, full sentences** beat long keyword lists.
- **Lighting is one of the highest-leverage elements** — be specific.
- **Name a clear style or medium early** (cinematic, photorealistic,
  illustration, concept art, film still).
- **Keep one primary focus;** crowded prompts weaken.
- **Positive direction only** — describe what you want; a short
  keep / preserve clause is useful in editing.
- **Ideal length ≈ 30–80 words** for most scenes.
- **Edit = change + keep:** split into what to change and what must stay
  identical. This is the most reliable way to hold consistency.

## Prompt structures

- **Text-to-image:** `[subject with traits + pose], [environment],
  [lighting], [camera angle / shot / lens], [style + mood], [finishing
  details].`
- **Edit:** `[what to change]. Keep [face, expression, pose, clothing,
  composition, identity, framing] exactly the same.`

## High-impact elements

- **Lighting:** soft golden hour, dramatic side light, high-contrast
  film-noir, neon rim light, overcast diffused, studio softboxes,
  volumetric god rays, wet specular highlights.
- **Camera & composition:** shot types; lens language (35mm / 50mm / 85mm
  f/1.4, shallow depth of field, wide-angle); framing notes.
- **Style & mood:** cinematic film still, photorealistic, concept art,
  illustration, painterly, film-noir, editorial fashion; mood words.
- **Technical / quality cues — sparingly.** Avoid stacking "8K,
  ultra-detailed, masterpiece, best quality"; they add little and can
  raise realism flags.

## Editing best practices

- Be explicit about what must stay identical (face, clothing, pose,
  composition, lighting direction).
- Name objects by distinctive attributes ("the soaked dark jacket") not
  generic terms.
- One major change at a time.
- Base portrait first for character consistency, then edit variations.

## Moderation / safeguards (the signature)

Image filters focus on **predicted realism, identity risk, and content
category**. Safer creative prompts pass more reliably:

| Risky element | Safer approach |
| --- | --- |
| Extreme photorealism cues ("8K photorealistic", "raw footage", "CCTV", "documentary realism", "ultra-realistic") | "Cinematic film still", "film-noir look", "stylized cinematic", "concept art", "painterly" |
| Named real people / celebrities | Generic descriptions |
| Direct violence language (fight, strike, punch, blood, injury, attack) | "Athletic stage routine", "theatrical performance", "choreographed sequence", "dramatic rehearsal pose" |
| Suggestive / body-focused framing | Fashion editorial, cinematic portrait, dance performance, artistic study |
| Trademarked brands / logos | Generic unbranded equivalents |

Tactics: frame physical / intense scenes as staged / theatrical /
rehearsed / cinematic / fictional; prefer artistic / cinematic over
documentary / photorealistic framing; for action stills emphasize
controlled / precise / performative / stage-combat aesthetic / film
production still; generate a cleaner stylized base first if a realistic
version keeps flagging; avoid combining multiple mild risk signals
(extreme realism + physical confrontation + dark gritty setting) in one
prompt.

## On-screen settings

- **Aspect ratio:** match to final use — portrait for characters,
  landscape for environments, square for social. Presets vary by
  front-end; this skill accepts `1:1`, `16:9`, `9:16`, `4:5`, `5:4`,
  `3:4`, `4:3`, `3:2`, `2:3`, plus `auto`.
- **Resolution:** Grok Imagine sizes the output; not a prompt concern.

## Mapping to this skill

| Source guidance | Skill location |
| --- | --- |
| Subject-first, natural language, lighting & style | `SKILL.md` § Core prompt principles |
| Text-to-image structure | `SKILL.md` § Mode 1 — T2I |
| Change + keep editing | `SKILL.md` § Mode 2 — edit |
| High-impact elements | `SKILL.md` § High-impact elements |
| Moderation risk table + tactics | `SKILL.md` § Moderation-aware prompting |
| Aspect ratios | `SKILL.md` § Aspect ratios; build script |
| No negative field | `SKILL.md` § Negation |

## Audit and verification

- **Last reviewed:** 2026-07-17.
- **Verification cadence:** re-fetch on every minor or major version bump,
  and when xAI publishes an official Grok Imagine image prompt guide.
- **Known uncertainties (flag before relying):**
  - **Image-model versioning:** xAI ships the image generator under the
    Grok Imagine 1.5 suite name and does not publish a distinct image
    version number. This skill is versioned under the suite name; treat
    the "1.5" as the suite, not a separate image-model release.
  - **Aspect-ratio presets and resolution tiers** vary by front-end
    (grok.com vs X vs the app) and change over time. The preset list here
    is a reasonable working set, not an exhaustive published spec.
  - **Moderation behaviour** is not publicly documented; the risk table
    and tactics are distilled from the community prompting guide and are
    for passing filters on legitimate creative work, not for defeating
    platform policy. Filter thresholds change without notice.
