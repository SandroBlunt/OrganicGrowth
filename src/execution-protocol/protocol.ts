/**
 * Execution Protocol — types, the read-API truncation cap, and the canonical `Producer Protocol`
 * artifact (pure, no I/O).
 *
 * The Execution Protocol is the ordered set of **media** run-points that tells the Producer how to drive
 * a Space's own nodes (CONTEXT.md "Execution Protocol"; ADR-0003, revised by ADR-0010). It lives ON the
 * Space itself — a single `Producer Protocol` text node holding JSON — so it evolves with the canvas
 * instead of drifting in a separate repo. A run-point names the node to run (`start`), the run `mode`
 * (`downstream`), and the `gate` (if any) that follows it.
 *
 * --- THE GATE LIST IS OWNED BY THE RECIPE, NOT THIS PROTOCOL (ADR-0010) ---
 *
 * A run-point's `gate` still marks WHICH run-point a given gate pauses at, but the ORDERED gate list
 * itself — how many gates a production plan has, and in what order — is declared on the in-repo
 * **Recipe** (`src/recipe/registry.ts`'s `Recipe.gates`), not derived from this Protocol. `RunPointGate`
 * therefore widens from the old fixed `"cast" | null` to **any** Recipe-declared gate name (or `null`
 * for a run-point with no gate) — the generic run-until-gate driver (`space-driver/driver.ts`'s
 * `driveToNextGate`) walks a Recipe's run-points in order and pauses at whichever gate each one names.
 *
 * --- WHY RUN-POINTS REFERENCE NODES BY NAME (ADR-0003, load-bearing) ---
 *
 * Run-points reference nodes BY NAME (e.g. "Character Variants Generator", "Clip extractor"), never by
 * node ID. This keeps the protocol human-readable AND lets the same thin runner drive ANY Space that
 * follows the convention — the parser resolves a name to whatever ID that Space currently uses
 * (PRD #1 stories 23-25, 31). The discipline: a run-point must point at a UNIQUELY-named node; the
 * Space contains duplicate names elsewhere, and those are not valid run-points (the parser rejects
 * them — see `parse.ts`).
 *
 * --- WHY THE NODE STAYS UNDER ~1,900 CHARS (Spike 3, load-bearing) ---
 *
 * The Magnific read API (`spaces_state` AND `spaces_get_nodes`) TRUNCATES large text-node values at
 * ~1,900 characters (`docs/producer-spikes-results.md`, Spike 3 — PARTIAL/FAIL). A `Producer Protocol`
 * node larger than that would be SILENTLY truncated on read, dropping run-points without error.
 * Therefore the canonical protocol artifact below is deliberately compact and MUST round-trip through
 * the read API without truncation. `READ_API_TRUNCATION_CAP` records the cap; a test asserts the
 * serialized artifact stays comfortably under it (round-trip-without-truncation, proven hermetically
 * by a size assertion against the fake — authoring the node on the LIVE canvas is deferred to runtime,
 * see the slice handoff).
 */

/** The Magnific read API's text-node truncation cap, in characters (Spike 3). */
export const READ_API_TRUNCATION_CAP = 1900;

/**
 * Safety margin under the cap the canonical protocol must stay within, so "comfortably under" is a
 * checkable number, not a vibe. The serialized `Producer Protocol` must be <= this many characters.
 */
export const PROTOCOL_SIZE_BUDGET = 1500;

/** The exact name of the node that holds the Execution Protocol JSON on the canvas. */
export const PRODUCER_PROTOCOL_NODE_NAME = "Producer Protocol";

/** Run modes the Producer can drive a run-point in (ADR-0003: the cast/clip phases run `downstream`). */
export type RunMode = "downstream" | "singular";

/**
 * The gate that follows a run-point, if any. `null` means the protocol continues unattended (no pause).
 * Widened beyond the old fixed `"cast"` (ADR-0010, issue #57): any non-empty gate NAME a Recipe declares
 * is valid — the parser does not hard-code which names exist, since that list lives on the Recipe.
 */
export type RunPointGate = string | null;

/**
 * One run-point in the Execution Protocol: which node to run, in which mode, and the human gate (if
 * any) that follows it. `start` is a node NAME, resolved to an ID by the parser at run time.
 */
export interface ProtocolRunPoint {
  /** The NAME of the node to run (resolved to a node ID by the parser — never a hard-coded ID). */
  readonly start: string;
  /** The run mode for this run-point. */
  readonly mode: RunMode;
  /** The human gate that follows this run-point, or `null` for none. */
  readonly gate: RunPointGate;
}

/** The Execution Protocol document held in the `Producer Protocol` node. */
export interface ProtocolDocument {
  /** Ordered run-points; the Producer drives them in array order. */
  readonly run_points: readonly ProtocolRunPoint[];
}

/**
 * The canonical `Producer Protocol` artifact for the "JSON master" cast->clips Space.
 *
 * Two run-points around the human Cast gate (ADR-0003 two-phase split):
 *   1. cast  — run "Character Variants Generator" downstream, then PAUSE at the Cast gate (Phase A).
 *   2. clip  — run "Clip extractor" downstream to the finished Asset (Phase B, after the Operator
 *              picks the Character).
 *
 * Node names come from the verified inventory in `docs/producer-spikes-results.md` (Spikes 1-2).
 * Authoring this JSON onto the live canvas node is deferred to runtime; this committed artifact is the
 * single source of truth for what that node must contain.
 */
export function canonicalProtocol(): ProtocolDocument {
  return {
    run_points: [
      { start: "Character Variants Generator", mode: "downstream", gate: "cast" },
      { start: "Clip extractor", mode: "downstream", gate: null },
    ],
  };
}

/**
 * The canonical `Producer Protocol` artifact for the single-lane "Carrousel" Space (the News Carousel
 * Recipe, issue #81) — the rebuilt, single-lane replacement for the old multi-lane "AI News" board
 * (per-lane "Image Prompt Slide 1..7" run-points are dead; see the salvage note in the issue).
 *
 * Exactly ONE run-point: inject the 7-slide Spec into the Space's "Slides Prompts" node (the SAME node
 * this run-point starts at — a single node doubles as both the Producer's injectable prompt node and
 * the Execution Protocol's run-point, since the Space's whole downstream chain — Assistant -> List ->
 * generator -> Generated slides — fires off that one node), run it `downstream`, and finish straight
 * through to the rendered slides. No gate: the News Carousel Recipe declares zero pick-gates
 * (`recipe/registry.ts`'s `NEWS_CAROUSEL.gates`), so this is simultaneously the FIRST and FINAL leg.
 */
export function canonicalCarouselProtocol(): ProtocolDocument {
  return {
    run_points: [{ start: "Slides Prompts", mode: "downstream", gate: null }],
  };
}

/**
 * Serialize a protocol document to the exact JSON string the `Producer Protocol` node would hold.
 * Pretty-printed with a trailing newline, mirroring how the node content is authored/read.
 */
export function serializeProtocol(doc: ProtocolDocument): string {
  return JSON.stringify(doc, null, 2) + "\n";
}
