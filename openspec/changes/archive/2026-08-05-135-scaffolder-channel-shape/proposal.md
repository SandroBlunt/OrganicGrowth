## Why

ADR-0019 (`docs/adr/0019-multi-channel-brand-profile-primary-tracked.md`) changed
`brand-profile.yaml`'s `channel` field from a single object (`{ name, platform, url }`) to a LIST of
`{ platform, url?, primary? }` entries, exactly one of which carries `primary: true` — with **no
back-compat shim** for the old shape (deliberate). Issue #127 built that data model
(`channelsFrom`/`primaryChannelFrom` in `src/production-spec/brand-profile.ts`), migrated the two real
Brand Profiles (Straw Motion, MundoTip), and updated every existing reader (readiness checks) to key off
the one primary entry. #127's own scope note explicitly left `src/brand/scaffolder.ts`'s
`buildBrandProfile` and `templates/brand-skeleton/brand-profile.yaml` untouched, because ADR-0019's
"Consequences" section names only the readiness-check callers as in scope.

That gap is a real functional bug, found by qa while verifying #127: **a Brand onboarded today through
the `/run-pipeline` no-argument onboarding flow gets a `brand-profile.yaml` the new Channel store cannot
parse.** `buildBrandProfile` still emits the pre-ADR-0019 single-object `channel: { name, platform, url
}` shape. `channelsFrom` treats any non-array `channel` value — including that old object shape — the
same as a missing `channel` key, i.e. `[]`. A freshly scaffolded Brand therefore has NO primary Channel,
so `checkConfig`'s `channel_url_missing` finding blocks Publish readiness forever, even after the
Operator fills in a real Channel URL by hand — the onboarding writer and the reader it feeds have quietly
drifted apart.

This slice (#135) closes that gap: it brings `buildBrandProfile` and the brand-skeleton template in line
with the schema `channelsFrom`/`primaryChannelFrom` already expect, and adds a regression test that
exercises the scaffolder's OWN output through those readers (plus `checkConfig`) so the two sides can
never again silently drift apart.

## What Changes

- **`src/brand/scaffolder.ts`'s `buildBrandProfile`** now emits `channel` as a single-entry LIST —
  `[{ platform, url, primary: true }]` — instead of the old single object. `BrandProfileContent.channel`
  is retyped to match (`readonly BrandProfileChannel[]`, where `BrandProfileChannel` is
  `{ platform: string; url: string; primary: boolean }`).
- **The `name` sub-field is dropped**, exactly as it was for the two real Brand Profiles migrated by
  #127 (ADR-0019's Channel entry shape is exactly `{ platform, url?, primary? }` — no `name`, no
  `handle`; nothing in the codebase reads a Channel entry's `name` at runtime). The Operator's typed
  display name (`answers.name`) continues to be used ONLY to derive the Brand's slug
  (`deriveSlug`/`slugify`) — it is no longer persisted anywhere in the scaffolded `brand-profile.yaml`,
  matching the real Straw Motion / MundoTip files (neither carries a Brand-display-name field anywhere
  in their profile today).
- **`templates/brand-skeleton/brand-profile.yaml`** — the raw copy-and-fill-in template a human can also
  use directly — is updated to the same one-entry list shape, with the same ADR-0019 guidance comment
  used in the two real, migrated Brand Profiles.
- **A new regression test** feeds `buildBrandProfile`'s own output through `channelsFrom`,
  `primaryChannelFrom` (`src/production-spec/brand-profile.ts`), and `checkConfig`
  (`src/readiness/check-config.ts`) end-to-end, proving the scaffolder's output actually parses as a
  configured primary Channel and does NOT trip `channel_url_missing` once a URL is supplied — closing
  the exact gap this issue reports and guarding against the two sides drifting apart again.
- **Existing tests updated** wherever they assert the OLD single-object onboarding-output shape
  (`src/brand/scaffolder.test.ts`, `src/brand/scaffold-brand.test.ts`,
  `src/commands/run-pipeline-onboarding.test.ts`) to read the new list shape instead
  (`profile.channel[0].platform` / `.url` / `.primary`). The one test asserting the retired
  `channel.name` behavior ("C22: display name preserved as channel.name") is replaced with a test
  proving the new, ADR-0019-correct behavior: a scaffolded Brand's `channel` list has no `name` field
  anywhere, and the Operator's typed display name is used only for the slug.

## Non-Goals (explicitly deferred / out of scope)

- **Multi-Channel onboarding.** The interview still asks for exactly one platform/URL and scaffolds a
  single-entry Channel list, `primary: true`. Asking the Operator for additional, non-primary Channels
  during onboarding is not part of this issue (nothing in issue #135 asks for it; ADR-0019's own scope
  already deferred per-Channel work beyond the data model).
- **Reintroducing a Brand-display-name field anywhere in `brand-profile.yaml`.** ADR-0019's Channel
  entry shape (`{ platform, url?, primary? }`) has no `name`/`handle` field, and neither real Brand
  Profile (migrated by #127) carries a display-name field anywhere else in the file. Inventing a new,
  unrequested field to preserve that behavior would go beyond this issue's stated scope ("update
  `buildBrandProfile`... to emit the new list-of-Channel shape... matching what
  `channelsFrom`/`primaryChannelFrom` expect") and beyond the two production Brands' own precedent.
- **A back-compat parser for the old single-Channel object shape.** ADR-0019 and #127 already decided
  against this; #135 does not revisit it.

## Capabilities

### Modified Capabilities

- `brand-resolver`: the pure builder `buildBrandProfile` (and its `BrandProfileContent`/
  `BrandProfileChannel` output types) now emits the ADR-0019 Channel-list shape instead of the retired
  single-object shape.

## Impact

- **Added:**
  - `openspec/changes/135-scaffolder-channel-shape/{proposal.md,tasks.md,handoff.md}`
  - `openspec/changes/135-scaffolder-channel-shape/specs/brand-resolver/spec.md`
- **Modified:**
  - `src/brand/scaffolder.ts` (+tests) — `buildBrandProfile`'s `channel` output; `BrandProfileContent`/
    new `BrandProfileChannel` types; doc comments.
  - `templates/brand-skeleton/brand-profile.yaml` — `channel` block rewritten to the list shape.
  - `src/brand/scaffolder.test.ts`, `src/brand/scaffold-brand.test.ts`,
    `src/commands/run-pipeline-onboarding.test.ts` — updated assertions for the new shape; new
    scaffolder-output-through-`channelsFrom`/`primaryChannelFrom`/`checkConfig` regression coverage.
- **Not touched:** `src/production-spec/brand-profile.ts` (the reader — already correct since #127),
  `src/readiness/check-config.ts` (already reads the primary entry since #127), the two real Brand
  Profiles (already migrated by #127), `src/brand/scaffold-brand.ts` (the write shell — no logic change,
  only consumes the builder's new output shape), `CONTEXT.md` (already reflects ADR-0019).
- **Hermetic:** no Space/MCP call anywhere in this diff — this slice is plain-file YAML generation +
  pure data transforms + tests. The Magnific fake is not exercised because there is nothing to fake
  here; the change touches no Magnific Space code path at all.
- **Always-rules upheld:** generate-never-publish (no publish-path logic changed beyond the
  already-existing `channel_url_missing` readiness finding this fixes the false-positive for);
  public-metrics-only / relative-not-absolute (no metrics/baseline code touched); explicit-attribution
  (no Post/`post_url` code touched); ledger-as-source-of-truth (no ledger-write path touched);
  never-fabricate (`buildBrandProfile` still takes every field verbatim from the Operator's answers —
  only the SHAPE of the `channel` output changes, not what data goes into it).
