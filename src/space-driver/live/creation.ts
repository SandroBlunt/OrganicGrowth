/**
 * Parse a raw `creations_get` response into `{identifier, url}` — pure deep module, no I/O.
 *
 * Per the sanctioned live capture, `creations_get` returns a top-level key/value block (NOT JSON, and
 * NOT the tabular TOON of `spaces_state`) — one `key: value` pair per line, with a nested indented
 * `metadata:` block (and, for a video creation, a further-nested `mediaCollection[N]:` list) that this
 * parser deliberately ignores: the port only needs `identifier` and `url`.
 */

/** The fields the port needs from a `creations_get` response, plus the optional `kind` (video marker). */
export interface ParsedCreation {
  readonly identifier: string;
  readonly url: string;
  readonly kind?: string;
}

/**
 * Parse a `creations_get` key/value block. Returns `null` if `identifier` or `url` is missing (an
 * unparseable/unexpected response — the caller decides how to treat that, never fabricating a result).
 */
export function parseCreationBlock(text: string): ParsedCreation | null {
  const top = new Map<string, string>();
  for (const line of text.split("\n")) {
    if (line.length === 0 || /^\s/.test(line)) continue; // skip blank lines and nested (indented) lines
    const sep = line.indexOf(":");
    if (sep === -1) continue;
    const key = line.slice(0, sep).trim();
    const valueRaw = line.slice(sep + 1).trim();
    if (key.length === 0 || valueRaw.length === 0) continue;
    top.set(key, unquoteScalar(valueRaw));
  }

  const identifier = top.get("identifier");
  const url = top.get("url");
  if (identifier === undefined || url === undefined) return null;

  const kind = top.get("kind");
  return kind !== undefined ? { identifier, url, kind } : { identifier, url };
}

/** Strip a `"..."` wrapper via `JSON.parse` (the value is a JSON string literal); pass through bare tokens. */
function unquoteScalar(raw: string): string {
  if (raw.length >= 2 && raw.startsWith('"')) {
    try {
      return JSON.parse(raw) as string;
    } catch {
      return raw;
    }
  }
  return raw;
}
