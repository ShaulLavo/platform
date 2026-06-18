import { useEffect, useState } from 'react'

import { cn } from '@workspace/ui/lib/utils'

import {
  isAbortError,
  WALLPAPER_URL,
  wallpaperMediaKind,
  type WallpaperMediaKind,
} from '@/features/workbench/utils/wallpaper'
import { serverUrl } from '@/lib/client'
import { clientInstanceId, instanceHeaderName } from '@/lib/instance-id'

// The server serves the host's real macOS wallpaper at /wallpaper; animated video
// sources stay animated. crossorigin makes it a CORS request that carries an
// Origin past the server auth guard. Falls back to the shipped image only if the
// server can't read one (non-macOS, denied).
const DESKTOP_WALLPAPER_URL = `${serverUrl}/wallpaper`
const WALLPAPER_INFO_URL = `${DESKTOP_WALLPAPER_URL}/info`
const WALLPAPER_STILL_URL = `${DESKTOP_WALLPAPER_URL}/still`
const wallpaperClassName = 'pointer-events-none absolute inset-0 z-0 h-full w-full object-cover'

export function Wallpaper({ className }: { readonly className?: string }) {
  const [stillSrc, setStillSrc] = useState(WALLPAPER_STILL_URL)
  const [videoReady, setVideoReady] = useState(false)
  const [videoSrc, setVideoSrc] = useState<string | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    void resolveWallpaperKind(controller.signal)
      .then((kind) => {
        if (kind !== 'video') return

        setVideoSrc(DESKTOP_WALLPAPER_URL)
      })
      .catch((error: unknown) => {
        if (isAbortError(error)) return
      })

    return () => controller.abort()
  }, [])

  return (
    <>
      <img
        alt=''
        aria-hidden='true'
        className={cn(wallpaperClassName, className)}
        crossOrigin='anonymous'
        data-workbench-wallpaper={videoSrc ? undefined : ''}
        data-workbench-wallpaper-layer='still'
        decoding='async'
        fetchPriority='high'
        onError={() => setStillSrc(WALLPAPER_URL)}
        src={stillSrc}
      />
      {videoSrc ? (
        <video
          aria-hidden='true'
          autoPlay
          className={cn(wallpaperClassName, videoReady ? 'opacity-100' : 'opacity-0', className)}
          crossOrigin='anonymous'
          data-workbench-wallpaper=''
          data-workbench-wallpaper-layer='video'
          loop
          muted
          onError={() => setVideoSrc(null)}
          onLoadedData={() => setVideoReady(true)}
          playsInline
          preload='auto'
          src={videoSrc}
        />
      ) : null}
    </>
  )
}

async function resolveWallpaperKind(signal: AbortSignal): Promise<WallpaperMediaKind> {
  const response = await fetch(WALLPAPER_INFO_URL, {
    headers: { [instanceHeaderName]: clientInstanceId() },
    signal,
  })
  if (!response.ok) return 'image'

  const info = (await response.json()) as { contentType?: string }
  return wallpaperMediaKind(info.contentType ?? null)
}
