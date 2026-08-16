# Official guidelines — Happy Horse

Distilled summary of the prompt guidance for the Happy Horse video
stack. Any rule below that conflicts with the latest source MUST be
treated as stale. This skill is front-end / prompting focused.

## Sources

- **Primary URL (happy-horse.ai front-end docs):**
  https://happy-horse.ai/docs/basic-usage
- **Prompt guide (front-end):**
  https://happy-horse.ai/docs/prompt-guide
- **Camera parameters (front-end):**
  https://happy-horse.ai/docs/camera-params
- **Underlying model (Alibaba HappyHorse-1.0, official API):**
  https://fal.ai/happyhorse-1.0
- **Fetched at:** 2026-06-04
- **Vendor:** Alibaba (model: HappyHorse-1.0). happy-horse.ai is a
  third-party front-end to that model.

## Headline points (distilled, 2026-06-04)

- **Prompt order:** subject + action → camera movement → style →
  environment / atmosphere; "First… then… finally…" for sequencing.
  (happy-horse.ai)
- **Reference tokens:** bind uploaded assets with `@Image1`, `@Video1`,
  etc.; copy camera motion from a reference clip. (happy-horse.ai)
- **Native synchronized audio:** dialogue, SFX, and ambience generated
  with the picture in one pass — no separate audio step. (fal, features)
- **Multilingual lip-sync:** English, Mandarin, Cantonese, Japanese,
  Korean, German, French. (fal)
- **Six camera moves:** pan, tilt, dolly, zoom (incl. Hitchcock zoom),
  orbit, crane. (happy-horse.ai)
- **Modes:** text-to-video, image-to-video (first frame),
  reference-to-video (up to 5 assets), video-edit. (fal)
- **No negative prompt, no motion-strength slider, no last-frame
  input.** (fal schema; happy-horse.ai docs)
- **Short clips:** 4–15 s on the front-end. (happy-horse.ai)

## Strengths called out by the sources

- Character consistency, camera-control precision, motion quality,
  human body dynamics, facial expressions, text-guided transitions.
- Native synced audio is the headline differentiator.
- Topped a blind human-preference video leaderboard on release.

## Caveats called out by the sources

- Model weights are not public; several architecture / capability claims
  are vendor-stated and unverified independently.
- Clips are short; design for single beats.
- happy-horse.ai docs are shallow and partly stubbed; some camera and
  tutorial pages are "coming soon".
- Many look-alike reseller domains exist; the official team disowns
  unaffiliated third-party sites.

## Front-end controls vs model API (known conflicts)

| Control | happy-horse.ai front-end | HappyHorse-1.0 model API (fal) |
| --- | --- | --- |
| Duration | 4–15 s | 3–15 s |
| Resolution | 480p / 720p / 1080p | 720p / 1080p |
| Aspect ratio | 16:9, 9:16, 1:1, 4:3, 3:4 | 16:9, 9:16, 1:1, 4:3, 3:4 |
| Reference assets | multi-asset mixed input | up to 5 (R2V / edit) |
| Prompt length | (unspecified) | ≤ 2500 characters |

This skill follows the **front-end** values where they differ, since the
front-end is the prompting surface; the build script enforces the
front-end's 4–15 s and 480/720/1080p set.

## Mapping to this skill

| Source guidance | Skill location |
| --- | --- |
| Subject+action → camera → style → environment | `SKILL.md` § The prompt formula |
| First/then/finally sequencing | `SKILL.md` § The prompt formula |
| `@Image1` / `@Video1` tokens | `SKILL.md` § Modes 2–4 |
| Native audio, dialogue language | `SKILL.md` § Audio |
| Six camera moves | `SKILL.md` § Camera & motion control |
| No negative / motion slider / last frame | `SKILL.md` § What Happy Horse does NOT have |
| Duration / resolution / aspect | `SKILL.md` § On-screen settings |

## Audit and verification

- **Last reviewed:** 2026-06-04.
- **Verification cadence:** re-fetch on every minor or major version
  bump.
- **Known uncertainties (flag before relying):**
  - Exact mixed-input caps on the front-end (images / videos / audio per
    job) vary; this skill models 1 first-frame (I2V) and up-to-5 assets
    (R2V / edit).
  - Precise duration floor (3 vs 4 s) differs between the model API and
    the front-end.
  - Whether output is truly watermark-free is advertised by the
    front-end but should be confirmed in-product.
  - Architecture / parameter-count claims about HappyHorse-1.0 are
    vendor-stated and unverified.
