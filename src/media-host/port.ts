/**
 * The Media Host port (issue #144, parent #140 — Schedule Batch spec).
 *
 * The narrow seam the Schedule Batch export drives to prepare Zoho-ready media, mirroring TWO existing
 * seams so the build stays hermetic: `src/space-driver/port.ts` (the Magnific seam, `SpaceMcpPort`) and
 * `src/commands/track-performance-port.ts` (the Apify scrape seam, `PerformanceScrapePort`). Tests
 * ALWAYS inject a fake (`fixtures/fake-media-host.ts`); the REAL adapter (`live/adapter.ts`) shells out
 * to macOS's `sips` and the AWS CLI and is never exercised by `npm test` — exactly like the
 * deferred/never-tested live adapters those two ports document.
 *
 * Three operations — exactly what PRD #140's user stories 4–5 need:
 *
 *   - `convertToJpg` — convert a slide's PNG into a NEW JPG file at `destPath`. The source PNG at
 *     `sourcePath` is NEVER modified or removed — the output bundle's original PNGs stay untouched
 *     (story 4).
 *   - `upload` — host a local file under `key`, returning a SIGNED, EXPIRING link (issue #198 — the
 *     bucket is no longer public-read). The link always ends `.jpg` (`assertJpgKey`, `key.ts`) before
 *     any query string and is fetchable with no viewer page and no redirect in the way — so Zoho's bulk
 *     uploader can pull it directly (story 5) — but ONLY until `options.expiresInSeconds` has elapsed.
 *     `key` itself is expected to already carry an unguessable component (`src/media-host/token.ts`,
 *     `src/schedule-batch/media-key.ts`'s `scheduleMediaKey`) — the port itself does not (and cannot)
 *     judge whether a given key string is "guessable"; that is the caller's responsibility.
 *   - `delete` — remove a previously-uploaded file. Deleting an already-gone key is NOT an error
 *     (idempotent) — the cleanup routine (`src/schedule-batch/cleanup-runner.ts`) may retry a delete
 *     against a key that is already gone.
 */

/** What a successful `upload` returns: the file's SIGNED, TEMPORARY direct URL (issue #198 — no longer
 *  a permanent public link). */
export interface UploadResult {
  /** The signed, expiring, direct `.jpg` link — no viewer page, no redirect (PRD #140 story 5) — valid
   *  only until the `expiresInSeconds` given to `upload` has elapsed. */
  readonly url: string;
}

/** Required options for `upload` (issue #198 — every hosted link now has an explicit, caller-derived
 *  expiry; there is no default, exactly like every other explicit, no-silent-default seam in this
 *  codebase). */
export interface UploadOptions {
  /** How many seconds from "now" the signed link should remain fetchable for. Always derived from the
   *  Asset's own scheduled time via `src/schedule-batch/media-expiry.ts`'s `computeMediaExpiry` — never
   *  a caller-invented constant. Implementations MUST reject a value outside
   *  `[1, MAX_PRESIGN_SECONDS]` (`src/media-host/aws-presign-limit.ts`) via
   *  `assertValidExpiresInSeconds`, BEFORE performing any I/O. */
  readonly expiresInSeconds: number;
}

/**
 * The narrow port a Schedule Batch export drives. A FAKE implements this in tests
 * (`fixtures/fake-media-host.ts`); the live AWS-CLI/`sips` adapter (`live/adapter.ts`) implements it
 * at runtime. Callers make NO call outside this interface.
 */
export interface MediaHostPort {
  /**
   * Convert the PNG at `sourcePath` into a brand-new JPG file at `destPath`. `sourcePath` is left
   * byte-for-byte untouched — this is always a copy-and-convert, never an in-place rewrite.
   */
  convertToJpg(sourcePath: string, destPath: string): Promise<void>;

  /**
   * Upload the local file at `localPath` under `key`, returning a signed, expiring direct link valid
   * for `options.expiresInSeconds`. `key` MUST end in `.jpg` (`assertJpgKey`) — implementations reject
   * any other extension rather than host a link Zoho cannot reliably fetch.
   */
  upload(localPath: string, key: string, options: UploadOptions): Promise<UploadResult>;

  /** Delete the previously-uploaded file at `key`. Deleting an already-gone key is NOT an error. */
  delete(key: string): Promise<void>;
}
