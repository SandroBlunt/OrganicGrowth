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
  const port = Number.isFinite(parsedPort) && parsedPort > 0 ? parsedPort : DEFAULT_PORT;

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

/** Runs the viewer: prepares it, starts listening, prints the URL, and closes cleanly on Ctrl-C
 *  (SIGINT/SIGTERM) — a local process the Operator starts and stops, mirroring `run-worker.ts`'s own
 *  shape (a local process holding its own connection, not a Claude Code agent session). */
export async function main(): Promise<void> {
  const { db, server, dbPath, port } = await prepareLibraryViewer(process.argv.slice(2));

  await new Promise<void>((res) => server.listen(port, res));
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
}

const entryPoint = process.argv[1];
if (entryPoint !== undefined && fileURLToPath(import.meta.url) === resolve(entryPoint)) {
  main().catch((err: unknown) => {
    process.stderr.write(`/run-library-viewer failed: ${String(err)}\n`);
    process.exitCode = 1;
  });
}
