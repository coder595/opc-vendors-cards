/** Comparison key for tags: case, spaces, hyphens and underscores do not make a new tag. */
export function tagKey(tag: string): string {
  return tag
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, ' ')
}

/** The spelling to store for a typed tag: an existing tag with the same key wins. */
export function resolveTag(typed: string, existing: readonly string[]): string {
  const key = tagKey(typed)
  return existing.find((tag) => tagKey(tag) === key) ?? typed.trim().replace(/\s+/g, ' ')
}

/** Known tags not already on the vendor, narrowed by what is being typed. */
export function suggestTags(
  known: readonly string[],
  chosen: readonly string[],
  typed: string,
): string[] {
  const chosenKeys = new Set(chosen.map(tagKey))
  const filter = tagKey(typed)
  return known.filter((tag) => !chosenKeys.has(tagKey(tag)) && tagKey(tag).includes(filter))
}
