# Official guidelines — Grok Imagine 1.5 (video)

Distilled summary of the prompt and moderation guidance for the Grok
Imagine 1.5 video stack. Any rule below that conflicts with the latest
source MUST be treated as stale. This skill is front-end / prompting
focused.

## Sources

- **Primary prompt guide:**
  https://www.imagine.art/blogs/grok-imagine-video-1-5-prompt-guide
- **Moderation tactics:**
  https://www.roborhythms.com/grok-imagine-moderation/
- **Fetched at:** 2026-07-17
- **Vendor:** xAI (model: Grok Imagine 1.5, video). Front-ends: grok.com,
  the X app, and the Grok Imagine app.

## Headline points (distilled, 2026-07-17)

- **Motion- and audio-aware model.** It evaluates predicted frames,
  movement dynamics, and realism signals. The **video filter is stricter
  than the image filter** because it analyses motion over time.
- **Four modes:** text-to-video; image-to-video (first frame — preferred,
  strongest consistency; describe only what changes); video extension
  (continue from the last frame); reference guidance (1-7 style / character
  images, not always combinable with a first-frame image).
- **One primary action + one camera move per clip.** Multiple competing
  actions or camera paths degrade quality and raise flag risk.
- **Front-load important information** — described-early appears earlier in
  the clip.
- **Specific intensity + timing** beats vague verbs ("slowly rises and
  turns" > "moves").
- **Always include a Sound section.** Native audio is generated in the same
  pass; be specific and spatial; dialogue short and in quotes for lip-sync.
- **5-8 s is the stability sweet spot;** up to 15 s is possible but riskier.
- **Positive direction only** — no negative-prompt field.

## Moderation (signature of this stack)

The system predicts motion and scores realism + potential harm.

**High-risk triggers:**

- Direct violence language: fight, strike, punch, impact (as violence),
  attack, crash, explosion, blood, injury, struggle.
- Extreme photorealism cues: ultra-realistic, 8K photorealistic, raw
  footage, CCTV, documentary realism, found footage.
- Real people, celebrities, or identifiable likenesses.
- Graphic or non-consensual implications.

**Risky → safer rephrasing:**

| Risky | Safer |
| --- | --- |
| Stunt fight / fight choreography | Athletic stage routine / theatrical performance sequence / precise stage-combat rehearsal |
| Strike sells its impact | Synchronized beat / dramatic energy of the movement / theatrical exchange |
| Backing partner toward the wall | Guides the sequence toward the wall / leads the partner through the final movement |
| Real contact / hits | Controlled, pulled, safe stage movements / non-contact theatrical timing |
| Ultra-realistic / gritty realism | Cinematic film-noir look / high-contrast cinematic style / stylized film lighting |
| Heavy kinetic action | Fluid athletic timing / crisp, controlled choreography |

**Safety tactics:** label scenes staged / theatrical / rehearsed / safe /
performative / fictional / stage-combat; prefer cinematic / film-look /
stylized over pure photorealism; break complex action into short single-beat
clips and extend later; for borderline ideas generate a strong still first,
confirm it is clean, then animate; use cinematic (not documentary /
surveillance) framing; keep prompts clear and direct.

## Camera language called out by the sources

Slow push-in, gentle dolly forward, smooth orbit, tracking shot alongside,
slow arc around, locked-off / static, gentle crane up, handheld follow (use
sparingly). Avoid stacking multiple camera moves in one prompt.

## Mapping to this skill

| Source guidance | Skill location |
| --- | --- |
| Four modes; I2V preferred | `SKILL.md` § Modes + Prompt structures |
| One action + one camera move | `SKILL.md` § Core prompt principles + Camera |
| Front-load; intensity + timing | `SKILL.md` § Core prompt principles |
| Always include Sound | `SKILL.md` § Sound design |
| High-risk triggers + rephrasing table | `SKILL.md` § Moderation-aware prompting |
| Staging / cinematic tactics | `SKILL.md` § Moderation-aware prompting |
| 5-8 s sweet spot; positive only | `SKILL.md` § On-screen settings + What Grok does NOT have |

## Audit and verification

- **Last reviewed:** 2026-07-17.
- **Verification cadence:** re-fetch on every minor or major version bump.
- **Known uncertainties (flag before relying):**
  - Exact numeric on-screen ranges (duration ceiling, aspect-ratio set) vary
    across the grok.com / X / Grok Imagine app front-ends and over time; the
    build script models a 1-15 s range and the common aspect set.
  - The precise moderation trigger list is not officially published; the
    high-risk terms here are distilled from community moderation guidance and
    are heuristic, not exhaustive.
  - Whether output carries a visible watermark should be confirmed
    in-product.
