# Translation notes — Happy Horse

Model-specific rules for the Happy Horse video stack that override the
cross-model defaults in `../../../references/prompt-discipline.md`. This
skill is **front-end / prompting focused** on happy-horse.ai — it covers
what you type and the on-screen options you pick, not API code.

## Front-end vs model — read first

There are two things named "Happy Horse":

- **HappyHorse-1.0** — the underlying video *model* (Alibaba). Its
  official API is on fal.ai.
- **happy-horse.ai** — a third-party web *front-end* that runs that
  model. The official model team has publicly noted that third-party
  sites are not affiliated with them.

This skill targets the **happy-horse.ai front-end** because that is the
surface a user prompts on. Where the front-end's published controls
differ from the model's raw API, this skill follows the front-end and
flags the difference here.

## Prompt order

Happy Horse's own guidance: **Subject + action → camera movement →
style → environment / atmosphere.** Lead with subject + action. For a
multi-beat shot, sequence with **"First… then… finally…"**.

## Reference tokens

- Bind uploaded assets to roles inside the prompt with `@Image1`,
  `@Image2`, … for stills and `@Video1` for a reference clip.
- **I2V:** `@Image1` is the first frame.
- **R2V / edit:** up to 5 reference assets; use tokens to say what each
  is for (identity, style, palette, camera).
- Distinctive: **copy a real camera move** with "reference @Video1 for
  camera movement" instead of describing it.

## Native audio (signature)

- Audio is generated **with** the picture in one pass — there is **no
  audio toggle**. Describe dialogue, SFX, ambience, and music directly.
- Put the audio block **last**, after all visual description. Never
  interleave.
- **Dialogue needs a language** for lip-sync. Supported: English,
  Mandarin, Cantonese, Japanese, Korean, German, French. Anchor a line
  with a physical action just before it for cleaner lip-sync. The build
  script requires `language|line` form.

## Camera moves

Six named moves: **Pan, Tilt, Dolly, Zoom (incl. Hitchcock / dolly
zoom), Orbit, Crane.** Also usable in prose: tracking shot,
behind-tracking, low-angle orbit, "pan right 90 degrees". Intensity is
expressed in prose — there is no numeric motion slider.

## What the stack does NOT have

Do not author prompts around these:

- **No negative-prompt field** — rephrase exclusions positively.
- **No motion-strength slider** — express intensity in words ("slow,
  gentle push-in" vs "fast whip-pan").
- **No last-frame / end-frame input** — I2V is first-frame only. For a
  start-and-end transition, use a different stack (Veo / Kling F/L).

## On-screen settings (not prompt text)

- **Duration:** happy-horse.ai exposes **4–15 s**. (The underlying model
  accepts from 3 s; the build script enforces the front-end's 4–15.)
- **Resolution:** happy-horse.ai lists **480p / 720p / 1080p**. (The
  model's official API exposes 720p / 1080p only; 480p is a front-end
  option.)
- **Aspect ratio:** 16:9, 9:16, 1:1, 4:3, 3:4. In I2V the ratio is
  usually taken from the uploaded frame.
- **Mixed input (front-end):** the front-end allows multiple uploaded
  images, videos, and audio references in one job; this skill models the
  common 1-first-frame (I2V) and up-to-5-asset (R2V / edit) cases.

## Clip length discipline

Clips are short (4–15 s). Design a prompt for **a single beat or a short
chain**, not a full narrative. For a longer piece, chain clips at the
consuming-agent layer.

## Quirks and caveats

- Strong at character consistency, camera control, motion, and synced
  audio (leaderboard-topping in blind preference tests).
- Model weights are not public; some architecture/feature claims are
  vendor-stated and unverified by independent testing.
- A flood of look-alike reseller sites exists; confirm you are on the
  intended front-end.

## Provenance and policy

- happy-horse.ai advertises **no visible watermark**; confirm in-product
  before relying on it for provenance-sensitive work.
- The user must hold rights to every uploaded image and video; output
  must comply with the platform's content policy.

## Audit

Last reviewed: 2026-06-04. Cross-check against
`references/official-guidelines.md` before relying on any rule above.
happy-horse.ai docs are shallow and partly stubbed; several details
(exact mixed-input caps, precise duration floor) vary between the
front-end and the model API — see the official-guidelines audit notes.
