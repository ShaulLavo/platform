export function basename(path: string) {
  const parts = path.split("/").filter(Boolean)
  return parts.at(-1) ?? "Root"
}

export function displayPath(path: string) {
  if (!path) return "/"

  return `/${path}`
}

export function formatSize(size: number) {
  if (size === 0) return "0 B"

  const units = ["B", "KB", "MB", "GB"]
  const exponent = Math.min(Math.floor(Math.log(size) / Math.log(1024)), 3)
  const value = size / 1024 ** exponent
  return `${value.toFixed(value >= 10 || exponent === 0 ? 0 : 1)} ${units[exponent]}`
}

export function toTreePath(path: string, rootPath: string) {
  if (path === rootPath) return basename(path)
  if (!rootPath) return path
  if (!path.startsWith(`${rootPath}/`)) return path

  return path.slice(rootPath.length + 1)
}

export function canonicalTreePath(path: string) {
  return path.replace(/\/+$/u, "")
}
