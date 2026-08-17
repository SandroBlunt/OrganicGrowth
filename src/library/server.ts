/**
 * The local read-only Library's HTTP server (issue #210) — the orchestration shell wiring the read
 * model (`read-model.ts`) and the pure render modules (`render/**`) together over `node:http`.
 *
 * **Read-only by construction, AC1/AC10:**
 *   - Every route handler below only ever CALLS a read-model function (which itself only ever calls a
 *     store's READ export — see `read-model.ts`'s own doc comment) or `resolveMediaFile` (a plain
 *     `readFile`). Nothing in this file calls a store's write function, and nothing here imports one.
 *   - Any HTTP method other than `GET` is refused with `405 Method Not Allowed` before any route is
 *     even consulted — there is no `POST`/`PUT`/`PATCH`/`DELETE` handler anywhere in this module, for
 *     any path (AC10: "not a disabled button, no endpoint" — there is genuinely no code path that would
 *     accept one).
 *   - The one form on the Library screen (`render/library.ts`'s filter/sort controls) is
 *     `method="get"` — submitting it only ever produces a new GET request to `/` with a query string;
 *     it is not a write path by construction, proven by `render/library.test.ts`'s own assertion that
 *     no `<form method="post">` is ever emitted.
 *   - `src/library/read-only.test.ts` proves the STRONGER claim directly: opening the SAME database
 *     connection this server is handed with `{ readOnly: true }` (`src/db/connection.ts`) makes a stray
 *     write throw AT THE SQLITE LAYER ITSELF, not merely by this file's own discipline.
 */

import { createServer, type IncomingMessage, type ServerResponse, type Server } from "node:http";

import type { DatabaseSync } from "node:sqlite";

import { buildLibraryIndex, getAssetDetail, buildQueueRows, buildFitPerformanceData } from "./read-model.ts";
import { applyLibraryFilter, deriveFilterOptions, sortLibraryRows, topAssetsByPerformance } from "./filter-sort.ts";
import { page } from "./render/html.ts";
import { renderLibraryBody } from "./render/library.ts";
import { renderAssetBody } from "./render/asset.ts";
import { renderQueueBody } from "./render/queue.ts";
import { renderChartBody } from "./render/chart.ts";
import { renderTopBody } from "./render/top.ts";
import { resolveMediaFile } from "./media.ts";
import { getAssetById } from "../asset/store.ts";
import { isHookType } from "../vocabulary/hook-type.ts";
import { isTheme } from "../vocabulary/theme.ts";
import type { LibraryFilter, LibrarySort, TopAssetEntry } from "./types.ts";

const TOP_N = 5;

function parseFilter(params: URLSearchParams): LibraryFilter {
  const hookType = params.get("hookType");
  const theme = params.get("theme");
  const recipe = params.get("recipe");
  const format = params.get("format");
  return {
    ...(hookType !== null && hookType !== "" && isHookType(hookType) ? { hookType } : {}),
    ...(theme !== null && theme !== "" && isTheme(theme) ? { theme } : {}),
    ...(recipe !== null && recipe !== "" ? { recipe } : {}),
    ...(format !== null && format !== "" ? { format } : {}),
  };
}

const VALID_SORTS: ReadonlySet<string> = new Set<LibrarySort>(["performance", "fit", "produced", "title"]);

function parseSort(params: URLSearchParams): LibrarySort {
  const raw = params.get("sort");
  return raw !== null && VALID_SORTS.has(raw) ? (raw as LibrarySort) : "performance";
}

function sendHtml(res: ServerResponse, status: number, body: string): void {
  res.writeHead(status, { "content-type": "text/html; charset=utf-8" });
  res.end(body);
}

function sendNotFound(res: ServerResponse): void {
  sendHtml(res, 404, page("Not Found", "<p>Not found.</p>"));
}

const ASSET_PATH = /^\/assets\/([^/]+)$/;
const MEDIA_PATH = /^\/media\/([^/]+)$/;

async function handleGet(db: DatabaseSync, url: URL, res: ServerResponse): Promise<void> {
  const path = url.pathname;

  if (path === "/") {
    const allRows = buildLibraryIndex(db);
    const filter = parseFilter(url.searchParams);
    const sort = parseSort(url.searchParams);
    const filtered = applyLibraryFilter(allRows, filter);
    const sorted = sortLibraryRows(filtered, sort);
    const options = deriveFilterOptions(allRows);
    sendHtml(res, 200, page("Library", renderLibraryBody(sorted, options, filter, sort, allRows.length)));
    return;
  }

  if (path === "/queue") {
    sendHtml(res, 200, page("Run & Queue", renderQueueBody(buildQueueRows(db))));
    return;
  }

  if (path === "/chart") {
    sendHtml(res, 200, page("Fit vs Performance", renderChartBody(buildFitPerformanceData(db))));
    return;
  }

  if (path === "/top") {
    const allRows = buildLibraryIndex(db);
    const top = topAssetsByPerformance(allRows, TOP_N);
    const totalScored = allRows.filter((r) => r.bestPerformanceScore !== undefined).length;
    const entries: readonly TopAssetEntry[] = top.map((row) => ({ row, spec: getAssetById(db, row.assetId)?.spec ?? null }));
    sendHtml(res, 200, page("Top 5 by Performance Score", renderTopBody(entries, totalScored)));
    return;
  }

  const assetMatch = ASSET_PATH.exec(path);
  if (assetMatch !== null) {
    const detail = getAssetDetail(db, decodeURIComponent(assetMatch[1]!));
    if (detail === null) {
      sendNotFound(res);
      return;
    }
    sendHtml(res, 200, page(detail.idea.title, renderAssetBody(detail)));
    return;
  }

  const mediaMatch = MEDIA_PATH.exec(path);
  if (mediaMatch !== null) {
    const resolved = await resolveMediaFile(db, decodeURIComponent(mediaMatch[1]!));
    if (resolved === null) {
      sendNotFound(res);
      return;
    }
    res.writeHead(200, { "content-type": resolved.mime, "content-length": resolved.bytes.length });
    res.end(resolved.bytes);
    return;
  }

  sendNotFound(res);
}

async function handleRequest(db: DatabaseSync, req: IncomingMessage, res: ServerResponse): Promise<void> {
  // AC10: no write path at all — refused before ANY route is consulted, for every path.
  if (req.method !== "GET") {
    res.writeHead(405, { "content-type": "text/plain; charset=utf-8", allow: "GET" });
    res.end("This is a read-only viewer. It has no write path — GET only.");
    return;
  }

  const url = new URL(req.url ?? "/", "http://localhost");
  await handleGet(db, url, res);
}

/**
 * Builds (but does not `listen()`) the Library's HTTP server against `db` — a caller-provided,
 * already-open, already-migrated `DatabaseSync` (the CLI entry, `src/commands/run-library-viewer.ts`,
 * opens it `{ readOnly: true }`; tests may pass a plain read-write temp db, since read-only-ness is
 * enforced at the CONNECTION, not by this function).
 */
export function createLibraryServer(db: DatabaseSync): Server {
  return createServer((req, res) => {
    handleRequest(db, req, res).catch((err: unknown) => {
      if (!res.headersSent) {
        res.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
      }
      res.end(`Internal error: ${String(err)}`);
    });
  });
}
