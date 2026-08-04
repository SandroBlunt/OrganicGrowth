/**
 * A tiny, dependency-free `.env` loader for the live Media Host adapter (issue #144). The repo's ONLY
 * runtime dependency is `yaml` (CLAUDE.md — no new npm dependencies), so this is a deliberately small
 * hand-rolled parser rather than pulling in `dotenv`.
 *
 * Credential strategy (issue #144's own environment note): the live adapter sources `.env` when
 * present, but an `.env` value NEVER overrides an already-set process env var — and when `.env` has
 * nothing relevant (this repo's `.env` today holds only `APIFY_API_TOKEN`), the merged env is
 * unchanged from `process.env`, so the AWS CLI's own default credential chain (`~/.aws/credentials`,
 * an IAM role, etc.) applies exactly as if this loader had never run. `data-handling.md` rule 1 is
 * upheld throughout: secret VALUES are never logged by anything in this module.
 */

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

/** Parse `.env`-style content (`KEY=VALUE` lines) into a plain object. Pure — no I/O. */
export function parseDotEnv(content: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line === "" || line.startsWith("#")) continue;
    const withoutExport = line.startsWith("export ") ? line.slice("export ".length).trim() : line;
    const eq = withoutExport.indexOf("=");
    if (eq === -1) continue;
    const key = withoutExport.slice(0, eq).trim();
    if (key === "") continue;
    let value = withoutExport.slice(eq + 1).trim();
    if (
      value.length >= 2 &&
      ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'")))
    ) {
      value = value.slice(1, -1);
    }
    result[key] = value;
  }
  return result;
}

/** Read and parse `.env` at `path`. Returns `{}` (never throws) when the file is missing/unreadable. */
export async function loadDotEnvFile(path: string): Promise<Record<string, string>> {
  let raw: string;
  try {
    raw = await readFile(path, "utf8");
  } catch {
    return {};
  }
  return parseDotEnv(raw);
}

export interface LoadEffectiveEnvOptions {
  /** Path to the `.env` file. Default: `.env` resolved against the current working directory. */
  readonly envFilePath?: string | undefined;
  /** The base env `.env` fills gaps in. Default: `process.env`. */
  readonly base?: NodeJS.ProcessEnv | undefined;
}

/**
 * The effective env for shelling out to the AWS CLI: `base` (default `process.env`), with any `.env`
 * key filled in ONLY where `base` does not already define it. An already-exported shell/CI credential
 * always wins over `.env`.
 */
export async function loadEffectiveEnv(
  options: LoadEffectiveEnvOptions = {},
): Promise<NodeJS.ProcessEnv> {
  const path = options.envFilePath ?? resolve(".env");
  const base = options.base ?? process.env;
  const overlay = await loadDotEnvFile(path);
  const merged: NodeJS.ProcessEnv = { ...base };
  for (const [key, value] of Object.entries(overlay)) {
    if (merged[key] === undefined) {
      merged[key] = value;
    }
  }
  return merged;
}
