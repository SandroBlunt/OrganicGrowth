/**
 * `/run-library-viewer` — the local read-only Library's CLI entry (issue #210, epic #195's destination:
 * "the screen that does not exist today").
 *
 * A thin orchestration shell: opens the local SQLite database `{ readOnly: true }`
 * (`src/db/connection.ts`) — never creates or migrates it, since a read-only caller has nothing
 * legitimate to write — and hands the open connection to `createLibraryServer`
 * (`src/library/server.ts`). All the actual logic (querying, filtering, sorting, rendering) lives
 * there; this file's only job is argument parsing, a clear startup error when the database is not
 * ready yet, and a clean shutdown on Ctrl-C.
 *
 * Usage: `npm run library -- [--db <path>] [--port <n>]`. Defaults match the importer/backfill CLIs'
 * own convention (`src/importer/cli.ts`, `src/commands/backfill-hook-theme.ts`): `data/organicgrowth.db`.
 */

import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";

import type { DatabaseSync } from "node:sqlite";

import { openDatabase } from "../db/connection.ts";
import { createLibraryServer } from "../library/server.ts";

const DEFAULT_DB_PATH = "data/organicgrowth.db";
const DEFAULT_PORT = 4173;

/** Loopback-only, always. This is a LOCAL HTML viewer, never a web app (epic #195's own architecture
 *  decision #3) — the Operator's brand Copy, Production Specs, Post URLs and media must never be
 *  reachable from another device on the same network. Passed explicitly to `server.listen()`: Node's
 *  documented default when no host is given is to bind EVERY interface (`::`/`0.0.0.0`), not loopback. */
const LOOPBACK_HOST = "127.0.0.1";

function findFlag(args: readonly string[], flag: string): string | undefined {
  const i = args.indexOf(flag);
  return i === -1 || i === args.length - 1 ? undefined : args[i + 1];
}

/** A read-only-opened database, and the server built against it — not yet `listen()`-ing. */
export interface PreparedLibraryViewer {
  readonly db: DatabaseSync;
  readonly server: Server;
  readonly dbPath: string;
  readonly port: number;
}

/**
 * Opens `--db` (default `data/organicgrowth.db`) `{ readOnly: true }` and builds the server against
 * it. Throws a clear, actionable error — never silently creates or migrates anything — for: a database
 * file that does not exist yet ("run the importer first"), or one that exists but carries no schema yet
 * (e.g. an empty file). Both are genuinely different failures from "the database has zero rows in it,"
 * which is a perfectly normal state this function does NOT reject (an empty-but-migrated database opens
 * fine — the Library screen renders "no Assets" per `render/library.ts`'s own empty state).
 */
export async function prepareLibraryViewer(args: readonly string[]): Promise<PreparedLibraryViewer> {
  const dbPath = findFlag(args, "--db") ?? DEFAULT_DB_PATH;
  const portFlag = findFlag(args, "--port");
  const parsedPort = portFlag !== undefined ? Number(portFlag) : DEFAULT_PORT;
  // `>= 0`, not `> 0`: port 0 is the standard OS convention for "assign any free port" (used by tests to
  // avoid a hardcoded, collision-prone port) — only a negative or non-finite value falls back to the
  // default.
  const port = Number.isFinite(parsedPort) && parsedPort >= 0 ? parsedPort : DEFAULT_PORT;

  let db: DatabaseSync;
  try {
    db = await openDatabase(dbPath, { readOnly: true });
  } catch (err: unknown) {
    throw new Error(
      `Could not open "${dbPath}" read-only (${String(err)}). This viewer never creates a database — ` +
        `run "npm run import-data" (and, if needed, "npm run backfill-hook-theme") first.`,
    );
  }

  try {
    db.prepare(`SELECT version FROM schema_migrations LIMIT 1`).get();
  } catch {
    db.close();
    throw new Error(`"${dbPath}" exists but has no migrated schema yet. Run "npm run import-data" first.`);
  }

  const server = createLibraryServer(db);
  return { db, server, dbPath, port };
}

/** Runs the viewer: prepares it, starts listening on {@link LOOPBACK_HOST} ONLY, prints the URL, and
 *  closes cleanly on Ctrl-C (SIGINT/SIGTERM) — a local process the Operator starts and stops, mirroring
 *  `run-worker.ts`'s own shape (a local process holding its own connection, not a Claude Code agent
 *  session). Accepts an explicit `argv` (defaulting to the real `process.argv.slice(2)`) so a test can
 *  drive this EXACT function — the real CLI path, not a re-implementation of it — with a throwaway
 *  database and an OS-assigned port, then inspect exactly what address it bound. Returns the prepared
 *  viewer (now listening) so a caller — test or otherwise — can close it; the CLI entry point below
 *  ignores the return value and relies on the SIGINT/SIGTERM handler for shutdown instead. */
export async function main(argv: readonly string[] = process.argv.slice(2)): Promise<PreparedLibraryViewer> {
  const prepared = await prepareLibraryViewer(argv);
  const { db, server, dbPath, port } = prepared;

  await new Promise<void>((res) => server.listen(port, LOOPBACK_HOST, res));
  const address = server.address() as AddressInfo;
  process.stdout.write(
    `OrganicGrowth Library (read-only) — serving "${dbPath}" at http://localhost:${address.port} — Ctrl-C to stop.\n`,
  );

  const shutdown = (): void => {
    server.close(() => {
      db.close();
      process.exit(0);
    });
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  return prepared;
}

const entryPoint = process.argv[1];
if (entryPoint !== undefined && fileURLToPath(import.meta.url) === resolve(entryPoint)) {
  main().catch((err: unknown) => {
    process.stderr.write(`/run-library-viewer failed: ${String(err)}\n`);
    process.exitCode = 1;
  });
}
