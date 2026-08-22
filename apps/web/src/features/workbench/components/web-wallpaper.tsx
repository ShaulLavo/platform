import { useQuery } from '@tanstack/react-query'
import { useRef, useState } from 'react'

import { cn } from '@workspace/ui/lib/utils'

import { useMediaBlobUrl } from '@/features/workbench/hooks/use-media-blob-url'
import { useWallpaperPlayback } from '@/features/workbench/hooks/use-wallpaper-playback'
import { prefersReducedMotion, WALLPAPER_URL } from '@/features/workbench/utils/wallpaper'
import {
  wallpaperInfoQueryOptions,
  wallpaperMediaQueryOptions,
  wallpaperStillQueryOptions,
} from '@/features/workbench/utils/wallpaper-query'

const wallpaperClassName = 'pointer-events-none absolute inset-0 z-0 h-full w-full object-cover'

// Browser-only wallpaper: a page in a tab has nothing behind it, so the backdrop
// has to be drawn here. The still image carries the look; the video is the
// optional animated upgrade and is the expensive half, so it stays gated.
export function WebWallpaper({ className }: { readonly className?: string }) {
  const motionAllowed = !prefersReducedMotion()
  const info = useQuery(wallpaperInfoQueryOptions({ enabled: motionAllowed }))
  const stillMedia = useQuery(wallpaperStillQueryOptions())
  const videoMedia = useQuery(
    wallpaperMediaQueryOptions({ enabled: motionAllowed && info.data === 'video' }),
  )
  const [stillFailed, setStillFailed] = useState(false)
  const [videoFailed, setVideoFailed] = useState(false)
  const [videoReady, setVideoReady] = useState(false)
  const stillRef = useRef<HTMLImageElement | null>(null)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const showVideo = !videoFailed && Boolean(videoMedia.data)

  useMediaBlobUrl(stillFailed ? null : stillMedia.data, stillRef, WALLPAPER_URL)
  useMediaBlobUrl(videoFailed ? null : videoMedia.data, videoRef)
  useWallpaperPlayback(videoRef)

  return (
    <>
      <img
        alt=''
        aria-hidden='true'
        className={cn(wallpaperClassName, className)}
        crossOrigin='anonymous'
        data-workbench-wallpaper={showVideo ? undefined : ''}
        data-workbench-wallpaper-layer='still'
        decoding='async'
        fetchPriority='high'
        onError={() => setStillFailed(true)}
        ref={stillRef}
        src={WALLPAPER_URL}
      />
      {showVideo ? (
        <video
          aria-hidden='true'
          autoPlay
          className={cn(wallpaperClassName, videoReady ? 'opacity-100' : 'opacity-0', className)}
          crossOrigin='anonymous'
          data-workbench-wallpaper=''
          data-workbench-wallpaper-layer='video'
          loop
          muted
          onError={() => setVideoFailed(true)}
          onLoadedData={() => setVideoReady(true)}
          playsInline
          preload='auto'
          ref={videoRef}
        />
      ) : null}
    </>
  )
}
