## Why

Epic #120 asked for captions "optimized in tone, content, and length for each social media channel."
Today `brand-profile.yaml`'s `channel` is a single object (`{ name, platform, url }`) and `CONTEXT.md`
stated "Exactly one Channel per Brand." Issue #124's grilling surfaced that the Operator already
publishes the same Asset natively to several platforms by hand and wants each platform's caption
tailored to its own tone/length/content rules — not one shared caption reused everywhere. #124 decided
the schema in `docs/adr/0019-multi-channel-brand-profile-primary-tracked.md` (accepted): `channel`
becomes a LIST of `{ platform, url?, primary? }` entries, exactly one of which carries `primary: true`.
Issue #127 (this slice) builds ONLY that data model: the typed reader, the migration of Straw Motion's
and MundoTip's real `brand-profile.yaml` files, and updating every existing caller of the old singular
`channel.platform`/`channel.url` to read the one primary entry instead. Per-Channel performance
tracking, per-platform CopyShape, and per-channel Copy variants are separate, explicitly downstream
issues (#128, #129, #130) — not built here.

## What Changes

- **Extend the Brand Profile typed store** (`src/production-spec/brand-profile.ts` — the existing
  plain-file reader for `data/brand-profile.yaml`) with `Channel`, `channelsFrom(raw)`,
  `primaryChannelFrom(raw)` (pure), and `loadChannels(path)` / `loadPrimaryChannel(path)` (the async I/O
  shell) — reading the new `channel` LIST shape defensively (data-handling rule 4): a malformed entry is
  dropped, a `channel` value that isn't an array (including the pre-ADR-0019 single-object shape) reads
  as `[]`, and more than one entry (mis)configured `primary: true` deterministically picks the first.
- **Migrate-in-place, no back-compat shim.** ADR-0019 calls for migrating the two real Brand Profile
  files to the list shape directly — it does not ask for a parser that also accepts the old single-object
  `channel: { name, platform, url }` shape. `channelsFrom`/`primaryChannelFrom` therefore treat that old
  shape the same as any other malformed `channel` value: `[]` / `null`, never crashing, never silently
  reinterpreting it as a Channel.
- **Migrate the two real Brand Profiles** (`data/brands/straw-motion/brand-profile.yaml`,
  `data/brands/mundotip/brand-profile.yaml`) to the new list shape, using the ADR's own concrete platform
  lists: Straw Motion — facebook (primary, existing URL kept), instagram, linkedin, x, tiktok (blank
  URLs); MundoTip — facebook (primary, existing URL kept), instagram, x, tiktok (blank URLs). The
  `name` sub-field is dropped (ADR-0019's Channel entry shape is exactly `{ platform, url?, primary? }` —
  no `handle`, and no `name`; nothing in the codebase reads `channel.name` at runtime).
- **Update every existing caller of the old singular `channel.platform`/`channel.url`** to read the ONE
  primary entry via `primaryChannelFrom` instead:
  - `src/readiness/check-config.ts` — `checkConfig`'s `channel_url_missing` finding now keys off the
    primary Channel entry's `url`; the `BrandProfile.channel` field is typed `unknown` (it types an
    already-parsed-but-unvalidated object; `primaryChannelFrom` is itself defensive against any shape).
  - `src/commands/run-pipeline-readiness.ts` — the `channelUrl` passed into `classify()` is derived the
    same way.
  - `src/apify/platform.ts` — its own doc comment (explaining that Apify actor-platform resolution is
    ALWAYS derived from a URL's own hostname, never from the Brand's configured Channel) is updated to
    reference the new list shape; the module never actually read `channel.platform` at runtime, so there
    is no behavior change here, only a doc-accuracy fix (named explicitly in ADR-0019's own consequences
    section).
- **NOT touched: the new-Brand onboarding writer** (`src/brand/scaffolder.ts`'s `buildBrandProfile` /
  `src/brand/scaffold-brand.ts` / the `/run-pipeline` staged interview). ADR-0019's own "Consequences"
  section names only the readiness-check callers and `src/apify/platform.ts` as needing an update; the
  onboarding interview still asks for exactly one platform/URL and scaffolds a Brand Profile today — the
  ADR does not ask this slice to also make the interview multi-Channel-aware or change what it writes.
  Left as a known limit below; existing onboarding tests are unaffected (still pass unchanged) because
  the scaffolder's own `BrandProfileContent` type is independent of the new `Channel` type.

## Non-Goals (explicitly deferred / out of scope)

- **Per-Channel performance tracking, baseline, or ledger attribution.** ADR-0019 is explicit: these
  stay keyed off the ONE primary entry, unchanged machinery — a future epic, not this slice.
- **Per-platform `CopyShape` / per-channel Copy variants / LinkedIn `@mention` insertion.** Issues #128,
  #129, #130 respectively — blocked ON this slice, not built by it.
- **A back-compat parser for the old single-Channel object shape.** ADR-0019 calls for migrate-in-place;
  a shim was deliberately not built (see "What Changes" above).
- **Updating the new-Brand onboarding interview/writer to be multi-Channel-aware.** See "NOT touched"
  above.
- **A `handle` field on Channel entries.** ADR-0019 is explicit: LinkedIn `@mention` tagging is issue
  #126's separate, already-built lookup — not this list.

## Capabilities

### Modified Capabilities

- `production-spec`: the Brand Profile reader gains a Channel-list reader alongside its existing
  banned-words / required-CTA / required-hashtags / watermark-handle readers.
- `readiness-classifier`: `checkConfig`'s `channel_url_missing` finding is now keyed off the Brand's ONE
  primary Channel entry (from a list), rather than a single `channel.url` field.

## Impact

- **Added:**
  - `src/production-spec/fixtures/brand-profile.channels.yaml`
  - `openspec/changes/127-multi-channel-brand-profile/{proposal.md,tasks.md,handoff.md}`
  - `openspec/changes/127-multi-channel-brand-profile/specs/production-spec/spec.md`
  - `openspec/changes/127-multi-channel-brand-profile/specs/readiness-classifier/spec.md`
- **Modified:**
  - `src/production-spec/brand-profile.ts` (+tests) — new `Channel` type, `channelsFrom`,
    `primaryChannelFrom`, `loadChannels`, `loadPrimaryChannel`.
  - `src/readiness/check-config.ts` (+tests) — `BrandProfile.channel` retyped `unknown`;
    `channel_url_missing` now reads the primary entry.
  - `src/commands/run-pipeline-readiness.ts` — `channelUrl` derivation reads the primary entry.
  - `src/apify/platform.ts` — doc-comment accuracy fix only, no behavior change.
  - `data/brands/straw-motion/brand-profile.yaml`, `data/brands/mundotip/brand-profile.yaml` — migrated
    to the new Channel list shape.
  - `src/commands/run-pipeline.test.ts`, `src/commands/run-pipeline-onboarding.test.ts` — the shared
    `HEALTHY_PROFILE_YAML` (and two inline profile fixtures) updated to the new list shape so the
    existing "healthy Brand → no findings" tests keep passing under the new, non-back-compat reader.
- **Not touched:** `src/brand/scaffolder.ts`, `src/brand/scaffold-brand.ts`, `templates/brand-skeleton/`,
  any Copy-composition code (`src/copy/*`), `CONTEXT.md` (already updated by the ADR-0019 commit itself,
  prior to this slice).
- **Hermetic:** no Space/MCP call anywhere in this diff — this slice is plain-file YAML reading + pure
  data transforms. The Magnific fake is not exercised because there is nothing to fake here.
- **Always-rules upheld:** generate-never-publish (no publish-path code touched beyond the readiness
  finding that already gated Publish on a Channel URL); public-metrics-only / relative-not-absolute (no
  metrics/baseline code touched — ADR-0019 explicitly keeps that machinery on the primary entry
  unchanged); explicit-attribution (no Post/`post_url` code touched); ledger-as-source-of-truth (no
  ledger-write path touched); never-fabricate (`channelsFrom`/`primaryChannelFrom` never invent a
  platform, URL, or a primary flag — a malformed/absent value degrades to `[]`/`null`, never a guess).
