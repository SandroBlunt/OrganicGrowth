/**
 * `deriveBrandDisplayFields` — a Brand's `name`/`timezone` for `brand` row creation (issue #204).
 *
 * Neither real `brand-profile.yaml` carries a canonical top-level `name`/`timezone` field (verified
 * against both). Straw Motion's DOES carry a real, Operator-authored Zoho Social Brand config
 * (`src/production-spec/brand-profile.ts`'s `loadZohoConfig`/`zohoConfigFrom`, issue #143) whose first
 * entry names both, for a real reason (the exact display name and IANA clock Zoho's bulk-scheduling
 * export needs) — the best available real source, reused here rather than re-derived. MundoTip has no
 * `zoho` block at all (not yet wired for Schedule Batch), so it always falls back.
 *
 * The fallback — a title-cased slug for `name`, `"UTC"` for `timezone` — is a documented default, not a
 * guess dressed up as data: no field anywhere in this repo's real data names MundoTip's exact
 * display-name capitalization ("MundoTip") or its Operator's real clock, so inventing either would be
 * indistinguishable from a real value. This is called out explicitly in this ticket's handoff.
 *
 * Pure: no disk, no network, no clock.
 */

import type { ZohoConfigLookup } from "../production-spec/brand-profile.ts";

/** The two fields `createBrand` needs beyond what the caller already knows (slug, mediaRoot). */
export interface BrandDisplayFields {
  readonly name: string;
  readonly timezone: string;
}

/** Title-cases a hyphenated slug (`"straw-motion"` -> `"Straw Motion"`) — the documented fallback when
 *  no real display name is available. */
function titleCaseSlug(slug: string): string {
  return slug
    .split("-")
    .filter((part) => part.length > 0)
    .map((part) => part[0]!.toUpperCase() + part.slice(1))
    .join(" ");
}

const FALLBACK_TIMEZONE = "UTC";

/**
 * Derives `{ name, timezone }` for `slug`, preferring the first configured Zoho Social Brand's own
 * `name`/`timezone` (`zohoLookup`, from `loadZohoConfig`/`zohoConfigFrom`) when present and non-blank,
 * falling back to a title-cased slug / `"UTC"` otherwise. Never throws.
 */
export function deriveBrandDisplayFields(zohoLookup: ZohoConfigLookup, slug: string): BrandDisplayFields {
  if (zohoLookup.configured && zohoLookup.zohoBrands.length > 0) {
    const first = zohoLookup.zohoBrands[0]!;
    const name = first.name.trim().length > 0 ? first.name.trim() : titleCaseSlug(slug);
    const timezone = first.timezone.trim().length > 0 ? first.timezone.trim() : FALLBACK_TIMEZONE;
    return { name, timezone };
  }
  return { name: titleCaseSlug(slug), timezone: FALLBACK_TIMEZONE };
}
