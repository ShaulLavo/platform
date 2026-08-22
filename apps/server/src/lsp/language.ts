import path from 'node:path'

export function fileExtension(filePath: string) {
  const basename = path.basename(filePath).toLowerCase()
  if (basename === 'dockerfile') return 'Dockerfile'

  return path.extname(filePath)
}

export function fileUriForPath(filePath: string): string {
  const normalized = filePath.replace(/^\/+/, '')
  return `file:///${normalized.split('/').map(encodeURIComponent).join('/')}`
}
