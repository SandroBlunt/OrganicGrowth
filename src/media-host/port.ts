/**
 * The Media Host port (issue #144, parent #140 — Schedule Batch spec).
 *
 * The narrow seam the Schedule Batch export (a later slice) will drive to prepare Zoho-ready media,
 * mirroring TWO existing seams so the build stays hermetic: `src/space-driver/port.ts` (the Magnific
 * seam, `SpaceMcpPort`) and `src/commands/track-performance-port.ts` (the Apify scrape seam,
 * `PerformanceScrapePort`). Tests ALWAYS inject a fake (`fixtures/fake-media-host.ts`); the REAL
 * adapter (`live/adapter.ts`) shells out to macOS's `sips` and the AWS CLI and is never exercised by
 * `npm test` — exactly like the deferred/never-tested live adapters those two ports document.
 *
 * Three operations — exactly what PRD #140's user stories 4–5 need:
 *
 *   - `convertToJpg` — convert a slide's PNG into a NEW JPG file at `destPath`. The source PNG at
 *     `sourcePath` is NEVER modified or removed — the output bundle's original PNGs stay untouched
 *     (story 4).
 *   - `upload` — host a local file under `key`, returning its public DIRECT link. The link always ends
 *     `.jpg` (`assertJpgKey`, `key.ts`) and is fetchable with no viewer page and no redirect in the way
 *     — so Zoho's bulk uploader can pull it directly (story 5).
 *   - `delete` — remove a previously-uploaded file. Deleting an already-gone key is NOT an error
 *     (idempotent) — a later cleanup slice may retry a delete against a key that is already gone.
 */

/** What a successful `upload` returns: the file's public direct URL. */
export interface UploadResult {
  /** The public, direct `.jpg` link — no viewer page, no redirect (PRD #140 story 5). */
  readonly url: string;
}

/**
 * The narrow port a Schedule Batch export would drive. A FAKE implements this in tests
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
   * Upload the local file at `localPath` under `key`, returning its public direct link. `key` MUST end
   * in `.jpg` (`assertJpgKey`) — implementations reject any other extension rather than host a link
   * Zoho cannot reliably fetch.
   */
  upload(localPath: string, key: string): Promise<UploadResult>;

  /** Delete the previously-uploaded file at `key`. Deleting an already-gone key is NOT an error. */
  delete(key: string): Promise<void>;
}
