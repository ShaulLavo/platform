import { Elysia } from 'elysia'

import { observeRequestOperation } from '../observability'
import {
  readDesktopWallpaperInfo,
  readDesktopWallpaperMedia,
  readDesktopWallpaperStillMedia,
  type DesktopWallpaperInfo,
  type DesktopWallpaperMedia,
} from './service'

const WALLPAPER_CACHE_CONTROL = 'public, max-age=60'

export type WallpaperService = {
  readDesktopWallpaperInfo(): Promise<DesktopWallpaperInfo | null>
  readDesktopWallpaperMedia(): Promise<DesktopWallpaperMedia | null>
  readDesktopWallpaperStillMedia(): Promise<DesktopWallpaperMedia | null>
}

const defaultWallpaperService: WallpaperService = {
  readDesktopWallpaperInfo,
  readDesktopWallpaperMedia,
  readDesktopWallpaperStillMedia,
}

// Serves the host machine's current desktop wallpaper as browser-renderable
// media. Animated video sources stay animated. The web app chooses <video> or
// <img> from /wallpaper/info and uses crossorigin media requests so an Origin
// reaches the auth guard. 404s off macOS or on failure so the client falls back
// to the shipped image.
export function wallpaperRoutes(service: WallpaperService = defaultWallpaperService) {
  return new Elysia({ name: 'wallpaper-routes' })
    .get('/wallpaper/info', async ({ set }) => {
      const info = await observeRequestOperation(
        { area: 'wallpaper', operation: 'info' },
        () => service.readDesktopWallpaperInfo(),
        summarizeWallpaperInfo,
      )
      if (!info) {
        set.status = 404
        return { error: { message: 'wallpaper unavailable' } }
      }

      return info
    })
    .get('/wallpaper/still', async ({ set }) => {
      const media = await observeRequestOperation(
        { area: 'wallpaper', operation: 'still' },
        () => service.readDesktopWallpaperStillMedia(),
        summarizeWallpaperMedia,
      )
      if (!media) {
        set.status = 404
        return { error: { message: 'wallpaper still unavailable' } }
      }

      return wallpaperMediaResponse(media)
    })
    .get('/wallpaper', async ({ set }) => {
      const media = await observeRequestOperation(
        { area: 'wallpaper', operation: 'read' },
        () => service.readDesktopWallpaperMedia(),
        summarizeWallpaperMedia,
      )
      if (!media) {
        set.status = 404
        return { error: { message: 'wallpaper unavailable' } }
      }

      return wallpaperMediaResponse(media)
    })
}

function wallpaperMediaResponse(media: DesktopWallpaperMedia) {
  return new Response(media.buffer, {
    headers: {
      'cache-control': WALLPAPER_CACHE_CONTROL,
      'content-length': String(media.buffer.byteLength),
      'content-type': media.contentType,
    },
  })
}

function summarizeWallpaperMedia(media: DesktopWallpaperMedia | null): Record<string, unknown> {
  if (!media) return { available: false }

  return {
    available: true,
    byteLength: media.buffer.byteLength,
    contentType: media.contentType,
    kind: media.kind,
    source: media.source,
  }
}

function summarizeWallpaperInfo(info: DesktopWallpaperInfo | null): Record<string, unknown> {
  if (!info) return { available: false }

  return {
    available: true,
    contentType: info.contentType,
    kind: info.kind,
    source: info.source,
  }
}
