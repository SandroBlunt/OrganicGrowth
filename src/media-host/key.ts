/**
 * The Media Host port's one shared invariant (issue #144): every hosted key — and therefore every
 * public URL the port returns — ends in a lowercase `.jpg`. This is Zoho's stated bulk-scheduler media
 * rule (parent #140, PRD user story 5): a link that doesn't end `.jpg` is not guaranteed fetchable by
 * Zoho's uploader. Both `FakeMediaHost` and the live AWS-CLI adapter call this SAME function, so the
 * rule can never drift between the fake and the real implementation.
 */

/** Throws unless `key` ends in a lowercase `.jpg` extension. Pure; never touches a file or the network. */
export function assertJpgKey(key: string): void {
  if (!key.endsWith(".jpg")) {
    throw new Error(`Media Host key must end in ".jpg" (got "${key}")`);
  }
}
