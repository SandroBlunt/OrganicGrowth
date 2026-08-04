/**
 * Manifest — pure deep module building the Schedule Batch's cleanup contract (issue #145, parent #140).
 *
 * PRD #140: "the manifest is the cleanup contract" — per Asset, its scheduled time, its hosted S3 object
 * keys, and its public URLs, so a later cleanup slice (out of scope here) knows exactly what to delete
 * and when it is safe. Field names mirror the Operator's own hand-made W32 smoke-test manifest
 * (`idea`, `recipe`, `scheduled_at`, `s3_keys`, `urls`, `rows`) for continuity with that live-verified
 * reference; `stripped_notes` is carried BOTH per-Asset (this Asset's own flagged notes) and flattened
 * at the top level (a quick, whole-batch glance) — issue #145 AC4.
 */

/** One Asset's manifest entry — the cleanup contract's unit of record. */
export interface ScheduleManifestAssetEntry {
  /** The Idea id this Asset belongs to. */
  readonly idea: string;
  readonly recipe: string;
  /** ISO-8601 UTC — the SAME instant stamped onto the ledger's `scheduled_at` for this Asset. */
  readonly scheduled_at: string;
  /** Every hosted S3 object key for this Asset's slides, in slide order. */
  readonly s3_keys: readonly string[];
  /** Every hosted slide's public URL, in the SAME order as `s3_keys` (index-for-index). */
  readonly urls: readonly string[];
  /** Which CSV file this Asset appears in, and which Channel labels it was written under there —
   *  `{ "zoho-main.csv": ["Facebook", "Instagram", "TikTok"], "zoho-linkedin-x.csv": [...] }`. */
  readonly rows: Readonly<Record<string, readonly string[]>>;
  /** This Asset's own stripped LinkedIn unresolved-mentions notes (human-readable), if any — issue
   *  #145 AC4: never appears in an exported caption, always appears here. */
  readonly stripped_notes: readonly string[];
}

/** The full Schedule Batch manifest — written to `<run folder>/zoho-manifest.json`. */
export interface ScheduleManifest {
  /** A stable identifier for this export run: `<format>-<run>`. */
  readonly batch: string;
  readonly brand: string;
  readonly format: string;
  readonly run: string;
  /** ISO-8601 — when this export was run (the injected clock, never a bare `Date.now()` inside a pure
   *  module). */
  readonly created_at: string;
  readonly csv_files: readonly string[];
  /** Every Asset's `stripped_notes`, flattened into one whole-batch list — issue #145 AC4. */
  readonly stripped_notes: readonly string[];
  readonly ideas: readonly ScheduleManifestAssetEntry[];
}

/** Everything `buildManifest` needs — already-resolved, so this stays a pure assembly step. */
export interface BuildManifestInput {
  readonly brand: string;
  readonly format: string;
  readonly run: string;
  readonly createdAt: string;
  readonly csvFiles: readonly string[];
  readonly assets: readonly ScheduleManifestAssetEntry[];
}

/**
 * Assemble the full `ScheduleManifest` from its already-resolved parts. PURE: no disk, no clock (`now`
 * is always the caller's explicit `createdAt`) — never shares an array reference with its inputs.
 */
export function buildManifest(input: BuildManifestInput): ScheduleManifest {
  return {
    batch: `${input.format}-${input.run}`,
    brand: input.brand,
    format: input.format,
    run: input.run,
    created_at: input.createdAt,
    csv_files: [...input.csvFiles],
    stripped_notes: input.assets.flatMap((a) => a.stripped_notes),
    ideas: input.assets.map((a) => ({
      idea: a.idea,
      recipe: a.recipe,
      scheduled_at: a.scheduled_at,
      s3_keys: [...a.s3_keys],
      urls: [...a.urls],
      rows: { ...a.rows },
      stripped_notes: [...a.stripped_notes],
    })),
  };
}
