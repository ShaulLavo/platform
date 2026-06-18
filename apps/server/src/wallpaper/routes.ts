import { Elysia } from 'elysia'

import { readDesktopWallpaperJpeg } from './service'

const WALLPAPER_CACHE_CONTROL = 'public, max-age=60'

// Serves the host machine's current desktop wallpaper as a JPEG. The web app
// preloads it and renders it through a crossorigin <img> (the CORS request carries
// an Origin past the auth guard); see apps/web/.../components/wallpaper.tsx and the
// preload link injected in apps/web/vite.config.ts. 404s off macOS or on failure so
// the client falls back to the shipped image.
export function wallpaperRoutes() {
  return new Elysia({ name: 'wallpaper-routes' }).get('/wallpaper', async ({ set }) => {
    const buffer = await readDesktopWallpaperJpeg()
    if (!buffer) {
      set.status = 404
      return { error: { message: 'wallpaper unavailable' } }
    }

    return new Response(buffer, {
      headers: {
        'cache-control': WALLPAPER_CACHE_CONTROL,
        'content-length': String(buffer.byteLength),
        'content-type': 'image/jpeg',
      },
    })
  })
}
