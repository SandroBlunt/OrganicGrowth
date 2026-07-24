/**
 * LinkedIn @mention insertion — issue #130 (epic #120).
 *
 * Resolves every company/product named in a Recipe's own STRUCTURED companies data (never free prose —
 * `CopyInput.companies`, the Character Explainer with Cast Recipe's whole-Asset grain, issue #125; and
 * `CopySlideBeat.companies`, the News Carousel Recipe's per-slide grain, PR #122) through issue #126's
 * committed LinkedIn Handle Lookup (`src/linkedin-handle/store.ts`'s `resolveLinkedInHandle`), then
 * weaves the result into a drafted LinkedIn caption: the literal `@Name` text (the plain company/product
 * name, never the raw handle slug) for every name the lookup resolves — the exact text the Operator
 * selects from LinkedIn's own compose-box dropdown when typing, since OrganicGrowth can never embed a
 * functioning tag itself (only a human, picking from LinkedIn's own UI at typing time, creates a real
 * one) — and the PLAIN name, flagged as unresolved, for every name it doesn't. Grounded, never invented:
 * only names already present in the Spec's own structured companies data are ever considered (mirrors PR
 * #122's "companies-cited" rule; always-rule 8) — this module never scans a caption's free prose for
 * company names.
 *
 * Split, mirroring `inject.ts`/`../linkedin-handle/store.ts`'s own pure-logic/I-O split:
 *   - `companiesFromCopyInput`, `buildLinkedInMentionResolutions`, `injectLinkedInMentions`,
 *     `unresolvedMentionNames` are PURE — no I/O, no clock, no network, fully deterministic given their
 *     inputs.
 *   - `weaveLinkedInMentions` is the thin async SHELL that resolves each company against the real,
 *     committed lookup file (`resolveLinkedInHandle`) and hands the result to the pure functions above.
 *     Zero companies short-circuits before any I/O at all — the caption is returned byte-for-byte
 *     unchanged, matching issue #129's baseline LinkedIn variant exactly when there's nothing to mention.
 *
 * `injectLinkedInMentions` APPENDS a mention it can't already find in the caption (case-insensitive
 * substring match) rather than trying to rewrite the drafter's own prose — mirroring `inject.ts`'s
 * `injectRequiredCta` dedupe-and-append pattern exactly, and guaranteeing every Spec-recorded name is
 * genuinely named somewhere in the composed caption regardless of what a fake/deterministic drafter (or
 * the real `write-social-copy` Skill) happened to write on its own.
 */

import { resolveLinkedInHandle, DEFAULT_LINKEDIN_HANDLES_PATH } from "../linkedin-handle/store.ts";
import type { CopyInput } from "./draft.ts";

// ---------------------------------------------------------------------------
// companiesFromCopyInput — the ONE place a CopyInput's structured companies data is gathered
// ---------------------------------------------------------------------------

/**
 * Gather every company/product named in `input`'s STRUCTURED companies data — `input.companies` (the
 * Character Explainer with Cast Recipe's whole-Asset grain, issue #125) plus every
 * `input.slideNarrative[].companies` beat (the News Carousel Recipe's per-slide grain, PR #122) — in
 * that order, deduped case-insensitively (the FIRST-seen casing wins). Never reads free prose (`title`/
 * `angle`/`mediaContext`) — only the Spec's own, already-verified companies fields (grounded, never
 * invented). Pure, deterministic, never mutates its input.
 */
export function companiesFromCopyInput(input: CopyInput): readonly string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const consider = (name: string): void => {
    const trimmed = name.trim();
    if (trimmed.length === 0) return;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push(trimmed);
  };
  for (const name of input.companies ?? []) consider(name);
  for (const beat of input.slideNarrative ?? []) {
    for (const name of beat.companies ?? []) consider(name);
  }
  return out;
}

// ---------------------------------------------------------------------------
// LinkedInMentionResolution — one company's resolved mention text
// ---------------------------------------------------------------------------

/** One company/product's resolved LinkedIn mention: the literal text to weave into the caption. */
export interface LinkedInMentionResolution {
  /** The company/product's name, exactly as recorded in the Spec's own companies data. */
  readonly name: string;
  /** The literal text to weave into the caption — `@Name` when issue #126's lookup resolves a handle
   *  (the plain name string, never the raw handle slug), or the plain `name` unchanged when it doesn't. */
  readonly mention: string;
  /** Whether issue #126's lookup resolved a handle for `name`. */
  readonly resolved: boolean;
}

/**
 * Build one `LinkedInMentionResolution` per entry of `companies`, from an already-resolved
 * `name -> handle | null` map (a missing key is treated the same as an explicit `null` — never
 * fabricates a resolution for a name the caller didn't look up). Pure — takes the resolution map as
 * data, no I/O of its own.
 */
export function buildLinkedInMentionResolutions(
  companies: readonly string[],
  handles: ReadonlyMap<string, string | null>,
): readonly LinkedInMentionResolution[] {
  return companies.map((name) => {
    const handle = handles.get(name) ?? null;
    return handle !== null
      ? { name, mention: `@${name}`, resolved: true }
      : { name, mention: name, resolved: false };
  });
}

// ---------------------------------------------------------------------------
// injectLinkedInMentions — deterministic append-if-missing, mirrors inject.ts
// ---------------------------------------------------------------------------

/**
 * Weave every resolution's mention text into `caption`. A resolution whose `mention` (case-
 * insensitively) already appears in `caption` is left alone — never duplicated (mirrors `inject.ts`'s
 * `injectRequiredCta` dedupe-on-already-present pattern). Every other resolution is appended, in order,
 * as ONE trailing sentence naming the still-missing companies/products. `resolutions.length === 0`
 * returns `caption` COMPLETELY UNCHANGED — no trailing artifact when there is nothing to mention (issue
 * #130 AC4: zero companies matches #129's baseline LinkedIn variant byte-for-byte).
 */
export function injectLinkedInMentions(
  caption: string,
  resolutions: readonly LinkedInMentionResolution[],
): string {
  if (resolutions.length === 0) return caption;
  const lower = caption.toLowerCase();
  const missing = resolutions.filter((r) => !lower.includes(r.mention.toLowerCase()));
  if (missing.length === 0) return caption;

  const trimmed = caption.trimEnd();
  const tail = `Mentions: ${missing.map((r) => r.mention).join(", ")}.`;
  return trimmed.length > 0 ? `${trimmed} ${tail}` : tail;
}

// ---------------------------------------------------------------------------
// unresolvedMentionNames — the Operator-review flag list
// ---------------------------------------------------------------------------

/** The plain names among `resolutions` issue #126's lookup had no committed handle for — flagged for
 *  Operator review (issue #130 AC2), never silently dropped. */
export function unresolvedMentionNames(
  resolutions: readonly LinkedInMentionResolution[],
): readonly string[] {
  return resolutions.filter((r) => !r.resolved).map((r) => r.name);
}

// ---------------------------------------------------------------------------
// weaveLinkedInMentions — the thin async shell
// ---------------------------------------------------------------------------

/** `weaveLinkedInMentions`'s result: the (possibly mention-woven) caption, plus every company/product
 *  name that had no committed handle. */
export interface WeaveLinkedInMentionsResult {
  readonly caption: string;
  readonly unresolvedMentions: readonly string[];
}

/**
 * Resolve every company/product named in `input`'s structured companies data
 * (`companiesFromCopyInput`) against issue #126's committed LinkedIn Handle Lookup, weave the result
 * into `caption` (`injectLinkedInMentions`), and report which names (if any) had no committed handle
 * (`unresolvedMentionNames`). Zero companies short-circuits BEFORE any I/O and returns `caption`
 * byte-for-byte unchanged.
 */
export async function weaveLinkedInMentions(
  caption: string,
  input: CopyInput,
  linkedInHandlesPath: string = DEFAULT_LINKEDIN_HANDLES_PATH,
): Promise<WeaveLinkedInMentionsResult> {
  const companies = companiesFromCopyInput(input);
  if (companies.length === 0) return { caption, unresolvedMentions: [] };

  const handles = new Map<string, string | null>();
  await Promise.all(
    companies.map(async (name) => {
      handles.set(name, await resolveLinkedInHandle(name, linkedInHandlesPath));
    }),
  );

  const resolutions = buildLinkedInMentionResolutions(companies, handles);
  return {
    caption: injectLinkedInMentions(caption, resolutions),
    unresolvedMentions: unresolvedMentionNames(resolutions),
  };
}
