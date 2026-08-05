## 1. Timezone math (test-first, pure)

- [x] 1.1 Write failing tests (`schedule-batch/timezone.test.ts`): `utcOffsetMsAt` reports the correct
  CEST/CET/EDT/UTC offsets; `zonedTimeToUtcMs` converts a named zone's wall-clock time to the matching
  UTC instant (Berlin summer/winter, Eastern summer) and round-trips through `formatZohoScheduleTime`;
  `formatZohoScheduleTime` renders `MM/DD/YYYY HH:mm`, renders the SAME instant differently in two
  zones, and never emits hour "24" at local midnight.
- [x] 1.2 Implement `utcOffsetMsAt`/`zonedTimeToUtcMs`/`formatZohoScheduleTime`
  (`schedule-batch/timezone.ts`).

## 2. Schedule derivation + the 1-hour-future guard (test-first, pure)

- [x] 2.1 Write failing tests (`schedule-batch/schedule.test.ts`): `deriveScheduleSlots` returns one
  slot per day, is pure, schedules strictly increasing calendar days from the start date, keeps every
  slot's Eastern-local time in the 7:00-22:00 window off the round minute, and cycles its rotation past
  12 Assets; `validateSlotsFuture` passes when every slot clears the 1-hour lead, fails (naming every
  violating slot, not just the first) when any doesn't, passes exactly at the boundary, and never reads
  the system clock (`now` is always the explicit argument).
- [x] 2.2 Implement `EASTERN_TIME_ZONE`/`MIN_LEAD_MS`/`deriveScheduleSlots`/`validateSlotsFuture`
  (`schedule-batch/schedule.ts`).

## 3. Eligibility (test-first, pure)

- [x] 3.1 Write failing tests (`schedule-batch/eligibility.test.ts`): includes a produced/un-posted/
  un-scheduled news-carousel Asset; skips a non-news-carousel (video) Asset with a note naming the Idea
  and Recipe; skips a not-yet-produced or already-posted/tracking/scored Asset; skips an
  already-`scheduled_at` Asset; evaluates each Asset of an Idea independently; empty input yields empty
  output; is pure.
- [x] 3.2 Implement `SUPPORTED_RECIPE`/`selectEligibleAssets` (`schedule-batch/eligibility.ts`).

## 4. Select — reading a run's Ideas off the raw ledger (test-first)

- [x] 4.1 Write failing tests (`schedule-batch/select.test.ts`): returns only Ideas matching BOTH the
  given format and run; falls back to the Idea id when title is missing; returns `[]` for no matches;
  normalizes a legacy production-status record onto its Asset grain; throws a clear "unknown Brand"
  error for a missing ledger; skips a record with no string id.
- [x] 4.2 Implement `loadScheduleBatchIdeas` (`schedule-batch/select.ts`).

## 5. Media key derivation (test-first, pure)

- [x] 5.1 Write failing tests (`schedule-batch/media-key.test.ts`): `slideBaseName` strips a `.png`/
  `.jpg` extension; `scheduleMediaKey` builds the exact `<brand>/<run>/<idea>/<slide>.jpg` layout and
  always ends `.jpg` regardless of the source extension.
- [x] 5.2 Implement `slideBaseName`/`scheduleMediaKey` (`schedule-batch/media-key.ts`).

## 6. The live-verified Zoho CSV dialect (test-first, pure)

- [x] 6.1 Write failing tests (`schedule-batch/csv.test.ts`): `escapeCsvField` quotes and doubles
  internal quotes; `encodeZohoLineBreaks` turns a real newline (and CRLF) into the literal `\n`;
  `zohoCaptionField` joins caption+hashtags with a blank line, no trailing newline; `buildZohoCsvRow`
  matches the live-verified dialect byte-for-byte for a 7-slide row AND produces a ragged 4-media X row,
  never a quoted comma-joined media cell, with Link/GMB columns empty; `buildZohoCsvFile` joins rows
  with LF + a trailing newline (no header row) and throws past the 350-row cap; `zohoCsvFileName` names
  the first grouping `zoho-main.csv` and every other by its own sorted platform slugs.
- [x] 6.2 Implement `MAX_ZOHO_ROWS`/`escapeCsvField`/`encodeZohoLineBreaks`/`zohoCaptionField`/
  `buildZohoCsvRow`/`buildZohoCsvFile`/`zohoCsvFileName` (`schedule-batch/csv.ts`).

## 7. The manifest (test-first, pure)

- [x] 7.1 Write failing tests (`schedule-batch/manifest.test.ts`): `buildManifest` assembles the full
  shape from its inputs; flattens every Asset's own `stripped_notes` into the top-level list; is pure
  (never shares an array reference with its inputs).
- [x] 7.2 Implement `buildManifest` (`schedule-batch/manifest.ts`).

## 8. Plan — preflight validation + pure assembly (test-first)

- [x] 8.1 Write failing tests (`schedule-batch/plan.test.ts`): `findCopyVariant` finds/misses by
  platform; `validateAssetsForExport` passes a well-formed Asset, flags a missing Copy, flags a missing
  platform variant (naming Idea + platform), flags a wrong slide count, and collects EVERY problem
  across every Asset; `buildSchedulePlan` produces one CSV per configured Zoho Social Brand, writes
  carousel-capable platforms with all 7 slides and X with only the first 4, writes each file's schedule
  time in ITS OWN Zoho Social Brand clock, never embeds the LinkedIn unresolved-mentions note in a
  caption (surfaces it in the manifest + summary instead), records the manifest's per-Asset `rows`/
  `s3_keys`/`urls`, returns one ledger stamp per eligible Asset with an ISO-8601 `scheduledAt`, and is
  pure.
- [x] 8.2 Implement `findCopyVariant`/`validateAssetsForExport`/`buildSchedulePlan`
  (`schedule-batch/plan.ts`), reusing `csv.ts`/`manifest.ts`/`timezone.ts` — never re-implementing their
  logic.

## 9. The orchestration shell — `/export-schedule` (test-first)

- [x] 9.1 Write failing tests (`commands/export-schedule.test.ts`) against fixture run folders (temp
  dirs, a `FakeMediaHost`): a happy-path run produces byte-exact CSVs, the manifest, a readable
  `scheduled_at` through `AssetStore`, and the expected Media Host calls, with the original PNGs
  untouched; a video (non-news-carousel) Asset is skipped with a note while its sibling news-carousel
  Asset still exports; an empty run stops with a clear message and writes nothing; a Brand with no Zoho
  Social Brand config refuses and writes nothing; a schedule time inside the 1-hour lead window refuses
  the WHOLE export and writes nothing; re-running after a successful export schedules nothing twice
  (second run is a no-op, ledger/CSV unchanged); `main()` prints a usage error and exits non-zero when
  any of the 4 arguments is missing.
- [x] 9.2 Implement `exportScheduleCommand`/`main` (`commands/export-schedule.ts`): resolve Brand paths
  -> load+select eligible Assets -> load Zoho config (refuse if unconfigured) -> preflight-validate
  (refuse on any problem) -> derive+validate the schedule (refuse on any <1h violation) -> host every
  eligible Asset's slides once via the injected `MediaHostPort` -> assemble the plan -> write the CSVs +
  manifest into the run folder -> stamp `scheduled_at` via `AssetStore.writeAsset` -> report.
- [x] 9.3 Add the `export-schedule` npm script (`package.json`).

## 10. Docs

- [x] 10.1 Write `.claude/commands/export-schedule.md`, matching the `track-performance.md` pattern.
- [x] 10.2 Write failing tests (`commands/export-schedule.docs-test.ts`) proving the doc names the real
  code (shell + every deep module), documents eligibility/the 1h guard/the X 4-slide cap/the stripped
  LinkedIn note/the `scheduled_at` write/the hermetic FAKE Media Host/the human Publish gate — then make
  the doc satisfy them.

## 11. OpenSpec

- [x] 11.1 Author `proposal.md`, this `tasks.md`, and the spec deltas: ADDED `schedule-batch-export`,
  MODIFIED `brand-commands` (adds `/export-schedule` to the explicit-`<brand>`-required list).
- [x] 11.2 `npx openspec validate issue-145-export-schedule --strict` green.

## 12. Self-review

- [x] 12.1 `npm test` green (type-check + full suite); `npm run build` green; `npm run test:docs` green.
- [x] 12.2 Simplify / dead-code pass; confirm every issue #145 acceptance criterion maps to a named
  test; confirm no live `spaces_*`/`creations_*`/S3/AWS-CLI call anywhere in the new test suite.
- [x] 12.3 Write the Build Report into `handoff.md`.
