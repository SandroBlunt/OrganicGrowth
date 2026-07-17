## ADDED Requirements

### Requirement: The Brand Profile reader exposes the watermark @handle, defensively (QA-1)

`src/production-spec/brand-profile.ts` SHALL provide `watermarkHandleFrom(raw)` (pure) and
`loadWatermarkHandle(path)` (the async I/O shell), reading `production.watermark_handle` from
already-parsed / on-disk Brand Profile data respectively. This is a DIFFERENT per-Brand parameter than
Copy (`BrandCopyRules`): the thin Producer sets it onto a Recipe's declared `watermarkNode`
(`src/recipe/registry.ts`) before the final render — it SHALL NEVER be folded into the composed Copy's
caption or hashtags (ADR-0012). Both functions SHALL be defensive, mirroring `requiredCtaFrom`: a
missing file, a missing `production` block, a non-object `production` value, or a missing/non-string/
blank `watermark_handle` SHALL all degrade to `""` (never `null`/`undefined`, never a thrown error) —
the real profile's default shape (not yet configured).

#### Scenario: watermarkHandleFrom reads a configured handle, trimmed

- **GIVEN** `{ production: { watermark_handle: "  @strawmotion  " } }`
- **WHEN** `watermarkHandleFrom(raw)` is called
- **THEN** it returns `"@strawmotion"`

#### Scenario: watermarkHandleFrom returns '' for the real profile's default shape and any malformed input

- **GIVEN** any of: no `production` block, `production: {}`, `production.watermark_handle: ""`,
  `production: "not an object"`, `production.watermark_handle: 7`, or `raw` itself being `null`
- **WHEN** `watermarkHandleFrom(raw)` is called
- **THEN** it returns `""` in every case — never throws, never returns `null`/`undefined`

#### Scenario: loadWatermarkHandle reads '' for a missing Brand Profile file

- **GIVEN** a path with no file on disk
- **WHEN** `loadWatermarkHandle(path)` is called
- **THEN** it resolves to `""`, never rejecting
