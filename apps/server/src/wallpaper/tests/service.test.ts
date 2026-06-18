import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import {
  readDesktopWallpaperMediaFromPath,
  readDesktopWallpaperStillMediaFromPath,
} from '../service'

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

describe('readDesktopWallpaperMediaFromPath', () => {
  it('serves the matching Dynamic Wallpaper video before the tiny GIF preview', async () => {
    const root = await fixtureRoot()
    const stillPath = path.join(root, 'Documents', 'DesktopImage', 'wallpaper-id.png')
    const gifPath = path.join(root, 'Documents', 'Gifs', 'wallpaper-id.gif')
    const videoPath = path.join(root, 'Documents', 'Videos', 'wallpaper-id.mp4')
    await writeFixture(stillPath, 'still-frame')
    await writeFixture(gifPath, 'animated-frames')
    await writeFixture(videoPath, 'high-quality-video')

    const media = await readDesktopWallpaperMediaFromPath(stillPath)

    expect(media?.contentType).toBe('video/mp4')
    expect(media?.kind).toBe('video')
    expect(media?.source).toBe('animated-video')
    expect(bufferText(media?.buffer)).toBe('high-quality-video')
  })

  it('serves the Dynamic Wallpaper still frame separately from the video', async () => {
    const root = await fixtureRoot()
    const stillPath = path.join(root, 'Documents', 'DesktopImage', 'wallpaper-id.png')
    const videoPath = path.join(root, 'Documents', 'Videos', 'wallpaper-id.mp4')
    await writeFixture(stillPath, 'still-frame')
    await writeFixture(videoPath, 'high-quality-video')

    const media = await readDesktopWallpaperStillMediaFromPath(stillPath)

    expect(media?.contentType).toBe('image/png')
    expect(media?.kind).toBe('image')
    expect(media?.source).toBe('still-image')
    expect(bufferText(media?.buffer)).toBe('still-frame')
  })

  it('falls back to the matching Dynamic Wallpaper GIF when video is unavailable', async () => {
    const root = await fixtureRoot()
    const stillPath = path.join(root, 'Documents', 'DesktopImage', 'wallpaper-id.png')
    const gifPath = path.join(root, 'Documents', 'Gifs', 'wallpaper-id.gif')
    await writeFixture(stillPath, 'still-frame')
    await writeFixture(gifPath, 'animated-frames')

    const media = await readDesktopWallpaperMediaFromPath(stillPath)

    expect(media?.contentType).toBe('image/gif')
    expect(media?.kind).toBe('image')
    expect(media?.source).toBe('animated-gif')
    expect(bufferText(media?.buffer)).toBe('animated-frames')
  })

  it('serves direct GIF wallpaper sources without converting them', async () => {
    const root = await fixtureRoot()
    const gifPath = path.join(root, 'wallpaper.gif')
    await writeFixture(gifPath, 'animated-gif')

    const media = await readDesktopWallpaperMediaFromPath(gifPath)

    expect(media?.contentType).toBe('image/gif')
    expect(media?.kind).toBe('image')
    expect(media?.source).toBe('animated-gif')
    expect(bufferText(media?.buffer)).toBe('animated-gif')
  })

  it('serves APNG wallpaper sources without converting them', async () => {
    const root = await fixtureRoot()
    const apngPath = path.join(root, 'wallpaper.png')
    await writeFixture(apngPath, 'png-header acTL animated-control-chunk')

    const media = await readDesktopWallpaperMediaFromPath(apngPath)

    expect(media?.contentType).toBe('image/png')
    expect(media?.kind).toBe('image')
    expect(media?.source).toBe('animated-png')
    expect(bufferText(media?.buffer)).toBe('png-header acTL animated-control-chunk')
  })
})

async function fixtureRoot() {
  const root = await mkdtemp(path.join(tmpdir(), 'platform-wallpaper-'))
  roots.push(root)
  return root
}

async function writeFixture(filePath: string, contents: string) {
  await mkdir(path.dirname(filePath), { recursive: true })
  await writeFile(filePath, contents)
}

function bufferText(buffer: ArrayBuffer | undefined) {
  if (!buffer) return null

  return Buffer.from(buffer).toString()
}
