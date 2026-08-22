import { queryOptions } from '@tanstack/react-query'

import { wallpaperMediaKind, type WallpaperMediaKind } from '@/features/workbench/utils/wallpaper'
import { serverUrl } from '@/lib/client'
import { clientInstanceId, instanceHeaderName } from '@/lib/instance-id'

const DESKTOP_WALLPAPER_URL = `${serverUrl}/wallpaper`
const WALLPAPER_QUERY_GC_TIME_MS = 5 * 60_000
const WALLPAPER_QUERY_STALE_TIME_MS = 60 * 60_000

const wallpaperQueryDefaults = {
  gcTime: WALLPAPER_QUERY_GC_TIME_MS,
  refetchOnWindowFocus: false,
  retry: false,
  staleTime: WALLPAPER_QUERY_STALE_TIME_MS,
} as const

export const wallpaperQueryKeys = {
  all: ['wallpaper'] as const,
  info: () => [...wallpaperQueryKeys.all, 'info'] as const,
  media: () => [...wallpaperQueryKeys.all, 'media'] as const,
  still: () => [...wallpaperQueryKeys.all, 'still'] as const,
}

export function wallpaperInfoQueryOptions({ enabled }: { enabled: boolean }) {
  return queryOptions({
    ...wallpaperQueryDefaults,
    enabled,
    queryFn: fetchWallpaperKind,
    queryKey: wallpaperQueryKeys.info(),
  })
}

export function wallpaperMediaQueryOptions({ enabled }: { enabled: boolean }) {
  return queryOptions({
    ...wallpaperQueryDefaults,
    enabled,
    queryFn: () => fetchWallpaperBlob(DESKTOP_WALLPAPER_URL),
    queryKey: wallpaperQueryKeys.media(),
  })
}

export function wallpaperStillQueryOptions() {
  return queryOptions({
    ...wallpaperQueryDefaults,
    queryFn: () => fetchWallpaperBlob(`${DESKTOP_WALLPAPER_URL}/still`),
    queryKey: wallpaperQueryKeys.still(),
  })
}

async function fetchWallpaperKind(): Promise<WallpaperMediaKind> {
  const response = await fetchWallpaper(`${DESKTOP_WALLPAPER_URL}/info`)
  if (!response.ok) return 'image'

  const info = (await response.json()) as { contentType?: string }
  return wallpaperMediaKind(info.contentType ?? null)
}

async function fetchWallpaperBlob(url: string): Promise<Blob | null> {
  const response = await fetchWallpaper(url)
  if (!response.ok) return null

  return response.blob()
}

function fetchWallpaper(url: string): Promise<Response> {
  // StrictMode temporarily drops every observer. Cancelling here would turn one
  // shared mount fetch back into an aborted request followed by a duplicate.
  return fetch(url, { headers: { [instanceHeaderName]: clientInstanceId() } })
}
