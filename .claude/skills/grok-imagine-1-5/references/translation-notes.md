# Translation notes — Grok Imagine 1.5 (video)

Model-specific rules for the Grok Imagine 1.5 video stack that override the
cross-model defaults in
`../../../references/prompt-discipline.md`. This skill is
**front-end / prompting focused** — it covers what you type and the
on-screen options you pick, not API code.

## Front-end vs model — read first

**Grok Imagine 1.5** is xAI's video model. You prompt it through xAI's own
front-ends: **grok.com**, the **X** app, and the **Grok Imagine** app.
There is no third-party front-end split as with some other stacks; the
prompting surface and the model come from the same vendor. On-screen control
ranges can still differ slightly between the three apps and shift over time —
see the audit note in `official-guidelines.md`.

## Moderation-aware prompting (signature)

This is the defining quirk of the stack. Grok's **video filter is stricter
than its image filter** because it scores predicted motion, not a single
frame. The model predicts motion and scores realism + potential harm.

- **Avoid direct violence language** (fight, strike, punch, impact-as-
  violence, attack, crash, explosion, blood, injury, struggle) — rephrase
  with the risky → safer table in `official-guidelines.md` and `SKILL.md`.
- **Avoid extreme photorealism cues** (ultra-realistic, 8K photorealistic,
  raw footage, CCTV, documentary realism, found footage). Prefer cinematic /
  film-look / stylized language.
- **Avoid real people / celebrity / identifiable likenesses** and graphic or
  non-consensual implications.
- **Label physical scenes** as staged / theatrical / rehearsed / safe /
  performative / fictional / stage-combat.
- **Borderline idea?** Make a clean still first, then animate it (motion-only
  prompt). Break complex action into short single-beat clips and `extend`.

The build script's moderation scanner is a **heuristic** — it catches the
distilled trigger words, not every possible flag. A clean scan is not a
guarantee; it lowers false-positive risk on legitimate work.

## Prompt order

**Camera move (front-loaded) → subject + action (with intensity and timing)
→ environment / atmosphere → lighting / style → Sound (last).** Described-
early appears earlier in the clip, so lead with the shot and the key beat.

## Modes

- **T2V** — text only; most freedom, least identity consistency.
- **I2V (preferred)** — the still is the **first frame**; describe **only
  what changes**. Never re-describe the whole scene or the model may
  reinterpret the frame.
- **extend** — continue from the **last frame** of an existing clip; motion,
  lighting, and character position carry forward.
- **reference** — **1-7** style / character images lock a look or character;
  not always combinable with a first-frame image.

## Native audio (signature)

- Audio is generated **with** the picture in one pass — there is **no
  separate audio step**. A prompt with no Sound section is refused by the
  build script.
- Put the Sound block **last**. Be specific and spatial. Dialogue **short**
  and **in quotes** for a better lip-sync chance; anchor it to a physical
  beat.

## Camera moves

One move per clip, front-loaded. Recognised: push-in, dolly, orbit,
tracking, arc, pan, tilt, zoom, crane, static / locked-off, handheld (use
sparingly). **Do not stack moves** — chain with `extend` instead. Intensity
is expressed in prose; there is no numeric motion slider.

## What the stack does NOT have

- **No negative-prompt field** — rephrase exclusions positively.
- **No separate audio toggle** — sound is native and same-pass.

## On-screen settings (not prompt text)

- **Duration:** 1-15 s; **5-8 s is the stability sweet spot**.
- **Aspect ratio:** 16:9, 9:16, 1:1, 4:3, 3:4 (default 16:9). In I2V the
  ratio usually follows the uploaded frame.

## Clip-length discipline

Clips are short. Design a prompt for **a single beat or a short chain**, not
a full narrative. For a longer piece, `extend` from the last frame or chain
clips at the consuming-agent layer.

## Provenance and policy

- Confirm watermark / provenance behaviour in-product.
- The user must hold rights to every uploaded image and video; output must
  comply with xAI's content policy. The moderation tactics reduce
  false-positive flags on legitimate creative work; they are not a way around
  the policy.

## Audit

Last reviewed: 2026-07-17. Cross-check against
`references/official-guidelines.md` before relying on any rule above. The
moderation trigger list is distilled from community guidance and is
heuristic, not an official xAI publication.
