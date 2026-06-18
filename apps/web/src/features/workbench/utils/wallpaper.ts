// Changing the wallpaper also requires regenerating
// /workbench/wallpaper-vibrancy.png, referenced by --surface-wallpaper in
// packages/ui/src/styles/globals.css.
export const WALLPAPER_URL = '/workbench/wallpaper.png'

export type WallpaperMediaKind = 'image' | 'video'

export function wallpaperMediaKind(contentType: string | null): WallpaperMediaKind {
  if (contentType?.toLowerCase().startsWith('video/')) return 'video'

  return 'image'
}

export function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError'
}
