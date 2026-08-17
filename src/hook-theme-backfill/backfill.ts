/**
 * `planBackfill` — the pure decision core of the Hook Type / Theme backfill (issue #206).
 *
 * Takes a snapshot of every committed `idea` row (`ExistingIdeaSnapshot`, what
 * `src/commands/backfill-hook-theme.ts` reads via `IdeaStore.listAllIdeas`) and the static
 * classification data (`classifications.ts`'s `BRIEF_CLASSIFICATIONS`), and decides — for EACH Idea —
 * exactly one of four outcomes, never a write itself:
 *
 * - **`toUpdate`**: the Idea's `brief` matches a `"classified"` entry, and its CURRENT `hook_type`/
 *   `theme`/provenance differ from what that entry says they should be. The orchestration shell calls
 *   `classifyIdea` (through the command surface) for each of these — the ONE write this whole ticket
 *   makes.
 * - **`alreadyCorrect`**: the Idea already carries exactly the values a `"classified"` entry says it
 *   should — a NO-OP. This is what makes the job re-runnable and honestly report "0 updated" on a second
 *   run against an already-backfilled database (issue #206's own acceptance criterion).
 * - **`reported`**: the Idea's `brief` matches a `"reported"` entry — a Brief that genuinely fits no
 *   closed vocabulary member. NEVER produces a write; this is the "report don't force" mechanism issue
 *   #206 names as the acceptance criterion that matters most.
 * - **`noEntry`**: the Idea's `brief` matches NOTHING in the classification data at all — the honest,
 *   EXPECTED outcome for the 10 headingless MundoTip Briefs (issue #219's own `unclassified` default was
 *   already correct for them; this classifier has nothing to add). Also the outcome for any genuinely
 *   unexpected Idea this ticket's own read of the data never saw — surfaced, never silently skipped.
 *
 * **Matching is by brief content hash, never by id or title** (`sha256(Buffer.from(idea.brief, "utf8"))`,
 * the SAME hashing `classifications.ts`'s own doc comment specifies) — a legacy id or title can be reused
 * or reshaped across Runs/Brands in ways a Brief's actual content is not; the content itself is the one
 * thing both the classification data and the committed row agree on unambiguously.
 *
 * Pure: no disk, no network, no clock, no database — every input is a plain in-memory value.
 */

import { createHash } from "node:crypto";

import type { HookType } from "../vocabulary/hook-type.ts";
import type { Theme } from "../vocabulary/theme.ts";
import type { ClassificationSource } from "../idea/store.ts";
import type { BriefClassificationEntry } from "./classifications.ts";

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

/** One committed `idea` row's fields this planner needs — a structural subset of
 *  `IdeaStore.IdeaRecord`, so this module has no import-time dependency on the store itself (the
 *  orchestration shell maps `IdeaRecord` -> this shape). */
export interface ExistingIdeaSnapshot {
  readonly id: string;
  readonly title: string;
  readonly brief: string;
  readonly hookType: HookType;
  readonly theme: Theme;
  readonly hookTypeSource?: ClassificationSource;
  readonly themeSource?: ClassificationSource;
}

// ---------------------------------------------------------------------------
// Outputs
// ---------------------------------------------------------------------------

/** The four fields `classifyIdea` writes — what a `toUpdate` action's `after` state is. */
export interface BackfillClassificationSnapshot {
  readonly hookType: HookType;
  readonly theme: Theme;
  readonly hookTypeSource: ClassificationSource;
  readonly themeSource: ClassificationSource;
}

/** An Idea's classification fields as they stood BEFORE this plan — `hookTypeSource`/`themeSource` are
 *  absent exactly when the Idea has never been classified before (issue #219's importer default records
 *  no provenance, because nothing was actually read). */
export interface BackfillBeforeState {
  readonly hookType: HookType;
  readonly theme: Theme;
  readonly hookTypeSource?: ClassificationSource;
  readonly themeSource?: ClassificationSource;
}

/** One Idea this plan says needs a real `classifyIdea` write — carries both `before` and `after` so the
 *  orchestration shell's report can state exactly what changed (issue #206: "the job ... reports what
 *  changed"), not just that something did. */
export interface BackfillUpdate {
  readonly ideaId: string;
  readonly title: string;
  readonly before: BackfillBeforeState;
  readonly after: BackfillClassificationSnapshot;
}

/** One Idea that already carries the desired classification — a re-run's expected no-op. */
export interface BackfillAlreadyCorrect {
  readonly ideaId: string;
  readonly title: string;
}

/** One Idea whose Brief matched a `"reported"` classification entry — a genuine vocabulary mismatch,
 *  never written. */
export interface BackfillReported {
  readonly ideaId: string;
  readonly title: string;
  readonly reason: string;
}

/** One Idea whose Brief matched NOTHING in the classification data — the 10 headingless Briefs'
 *  expected outcome, or a genuinely unexpected Idea this ticket's own read never covered. */
export interface BackfillNoEntry {
  readonly ideaId: string;
  readonly title: string;
}

export interface BackfillPlan {
  readonly toUpdate: readonly BackfillUpdate[];
  readonly alreadyCorrect: readonly BackfillAlreadyCorrect[];
  readonly reported: readonly BackfillReported[];
  readonly noEntry: readonly BackfillNoEntry[];
}

// ---------------------------------------------------------------------------
// planBackfill
// ---------------------------------------------------------------------------

function sha256(text: string): string {
  return createHash("sha256").update(Buffer.from(text, "utf8")).digest("hex");
}

function sameClassification(before: BackfillBeforeState, after: BackfillClassificationSnapshot): boolean {
  return (
    before.hookType === after.hookType &&
    before.theme === after.theme &&
    before.hookTypeSource === after.hookTypeSource &&
    before.themeSource === after.themeSource
  );
}

/** Plans the backfill: decides, for every one of `existingIdeas`, which of the four outcomes above
 *  applies. Never mutates its inputs, never performs I/O — see this module's own doc comment. */
export function planBackfill(
  existingIdeas: readonly ExistingIdeaSnapshot[],
  entries: readonly BriefClassificationEntry[],
): BackfillPlan {
  const entryByHash = new Map<string, BriefClassificationEntry>();
  for (const entry of entries) {
    entryByHash.set(entry.briefSha256, entry);
  }

  const toUpdate: BackfillUpdate[] = [];
  const alreadyCorrect: BackfillAlreadyCorrect[] = [];
  const reported: BackfillReported[] = [];
  const noEntry: BackfillNoEntry[] = [];

  for (const idea of existingIdeas) {
    const entry = entryByHash.get(sha256(idea.brief));

    if (entry === undefined) {
      noEntry.push({ ideaId: idea.id, title: idea.title });
      continue;
    }

    if (entry.kind === "reported") {
      reported.push({ ideaId: idea.id, title: idea.title, reason: entry.reason });
      continue;
    }

    const before: BackfillBeforeState = {
      hookType: idea.hookType,
      theme: idea.theme,
      ...(idea.hookTypeSource !== undefined ? { hookTypeSource: idea.hookTypeSource } : {}),
      ...(idea.themeSource !== undefined ? { themeSource: idea.themeSource } : {}),
    };
    const after: BackfillClassificationSnapshot = {
      hookType: entry.hookType,
      theme: entry.theme,
      hookTypeSource: entry.hookTypeSource,
      themeSource: entry.themeSource,
    };

    if (sameClassification(before, after)) {
      alreadyCorrect.push({ ideaId: idea.id, title: idea.title });
    } else {
      toUpdate.push({ ideaId: idea.id, title: idea.title, before, after });
    }
  }

  return { toUpdate, alreadyCorrect, reported, noEntry };
}
