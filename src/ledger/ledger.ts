/**
 * Ledger reader + minimal status writer for `data/ledger.json`.
 *
 * The ledger is the source of truth (always-rules #7, ADR-0002). The original reader projects each Idea
 * to `{ id, status }` to enforce that only `accepted` Ideas enter the Production Queue. This slice adds
 * the queue→ledger *status reflection* (ADR-0004): a pure mapping from a completed queue transition to
 * the implied Idea status, a pure status set, and a thin write shell that applies it to the on-disk
 * record. The status is *derived from the queue transition, never inferred* from anything else, and the
 * ledger stays canonical. Defensive on parse: unknown shapes never crash a Run.
 */

import { readJsonFile, writeFileAtomic } from "../fs/safe-io.ts";
import type { JobStatus, QueueJob } from "../production-queue/queue.ts";

/** The Idea lifecycle states the ledger uses. */
export type IdeaStatus =
  | "suggested"
  | "accepted"
  | "casting"
  | "produced"
  | "posted"
  | "tracking"
  | "scored"
  | "rejected";

/** The subset of an Idea record this slice needs. */
export interface LedgerIdea {
  readonly id: string;
  readonly status: string;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** True when `err` is a Node `ENOENT` (no such file) error. */
function isEnoent(err: unknown): boolean {
  return isObject(err) && (err as { code?: string }).code === "ENOENT";
}

/**
 * Read + parse a Brand's ledger JSON. A *parse* failure is already named by `readJsonFile`; a
 * *missing* ledger is turned into a clear "unknown Brand" error (never a raw ENOENT stack) when the
 * caller names the Brand — so `/report acme` on a Brand that does not exist explains itself. The
 * ledger stays the source of truth (always-rules #7).
 *
 * @param path   the ledger path (required — no ambient/brand-scoped default)
 * @param brand  the Brand slug, used only to shape the not-found message; omit when unknown
 */
async function readLedgerJson(path: string, brand?: string): Promise<unknown> {
  try {
    return await readJsonFile(path);
  } catch (err: unknown) {
    if (isEnoent(err)) {
      const who = brand === undefined ? `no ledger found at ${path}` : `unknown Brand "${brand}"`;
      throw new Error(`${who} (run /queue --all to list Brands).`);
    }
    throw err;
  }
}

/**
 * Read the ledger's Idea records (defensive: missing/garbled fields are skipped). The path is
 * required — there is no brand-scoped default. Pass `brand` so a missing ledger fails as
 * "unknown Brand <slug>" rather than a raw ENOENT.
 */
export async function loadIdeas(path: string, brand?: string): Promise<LedgerIdea[]> {
  const raw: unknown = await readLedgerJson(path, brand);
  if (!isObject(raw) || !Array.isArray(raw.ideas)) return [];
  return raw.ideas
    .filter(isObject)
    .filter((r) => typeof r.id === "string" && typeof r.status === "string")
    .map((r) => ({ id: r.id as string, status: r.status as string }));
}

/** Find one Idea by id, or null if absent. */
export function findIdea(ideas: readonly LedgerIdea[], ideaId: string): LedgerIdea | null {
  return ideas.find((i) => i.id === ideaId) ?? null;
}

/**
 * Read one Idea's recorded `cast` candidates from the ledger (the Phase-A Cast the Operator picks from),
 * or `null` when the Idea is absent or has no recorded Cast. Defensive: malformed cast records are
 * skipped, so a garbled ledger never crashes `/pick-cast`. The ledger stays the source of truth.
 */
export async function loadIdeaCast(
  ideaId: string,
  path: string,
): Promise<LedgerCastCandidate[] | null> {
  const raw: unknown = await readJsonFile(path);
  if (!isObject(raw) || !Array.isArray(raw.ideas)) return null;
  const record = raw.ideas.find((r) => isObject(r) && r.id === ideaId);
  if (!isObject(record)) return null;
  if (!Array.isArray(record.cast)) return null;
  return record.cast
    .filter(isObject)
    .filter((c) => typeof c.identifier === "string" && typeof c.url === "string")
    .map((c) => ({ identifier: c.identifier as string, url: c.url as string }));
}

// --- Report projection (issue #9: /report surfaces the whole pipeline at a glance) -----------------

/**
 * The Idea fields `/report` needs to show the whole pipeline at a glance (issue #9). Read-only:
 * `/report` never mutates the ledger. `fit_score` is the **predicted** Fit Score (pre-publication);
 * `performance_score` is the **measured** Performance Score (post-publication, relative to the Channel
 * baseline) — they are kept as SEPARATE fields here so the renderer can never conflate the two
 * (always-rules #3/#4). Either may be `null` (a Fit Score is absent on a malformed Idea; a Performance
 * Score is `null` until `/track-performance` measures it).
 */
export interface ReportIdea {
  readonly id: string;
  readonly title: string;
  readonly status: string;
  /** Predicted Fit Score (0–1), or null if absent. NEVER the measured number. */
  readonly fit_score: number | null;
  /** Measured Performance Score (0–1, relative to the Channel baseline), or null until tracked. */
  readonly performance_score: number | null;
  /** The logged Post URL (explicit attribution), or null if not yet published. */
  readonly post_url: string | null;
}

/** The Channel's own performance baseline — what a Performance Score is measured RELATIVE to. */
export interface ReportBaseline {
  /** ISO-8601 timestamp of the last `/track-performance`, or null before the first one. */
  readonly updated_at: string | null;
}

/** The read-only projection `/report` renders: the run's Ideas plus the Channel baseline. */
export interface ReportData {
  readonly ideas: readonly ReportIdea[];
  readonly baseline: ReportBaseline;
}

function asNumberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asStringOrNull(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

/**
 * Read the ledger into the read-only `/report` projection (defensive: missing/garbled fields degrade to
 * sensible defaults rather than crashing a Run — always-rules #8). Keeps the **predicted** `fit_score`
 * and the **measured** `performance_score` as distinct fields so `/report` never presents one as the
 * other. A record missing an `id` is skipped (we never invent a record); a missing `title` degrades to
 * the id so the row is still identifiable.
 */
export async function loadReport(path: string, brand?: string): Promise<ReportData> {
  const raw: unknown = await readLedgerJson(path, brand);
  if (!isObject(raw)) return { ideas: [], baseline: { updated_at: null } };

  const ideasRaw = Array.isArray(raw.ideas) ? raw.ideas : [];
  const ideas: ReportIdea[] = ideasRaw
    .filter(isObject)
    .filter((r) => typeof r.id === "string")
    .map((r) => {
      const id = r.id as string;
      return {
        id,
        title: typeof r.title === "string" ? r.title : id,
        status: typeof r.status === "string" ? r.status : "unknown",
        fit_score: asNumberOrNull(r.fit_score),
        performance_score: asNumberOrNull(r.performance_score),
        post_url: asStringOrNull(r.post_url),
      };
    });

  const baselineRaw = isObject(raw.baseline) ? raw.baseline : {};
  return { ideas, baseline: { updated_at: asStringOrNull(baselineRaw.updated_at) } };
}

// --- Queue → ledger status reflection (ADR-0004) ---------------------------------------------------

/**
 * The implied Idea status for a completed queue transition, or `null` when the transition implies no
 * ledger change. Pure. There are exactly TWO reflection points (CLAUDE.md pipeline, ADR-0004):
 *
 *   • a `cast` job reaching `awaiting_cast` (its Cast gate)  ⇒  `accepted → casting`
 *     (the Idea is "casting" while awaiting the Operator's Character pick), and
 *   • a `render` job reaching `done`                          ⇒  `casting → produced`.
 *
 * Every other transition (a job entering `running`, any job `failed`, a `cast` job reaching `done`, a
 * `render` job reaching `awaiting_cast`) implies NO ledger change and returns `null`. This is the single
 * place the queue's vocabulary is mapped to the ledger's — the status is derived here, never inferred.
 *
 * @param job  the job being transitioned (its `phase` selects the reflection)
 * @param to   the status the job is transitioning to
 */
export function ledgerStatusForTransition(job: QueueJob, to: JobStatus): IdeaStatus | null {
  if (job.phase === "cast" && to === "awaiting_cast") return "casting";
  if (job.phase === "render" && to === "done") return "produced";
  return null;
}

/**
 * Return a NEW ideas array with `ideaId`'s status set to `status`. Pure: never mutates the input array
 * or its records. An unknown `ideaId` returns the array unchanged (the ledger stays canonical — we never
 * invent a record).
 */
export function applyIdeaStatus(
  ideas: readonly LedgerIdea[],
  ideaId: string,
  status: IdeaStatus,
): LedgerIdea[] {
  return ideas.map((idea) => (idea.id === ideaId ? { ...idea, status } : idea));
}

/** Options for the thin ledger-status write shell. */
export interface WriteIdeaStatusOptions {
  /** REQUIRED: the Brand's ledger path. There is no ambient/brand-scoped default. */
  readonly ledgerPath: string;
}

/**
 * Thin write shell: load the full ledger, set one Idea's `status`, and save — so a completed queue
 * transition keeps `data/ledger.json` in step. Preserves the file's other fields (baseline, the Idea's
 * own metadata) by editing the raw record in place rather than rewriting from the projected view. The
 * ledger remains the source of truth; nothing else is changed. An unknown `ideaId` leaves the file
 * untouched.
 */
export async function writeIdeaStatus(
  ideaId: string,
  status: IdeaStatus,
  options: WriteIdeaStatusOptions,
): Promise<void> {
  const path = options.ledgerPath;
  const raw: unknown = await readJsonFile(path);
  if (!isObject(raw) || !Array.isArray(raw.ideas)) return;

  let changed = false;
  const ideas = raw.ideas.map((record) => {
    if (isObject(record) && record.id === ideaId) {
      changed = true;
      return { ...record, status };
    }
    return record;
  });
  if (!changed) return;

  const next = { ...raw, ideas };
  await writeFileAtomic(path, JSON.stringify(next, null, 2) + "\n");
}

// --- Asset write (ADR-0003 Phase B: the Idea gains `character` / `asset_url` / `produced_at`) -------

/**
 * The finished-Asset fields ADR-0003 Phase B adds to the Idea record: the chosen `character` (a Cast
 * candidate identifier), the rendered `asset_url`, and `produced_at` (an ISO-8601 timestamp). These are
 * written from the render completion alongside the `casting → produced` transition, never inferred.
 */
export interface LedgerAsset {
  readonly character: string;
  readonly asset_url: string;
  /** ISO-8601 timestamp, INJECTED by the caller (never read from the clock here). */
  readonly produced_at: string;
}

/** The subset of an Idea record including the Producer's Phase-B Asset fields. */
export interface LedgerIdeaWithAsset extends LedgerIdea {
  readonly character?: string;
  readonly asset_url?: string;
  readonly produced_at?: string;
}

/**
 * Return a NEW ideas array with `ideaId`'s `character` / `asset_url` / `produced_at` set to the finished
 * Asset. Pure: never mutates the input array or its records. An unknown `ideaId` returns the array
 * unchanged (the ledger stays canonical — we never invent a record). The Asset is recorded from the
 * Phase-B render completion, never inferred; `produced_at` is the injected timestamp the caller supplies.
 */
export function applyIdeaAsset(
  ideas: readonly LedgerIdeaWithAsset[],
  ideaId: string,
  asset: LedgerAsset,
): LedgerIdeaWithAsset[] {
  return ideas.map((idea) =>
    idea.id === ideaId
      ? {
          ...idea,
          character: asset.character,
          asset_url: asset.asset_url,
          produced_at: asset.produced_at,
        }
      : idea,
  );
}

/**
 * Thin write shell: load the full ledger, set one Idea's `character` / `asset_url` / `produced_at` to the
 * finished Asset, and save — so Phase B's Asset is recorded on disk (ADR-0003). Preserves the file's
 * other fields (including the prior Phase-A `cast`, `post_url`, the Idea's metadata) by editing the raw
 * record in place. The ledger remains the source of truth; an unknown `ideaId` leaves the file untouched.
 * Pair this with `writeIdeaStatus(ideaId, "produced")` (whose status is derived from the queue's
 * `render → done` transition via `ledgerStatusForTransition`) so the `casting → produced` transition and
 * the Asset are written together.
 */
export async function writeIdeaAsset(
  ideaId: string,
  asset: LedgerAsset,
  options: WriteIdeaStatusOptions,
): Promise<void> {
  const path = options.ledgerPath;
  const raw: unknown = await readJsonFile(path);
  if (!isObject(raw) || !Array.isArray(raw.ideas)) return;

  let changed = false;
  const ideas = raw.ideas.map((record) => {
    if (isObject(record) && record.id === ideaId) {
      changed = true;
      return {
        ...record,
        character: asset.character,
        asset_url: asset.asset_url,
        produced_at: asset.produced_at,
      };
    }
    return record;
  });
  if (!changed) return;

  const next = { ...raw, ideas };
  await writeFileAtomic(path, JSON.stringify(next, null, 2) + "\n");
}

// --- Cast write (ADR-0003: the ledger Idea gains a `cast` field) ------------------------------------

/**
 * One Cast candidate as recorded in the ledger: the creation identifier and its viewable image URL.
 * This is what the Operator judges at the Cast gate; ADR-0003 adds `cast` to the Idea record alongside
 * the `accepted → casting` transition.
 */
export interface LedgerCastCandidate {
  readonly identifier: string;
  readonly url: string;
}

/** The subset of an Idea record including the Producer's `cast` field. */
export interface LedgerIdeaWithCast extends LedgerIdea {
  readonly cast?: readonly LedgerCastCandidate[];
}

/**
 * Return a NEW ideas array with `ideaId`'s `cast` field set to the given candidates. Pure: never mutates
 * the input array or its records. An unknown `ideaId` returns the array unchanged (the ledger stays
 * canonical — we never invent a record). The Cast is recorded from the Phase-A completion, never inferred.
 */
export function applyIdeaCast(
  ideas: readonly LedgerIdeaWithCast[],
  ideaId: string,
  cast: readonly LedgerCastCandidate[],
): LedgerIdeaWithCast[] {
  return ideas.map((idea) =>
    idea.id === ideaId ? { ...idea, cast: cast.map((c) => ({ ...c })) } : idea,
  );
}

/**
 * Thin write shell: load the full ledger, set one Idea's `cast` field to the candidate Cast
 * identifiers/URLs, and save — so Phase A's Cast is recorded on disk (ADR-0003). Preserves the file's
 * other fields by editing the raw record in place. The ledger remains the source of truth; an unknown
 * `ideaId` leaves the file untouched. Pair this with `writeIdeaStatus(ideaId, "casting")` so the
 * `accepted → casting` transition and the Cast are written together.
 */
export async function writeIdeaCast(
  ideaId: string,
  cast: readonly LedgerCastCandidate[],
  options: WriteIdeaStatusOptions,
): Promise<void> {
  const path = options.ledgerPath;
  const raw: unknown = await readJsonFile(path);
  if (!isObject(raw) || !Array.isArray(raw.ideas)) return;

  let changed = false;
  const ideas = raw.ideas.map((record) => {
    if (isObject(record) && record.id === ideaId) {
      changed = true;
      return { ...record, cast: cast.map((c) => ({ ...c })) };
    }
    return record;
  });
  if (!changed) return;

  const next = { ...raw, ideas };
  await writeFileAtomic(path, JSON.stringify(next, null, 2) + "\n");
}
