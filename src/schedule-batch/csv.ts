/**
 * CSV rendering — pure deep module for Zoho's bulk-scheduler dialect (issue #145, parent #140).
 *
 * The dialect below is LIVE-VERIFIED (the 2026-08-04 W32 smoke test, scheduled for real through Zoho's
 * uploader) and reproduced exactly:
 *   - NO header row.
 *   - Fixed column order: Schedule Time (bare, unquoted `MM/DD/YYYY HH:mm`), Channels (quoted), Post
 *     Content (quoted; a real newline is encoded as the literal two-character `\n`, which Zoho renders
 *     back as a real line break), Link (always empty), one bare UNQUOTED field per media URL (RAGGED row
 *     width — a quoted, comma-joined media cell parses as NO media at all; Facebook still "succeeds" in
 *     that failure mode because text-only posts are allowed there, while Instagram/TikTok silently error
 *     "add an image" — this dialect is what avoids that trap entirely), GMB Button (always empty), GMB
 *     Link (always empty).
 *   - Max 350 rows per file (`MAX_ZOHO_ROWS`).
 *
 * `zohoCsvFileName` derives each Zoho Social Brand grouping's output filename from its OWN config
 * (never a hardcoded per-Brand string, per the issue): the FIRST configured grouping is always
 * `zoho-main.csv` (mirrors PRD #140 story 6's own "the main Zoho Social Brand" phrasing); every
 * additional grouping is named by its own platform slugs, sorted for determinism and joined with `-`
 * (e.g. `["linkedin","x"]` -> `zoho-linkedin-x.csv`) — this is exactly how straw-motion's two
 * Zoho Social Brands (`brand-profile.yaml`'s `zoho.brands`, issue #143) name their two output files.
 */

/** The hard row cap PRD #140 states for one Zoho bulk-scheduler CSV file. */
export const MAX_ZOHO_ROWS = 350;

/** Standard CSV field quoting: wrap in double quotes, doubling any internal double-quote. Commas and
 *  newlines inside `value` are left completely alone — quoting alone is what protects them; newline
 *  ENCODING (real newline -> literal `\n`) is a separate step, `encodeZohoLineBreaks`. */
export function escapeCsvField(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

/** Replace every real line break (`\n` or `\r\n`) in `text` with the literal two-character sequence
 *  `\` + `n` — Zoho's own multi-paragraph caption convention (live-verified: it renders back as a real
 *  line break once queued). */
export function encodeZohoLineBreaks(text: string): string {
  return text.replace(/\r\n|\n/g, "\\n");
}

/**
 * Render one platform's Post Content body: the caption, trimmed of trailing whitespace, followed — only
 * when there is at least one hashtag — by a blank line and the hashtags space-joined. NEVER a trailing
 * newline (unlike `src/asset/output-bundle.ts`'s `captionText`, which is written to a human-read text
 * file and does end with one — this is a raw CSV field value, encoded separately by the caller).
 */
export function zohoCaptionField(caption: string, hashtags: readonly string[]): string {
  const body = caption.replace(/\r\n/g, "\n").trimEnd();
  return hashtags.length > 0 ? `${body}\n\n${hashtags.join(" ")}` : body;
}

/** One CSV row's already-resolved content — everything `buildZohoCsvRow` needs, with no further
 *  platform lookup required. */
export interface ZohoRowInput {
  /** `MM/DD/YYYY HH:mm`, already rendered in this row's OWN Zoho Social Brand's clock
   *  (`timezone.ts`'s `formatZohoScheduleTime`). Written bare, never quoted. */
  readonly scheduleTime: string;
  /** The exact Zoho channel label for this row's platform (e.g. `"Facebook"`, `"LinkedInProfile"`). */
  readonly channelLabel: string;
  readonly caption: string;
  readonly hashtags: readonly string[];
  /** This row's media URLs, already sliced to the right count for its platform (all 7 slides for a
   *  carousel-capable platform, the first 4 for X) and in narrative slide order. */
  readonly mediaUrls: readonly string[];
}

/**
 * Build one Zoho bulk-scheduler CSV row, live-verified dialect: bare Schedule Time, quoted Channels,
 * quoted (newline-encoded) Post Content, empty Link, one bare unquoted field per media URL (ragged row
 * width), empty GMB Button, empty GMB Link.
 */
export function buildZohoCsvRow(input: ZohoRowInput): string {
  const captionField = encodeZohoLineBreaks(zohoCaptionField(input.caption, input.hashtags));
  const fields = [
    input.scheduleTime,
    escapeCsvField(input.channelLabel),
    escapeCsvField(captionField),
    "", // Link — always empty (no accidental link preview)
    ...input.mediaUrls, // bare, unquoted — never comma-joined into one quoted cell
    "", // GMB Button — always empty
    "", // GMB Link — always empty
  ];
  return fields.join(",");
}

/**
 * Join already-built rows into one CSV file's full text: one row per line (no header row), LF-separated,
 * with a trailing newline after the last row. Throws, naming both the actual and the max row count,
 * when `rows.length` exceeds `MAX_ZOHO_ROWS` — this export never silently truncates a batch.
 */
export function buildZohoCsvFile(rows: readonly string[]): string {
  if (rows.length > MAX_ZOHO_ROWS) {
    throw new Error(
      `schedule-batch: a Zoho CSV file cannot exceed ${MAX_ZOHO_ROWS} rows (got ${rows.length}). ` +
        "Split the run into smaller batches.",
    );
  }
  return rows.map((row) => `${row}\n`).join("");
}

/**
 * The output filename for the `index`-th configured Zoho Social Brand grouping (`ZohoSocialBrand.channels`
 * platform list, `index`'s position in `zoho.brands`). The first (`index === 0`) is always
 * `zoho-main.csv`; every other grouping is named by its OWN platform slugs, sorted and hyphen-joined —
 * derived from config, never a hardcoded per-Brand literal.
 */
export function zohoCsvFileName(index: number, platforms: readonly string[]): string {
  if (index === 0) return "zoho-main.csv";
  const slug = [...platforms].sort().join("-");
  return `zoho-${slug}.csv`;
}
