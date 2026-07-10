/**
 * TOON table parser — pure deep module.
 *
 * The live Magnific `spaces_state` / `spaces_get_nodes` MCP tools return a compact, CSV-like tabular
 * text format (not JSON) that this repo calls TOON, e.g.:
 *
 *   nodes[58]{id,type,name,selected,x,y,width,height,pageId,sourceNodeId,groupId,panelIndex,workflowStatus}:
 *     010b563f-...,prompt-generator,Video Prompt Clip 3,false,5377.34,5672.76,...
 *   nodeData[10]{elementId,key,value}:
 *     6bc54e3e-...,text,"{\n  \"character_concepts\": [...
 *
 * A `name[N]{col1,col2,...}:` header line introduces exactly `N` following rows; each row is a
 * comma-separated list of fields. A field is either a bare token (an id, a number, `null`, `false`,
 * `idle`, ...) or a DOUBLE-QUOTED field whose quoted content is exactly a JSON string literal (internal
 * quotes/newlines are backslash-escaped exactly as `JSON.stringify` would produce) — so a quoted field
 * is unescaped by `JSON.parse`-ing it, never by naive un-quoting.
 *
 * Pure and deterministic: no I/O, no network. It parses an already-fetched raw response string (the
 * live-capture fixture text in tests; the injected `LiveMcpTransport`'s raw response in production).
 */

/** One parsed TOON table: its declared row count, its column names, and its parsed rows. */
export interface ToonTable {
  readonly name: string;
  readonly count: number;
  readonly columns: readonly string[];
  /** Each row as a column-name -> field-value map. A bare `null` field parses to `null`. */
  readonly rows: ReadonlyArray<Readonly<Record<string, string | null>>>;
}

const TABLE_HEADER_RE = /^(\w+)\[(\d+)\]\{([^}]*)\}:\s*$/;

/**
 * Split one TOON row into its raw fields, honoring double-quoted fields (which may embed commas,
 * escaped quotes, and escaped newlines — see the module docstring). Does NOT unescape quoted fields;
 * call {@link parseToonField} on each result to get the real value.
 */
export function splitToonRow(line: string): string[] {
  const fields: string[] = [];
  let i = 0;
  const n = line.length;
  for (;;) {
    if (line[i] === '"') {
      let j = i + 1;
      while (j < n) {
        if (line[j] === "\\" && j + 1 < n) {
          j += 2;
          continue;
        }
        if (line[j] === '"') {
          j++;
          break;
        }
        j++;
      }
      fields.push(line.slice(i, j));
      i = j;
    } else {
      let j = i;
      while (j < n && line[j] !== ",") j++;
      fields.push(line.slice(i, j));
      i = j;
    }
    if (i >= n) break;
    if (line[i] === ",") {
      i++;
      continue;
    }
    break;
  }
  return fields;
}

/**
 * Resolve one raw TOON field to its real value: the bare literal `null` parses to `null`; a
 * double-quoted field is unescaped via `JSON.parse` (it is exactly a JSON string literal); anything
 * else is returned as-is (a bare token: an id, a number, `false`, `idle`, ...).
 */
export function parseToonField(raw: string): string | null {
  if (raw === "null") return null;
  if (raw.length >= 2 && raw.startsWith('"')) {
    try {
      return JSON.parse(raw) as string;
    } catch {
      return raw;
    }
  }
  return raw;
}

/**
 * Parse every `name[N]{col,...}:` table in a raw TOON response into a map keyed by table name (e.g.
 * `nodes`, `nodeData`, `connections`). Non-table lines (scalar `key: value` lines, blank lines, trailing
 * notes) are ignored. A table's `N` declared rows are consumed even if fewer physical lines remain.
 */
export function parseToonTables(text: string): Readonly<Record<string, ToonTable>> {
  const lines = text.split("\n");
  const tables: Record<string, ToonTable> = {};
  let i = 0;
  while (i < lines.length) {
    const line = lines[i] ?? "";
    const match = TABLE_HEADER_RE.exec(line.trimEnd());
    if (!match) {
      i++;
      continue;
    }
    const name = match[1]!;
    const count = Number(match[2]);
    const columns = match[3]!
      .split(",")
      .map((c) => c.trim())
      .filter((c) => c.length > 0);
    i++;
    const rows: Array<Record<string, string | null>> = [];
    for (let r = 0; r < count; r++) {
      const rowLine = lines[i];
      if (rowLine === undefined) break;
      const fields = splitToonRow(rowLine.trim());
      const row: Record<string, string | null> = {};
      columns.forEach((col, idx) => {
        row[col] = parseToonField(fields[idx] ?? "");
      });
      rows.push(row);
      i++;
    }
    tables[name] = { name, count, columns, rows };
  }
  return tables;
}
