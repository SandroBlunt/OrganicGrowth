/**
 * Pure diagnostic classifier for `src/apify/live/smoke.ts` (issue #253).
 *
 * WHY THIS EXISTS: `smoke.ts` is a manual, one-off script — never run by `npm test` (its own module
 * docstring: "NEVER run by npm test... this is not a `*.test.ts` file and nothing else imports it").
 * Before this slice it treated EVERY failure to get data the same way: `LiveApifyClient.scrapePost`
 * either returns `null` (the actor ran fine and genuinely found nothing for this URL) or THROWS
 * (`ApifyRequestError` when Apify itself rejects the request — e.g. a 404 because the actor slug is
 * wrong/dead — or `ApifyTokenMissingError`/a parse error for other failures). The old script printed
 * the SAME "Apify returned NO data for this URL... check the post is still public" message regardless
 * — so a dead actor slug (`ApifyRequestError` with `status: 404`) read exactly like an empty, healthy
 * scrape. It blamed the post for what was actually a broken slug.
 *
 * This module extracts the one piece of that distinction that CAN be pulled out into a pure,
 * unit-testable function: given a caught error and the actor slug that produced it, decide whether
 * it is an `ApifyRequestError` (the actor/request itself was rejected — never "no data") and, if so,
 * return a message that says so plainly, naming the actor slug and the HTTP status. `smoke.ts`'s own
 * `main()` stays a thin, untested orchestration shell that calls this function in its catch block;
 * everything decision-worthy lives here, where it CAN be proven by a real test.
 *
 * Pure: no I/O, no network, deterministic.
 */

import { ApifyRequestError } from "./client.ts";

/**
 * Classify a caught scrape error. Returns a human-readable diagnostic message when `err` is an
 * `ApifyRequestError` (the actor/request was rejected by Apify itself — e.g. a 404 for a dead/wrong
 * actor slug, or a 401 for a bad token) — this is NEVER "no data for this URL", it means the request
 * itself never produced a dataset to have "no data" in. Returns `null` for any other error shape
 * (e.g. `ApifyTokenMissingError`, a JSON-parse failure), which the caller should re-throw/report
 * generically instead.
 *
 * @param err        The error caught from `LiveApifyClient.scrapePost`.
 * @param actorSlug  The actor slug the failed request was made against (named in the message so the
 *                   Operator knows exactly which configured slug to check, e.g. against
 *                   `curl -s -o /dev/null -w "%{http_code}\n" https://api.apify.com/v2/acts/<slug
 *                   with / -> ~>`).
 */
export function describeActorRequestFailure(err: unknown, actorSlug: string): string | null {
  if (!(err instanceof ApifyRequestError)) return null;

  const tildeSlug = actorSlug.replace("/", "~");
  return (
    `ACTOR REQUEST FAILED (${err.status} ${err.statusText}) for actor "${actorSlug}". This means the ` +
    `ACTOR/REQUEST itself was rejected by Apify — a wrong or dead actor slug (e.g. a 404), a bad ` +
    `token, or a malformed request. This is a DIFFERENT, distinct failure from an empty/routine ` +
    `result — do NOT read it as the post having nothing to show. Verify the slug resolves at all ` +
    `before trusting anything else: ` +
    `curl -s -o /dev/null -w "%{http_code}\\n" https://api.apify.com/v2/acts/${tildeSlug}`
  );
}
