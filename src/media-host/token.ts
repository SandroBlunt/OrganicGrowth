/**
 * The unguessable key component (issue #198 AC2): "Uploaded keys include an unguessable component, so
 * knowing the Brand, week, Idea number and slide name is not enough to construct a key." Before this,
 * `scheduleMediaKey` (`src/schedule-batch/media-key.ts`) built a fully deterministic key from those four
 * public values alone — with the bucket's old public-read policy removed and listing already blocked,
 * a guessable key would still let anyone who can compute it fetch the object directly.
 *
 * `randomMediaKeyToken` reads system randomness, so it is deliberately NOT pure — it is only ever called
 * from an orchestration shell (`src/commands/export-schedule.ts`, `src/commands/schedule-via-zoho-mcp.ts`),
 * never from a pure deep module. `scheduleMediaKey` itself stays pure and just takes the token as an
 * explicit argument, exactly like every other caller-supplied non-determinism in this codebase (the
 * clock, `now`).
 */

import { randomBytes } from "node:crypto";

/** Random bytes backing each token — 16 bytes = 128 bits of entropy, ample to make a hosted key
 *  practically unguessable even by someone who already knows the Brand/run/Idea/slide-name components. */
const TOKEN_BYTES = 16;

/**
 * A fresh, cryptographically random, URL- and S3-key-safe token (base64url, no padding — letters,
 * digits, `-`, `_` only). Two calls are (with overwhelming probability) never equal.
 */
export function randomMediaKeyToken(): string {
  return randomBytes(TOKEN_BYTES).toString("base64url");
}
