import type { VscodeThemeRegistration } from '@singapor/core/shiki'

const FNV_OFFSET_BASIS = 0x811c9dc5
const FNV_PRIME = 0x01000193

/** Stable FNV-1a fingerprint for logs and semantic subscription comparisons. */
export function shikiThemeContentHash(
  themeId: string,
  registration?: VscodeThemeRegistration,
): string {
  const content = registration ? JSON.stringify(registration) : `name:${themeId}`
  let hash = FNV_OFFSET_BASIS

  for (let index = 0; index < content.length; index += 1) {
    hash ^= content.charCodeAt(index)
    hash = Math.imul(hash, FNV_PRIME)
  }

  return (hash >>> 0).toString(16).padStart(8, '0')
}
