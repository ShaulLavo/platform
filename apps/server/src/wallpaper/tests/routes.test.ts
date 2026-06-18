import { Elysia } from 'elysia'
import { describe, expect, it } from 'vitest'

import { wallpaperRoutes, type WallpaperService } from '../routes'

describe('wallpaperRoutes', () => {
  it('returns wallpaper media with its content type', async () => {
    const app = testApp({
      readDesktopWallpaperInfo: async () => ({
        contentType: 'video/mp4',
        kind: 'video',
        source: 'animated-video',
      }),
      readDesktopWallpaperMedia: async () => ({
        buffer: stringBuffer('animated-wallpaper'),
        contentType: 'video/mp4',
        kind: 'video',
        source: 'animated-video',
      }),
      readDesktopWallpaperStillMedia: async () => null,
    })

    const response = await app.handle(new Request('http://local/wallpaper'))

    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('public, max-age=60')
    expect(response.headers.get('content-length')).toBe('18')
    expect(response.headers.get('content-type')).toBe('video/mp4')
    expect(await response.text()).toBe('animated-wallpaper')
  })

  it('returns wallpaper info without the media bytes', async () => {
    const app = testApp({
      readDesktopWallpaperInfo: async () => ({
        contentType: 'video/mp4',
        kind: 'video',
        source: 'animated-video',
      }),
      readDesktopWallpaperMedia: async () => null,
      readDesktopWallpaperStillMedia: async () => null,
    })

    const response = await app.handle(new Request('http://local/wallpaper/info'))

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      contentType: 'video/mp4',
      kind: 'video',
      source: 'animated-video',
    })
  })

  it('returns not found when wallpaper media is unavailable', async () => {
    const app = testApp({
      readDesktopWallpaperInfo: async () => null,
      readDesktopWallpaperMedia: async () => null,
      readDesktopWallpaperStillMedia: async () => null,
    })

    const response = await app.handle(new Request('http://local/wallpaper'))

    expect(response.status).toBe(404)
    expect(await response.json()).toEqual({
      error: { message: 'wallpaper unavailable' },
    })
  })

  it('returns wallpaper still media separately from video media', async () => {
    const app = testApp({
      readDesktopWallpaperInfo: async () => ({
        contentType: 'video/mp4',
        kind: 'video',
        source: 'animated-video',
      }),
      readDesktopWallpaperMedia: async () => null,
      readDesktopWallpaperStillMedia: async () => ({
        buffer: stringBuffer('still-wallpaper'),
        contentType: 'image/png',
        kind: 'image',
        source: 'still-image',
      }),
    })

    const response = await app.handle(new Request('http://local/wallpaper/still'))

    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('public, max-age=60')
    expect(response.headers.get('content-length')).toBe('15')
    expect(response.headers.get('content-type')).toBe('image/png')
    expect(await response.text()).toBe('still-wallpaper')
  })
})

function testApp(service: WallpaperService) {
  return new Elysia().use(wallpaperRoutes(service))
}

function stringBuffer(value: string) {
  const buffer = Buffer.from(value)
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)
}
