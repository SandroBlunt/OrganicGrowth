/**
 * Minimal ambient declaration for Node's built-in `node:sqlite` module (issue #201).
 *
 * `node:sqlite` shipped in Node 22 and is available at runtime WITHOUT any flag on the Node version
 * this repo targets (`package.json`'s `engines.node` is `>=22`; verified at `v22.23.0` — importing
 * `node:sqlite` works with only Node's own "SQLite is an experimental feature" runtime warning, which
 * is cosmetic and does not fail anything). What is MISSING is the *type* declaration: the
 * `@types/node@20.19.x` this repo currently pins predates `node:sqlite` entirely, so
 * `import { DatabaseSync } from "node:sqlite"` fails `tsc --noEmit` with "Cannot find module" without
 * this file.
 *
 * Deliberately scoped to ONLY the surface this codebase actually calls (`src/db/*`) rather than
 * vendoring the full upstream `.d.ts` — verified by hand against the real runtime API
 * (`Object.getOwnPropertyNames(DatabaseSync.prototype)` /
 * `Object.getOwnPropertyNames(StatementSync.prototype)` on Node 22.23.0): `exec`, `prepare`, `close`
 * on `DatabaseSync`; `run`, `get`, `all` on `StatementSync`. This file becomes DELETABLE the day
 * `@types/node` is bumped past the version that ships real `node:sqlite` types (~22.5+) — see the Build
 * Report's Known Limits.
 */
declare module "node:sqlite" {
  /** A synchronous, in-process SQLite database handle. */
  export class DatabaseSync {
    /** Opens (creating if absent) the database file at `path`, or an in-memory database for `:memory:`. */
    constructor(path: string);
    /** Runs one or more `;`-separated SQL statements with no bound parameters and no result rows. */
    exec(sql: string): void;
    /** Compiles `sql` into a reusable, bindable prepared statement. */
    prepare(sql: string): StatementSync;
    /** Closes the underlying database handle. */
    close(): void;
  }

  /** A compiled SQL statement, bindable with positional (`?`) parameters. */
  export class StatementSync {
    /** Executes an INSERT/UPDATE/DELETE/DDL statement; returns the rowid and row-count it affected. */
    run(...params: unknown[]): { readonly lastInsertRowid: number | bigint; readonly changes: number | bigint };
    /** Executes a SELECT and returns its first row, or `undefined` when there is none. */
    get(...params: unknown[]): Record<string, unknown> | undefined;
    /** Executes a SELECT and returns every matching row. */
    all(...params: unknown[]): Record<string, unknown>[];
  }
}
