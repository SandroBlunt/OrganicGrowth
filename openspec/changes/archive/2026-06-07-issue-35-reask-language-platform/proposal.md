## Why

The new-Brand interview in the conductor silently fabricates Brand facts when the Operator gives no
usable answer for Language or Platform. An empty Language response produces `language: "en"` in the
Brand Profile; an empty or unrecognised Platform response (e.g. `"fb"`, `"tiktok"`, or blank)
produces `platform: "facebook"`. Neither default was supplied by the Operator. This quietly violates
the never-invent-brand-facts rule (always-rule 7, CONTEXT.md, and the `run-pipeline-conductor` spec
Requirement "The conductor SHALL never invent brand facts").

The fix mirrors the pattern already in place for Brand name (3-attempt loop) and seed pages
(5-attempt loop): the conductor re-asks until the Operator supplies a valid answer, then stops
cleanly if the attempt cap is exceeded before creating any Brand directory.

## What Changes

### Modified `src/commands/run-pipeline.ts` — `runNewBrandInterview`

**Language block** (around line 256-260): replace the single yield+default assignment with a bounded
re-ask loop (cap 3, mirroring the name loop). The loop continues until the Operator supplies a
non-empty trimmed language code. On cap exceeded, yield a stop turn with `done: true` and
`return undefined` before any `scaffoldBrand` call.

**Platform block** (around line 269-278): replace the single yield+fallthrough with a bounded
re-ask loop (cap 3). The loop continues until the trimmed, lowercased response is one of
`"facebook"`, `"instagram"`, or `"linkedin"`. On an unrecognised non-empty value, the re-ask
message names the accepted values and notes that Facebook is the only fully wired platform today.
On cap exceeded, yield a stop turn with `done: true` and `return undefined` before any
`scaffoldBrand` call.

After the loops, `language` and `platform` are assigned only from validated Operator input — no
fabricated defaults remain.

### No other files change

The pure builders (`buildBrandProfile`, `buildSeeds`) and the write shell (`scaffoldBrand`) are
unchanged. The spec delta is confined to the `run-pipeline-conductor` capability.

## Capabilities

### Modified Capabilities

- `run-pipeline-conductor` — the new-Brand interview's Language and Platform collection steps are
  updated: both now loop on empty/unrecognised input and stop cleanly at a bounded cap, matching the
  existing name and seed-page patterns.
