/**
 * Parses an Apify `run-sync-get-dataset-items` HTTP response body — pure deep module (issue #200).
 *
 * That endpoint's success body is always a JSON array of dataset items (zero or more). This module
 * turns that raw text into what `PerformanceScrapePort.scrapePost` promises: the FIRST item (`unknown`,
 * mapped by the caller with `src/apify/normalize-metrics.ts`), or `null` when the actor found nothing —
 * a routine, honestly-reported outcome (data-handling rule 8: never fabricate), never an error. A body
 * that is not valid JSON, or valid JSON that is not an array, is genuinely unexpected (a malformed/error
 * response) — that throws rather than silently returning `null`, so the caller can tell "no data" apart
 * from "the response was garbled".
 *
 * Pure: no I/O, no network — takes already-fetched text and returns/throws synchronously.
 */

/**
 * Parse a `run-sync-get-dataset-items` response body. Returns the first array item, or `null` for an
 * empty array. Throws for invalid JSON or a non-array JSON value.
 */
export function parseRunSyncDatasetItems(bodyText: string): unknown | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(bodyText);
  } catch {
    throw new Error("Apify response was not valid JSON");
  }
  if (!Array.isArray(parsed)) {
    throw new Error("Apify response was not a JSON array of dataset items");
  }
  return parsed.length > 0 ? parsed[0] : null;
}
