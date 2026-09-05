export function normalizeGitRemoteUrl(value: string): string | null {
  const normalized = value
    .trim()
    .replace(/\/+$/, '')
    .replace(/\.git$/i, '')
    .toLowerCase()
  if (/^(ssh|https?|git):\/\//.test(normalized)) return normalizeUrl(normalized)

  if (/^[a-z][a-z0-9+.-]*:\/\//.test(normalized) || /^[a-z]:[\\/]/.test(normalized)) return null

  const match = /^(?:[^@/\s]+@)?([^:/\s]+):([^\s]+)$/.exec(normalized)
  if (!match?.[1] || !match[2]) return null

  return hostAndPath(match[1], match[2])
}

function normalizeUrl(value: string): string | null {
  try {
    const url = new URL(value)
    return hostAndPath(url.hostname, url.pathname)
  } catch {
    return null
  }
}

function hostAndPath(host: string, value: string): string | null {
  const path = value
    .split('/')
    .filter(Boolean)
    .join('/')
    .replace(/\.git$/i, '')
  if (!host || !path) return null
  if (path.split('/').some((segment) => segment === '.' || segment === '..')) return null

  return `${host}/${path}`
}
