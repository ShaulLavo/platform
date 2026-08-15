/**
 * `?settings=` names a category on the settings page, not a section component.
 *
 * Categories are human strings — `Keyboard shortcuts`, `Providers` — and a URL wants
 * a slug, so the two are mapped rather than assumed equal. `descriptorFor(id).category`
 * is typed as a bare `string`, so a new registry entry can invent a category nothing
 * has seen; slugging is therefore derived from the value rather than enumerated, and
 * an unknown slug resolves to null instead of throwing.
 */

export function settingsCategorySlug(category: string) {
  return category
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

export function settingsCategoryForSlug(slug: string, categories: readonly string[]) {
  const wanted = settingsCategorySlug(slug)

  return categories.find((category) => settingsCategorySlug(category) === wanted) ?? null
}
