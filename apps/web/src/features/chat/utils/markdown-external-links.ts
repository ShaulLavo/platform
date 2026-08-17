/**
 * A link out of the transcript is the one thing in a message the app cannot
 * verify, so its host is surfaced rather than hidden behind the anchor text.
 */

export function externalLinkHost(href: string | undefined) {
  if (!href) return null

  try {
    const url = new URL(href)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null

    return url.hostname || null
  } catch {
    return null
  }
}

export function faviconUrlForHost(host: string) {
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=32`
}
