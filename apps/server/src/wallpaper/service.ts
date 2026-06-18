import { tmpdir } from 'node:os'
import path from 'node:path'

// The wallpaper is a backdrop behind translucent panes, so a downscaled JPEG is
// plenty and keeps the payload small.
const WALLPAPER_MAX_DIMENSION = 1600
const APNG_SAMPLE_BYTES = 64 * 1024
const DYNAMIC_WALLPAPER_STILL_DIR = 'DesktopImage'
const DYNAMIC_WALLPAPER_GIF_DIR = 'Gifs'
const DYNAMIC_WALLPAPER_VIDEO_DIR = 'Videos'
const VIDEO_EXTENSIONS = [
  { contentType: 'video/mp4', extension: '.mp4' },
  { contentType: 'video/mp4', extension: '.m4v' },
  { contentType: 'video/quicktime', extension: '.mov' },
] as const

type DesktopWallpaperKind = 'image' | 'video'
type DesktopWallpaperSource =
  | 'animated-gif'
  | 'animated-png'
  | 'animated-video'
  | 'animated-webp'
  | 'converted-jpeg'
  | 'still-image'

export type DesktopWallpaperInfo = {
  readonly contentType: string
  readonly kind: DesktopWallpaperKind
  readonly source: DesktopWallpaperSource
}

export type DesktopWallpaperMedia = DesktopWallpaperInfo & {
  readonly buffer: ArrayBuffer
}

type WallpaperMediaSource = DesktopWallpaperInfo & {
  readonly path: string
}

// Reads the host machine's current macOS desktop wallpaper as browser-renderable
// media. Animated sources are preserved when discoverable; otherwise macOS
// wallpapers are converted to JPEG because they are often browser-incompatible
// HEIC files. Returns null off macOS or on failure (e.g. Automation permission
// denied); the route 404s and the client falls back to the shipped image.
export async function readDesktopWallpaperMedia(): Promise<DesktopWallpaperMedia | null> {
  if (process.platform !== 'darwin') return null

  const sourcePath = await currentWallpaperPath()
  if (!sourcePath) return null

  return readDesktopWallpaperMediaFromPath(sourcePath)
}

export async function readDesktopWallpaperInfo(): Promise<DesktopWallpaperInfo | null> {
  if (process.platform !== 'darwin') return null

  const sourcePath = await currentWallpaperPath()
  if (!sourcePath) return null

  return readDesktopWallpaperInfoFromPath(sourcePath)
}

export async function readDesktopWallpaperStillMedia(): Promise<DesktopWallpaperMedia | null> {
  if (process.platform !== 'darwin') return null

  const sourcePath = await currentWallpaperPath()
  if (!sourcePath) return null

  return readDesktopWallpaperStillMediaFromPath(sourcePath)
}

export async function readDesktopWallpaperInfoFromPath(
  sourcePath: string,
): Promise<DesktopWallpaperInfo> {
  const animatedSource = await animatedMediaSource(sourcePath)
  if (animatedSource) return mediaInfo(animatedSource)

  return jpegInfo()
}

export async function readDesktopWallpaperMediaFromPath(
  sourcePath: string,
): Promise<DesktopWallpaperMedia | null> {
  const animatedSource = await animatedMediaSource(sourcePath)
  if (animatedSource) return readExistingMedia(animatedSource)

  return convertToJpeg(sourcePath)
}

export async function readDesktopWallpaperStillMediaFromPath(
  sourcePath: string,
): Promise<DesktopWallpaperMedia | null> {
  const stillSource = await stillImageSource(sourcePath)
  if (stillSource) return readExistingMedia(stillSource)

  return convertToJpeg(sourcePath)
}

async function currentWallpaperPath(): Promise<string | null> {
  const result = await runCommand([
    'osascript',
    '-e',
    'tell application "System Events" to get picture of current desktop',
  ])
  if (!result.ok) return null

  const trimmed = result.stdout.trim()
  return trimmed.length > 0 ? trimmed : null
}

async function animatedMediaSource(sourcePath: string): Promise<WallpaperMediaSource | null> {
  const dynamicWallpaperVideo = await dynamicWallpaperVideoSource(sourcePath)
  if (dynamicWallpaperVideo) return dynamicWallpaperVideo

  const dynamicWallpaperGif = await dynamicWallpaperGifSource(sourcePath)
  if (dynamicWallpaperGif) return dynamicWallpaperGif

  const extension = path.extname(sourcePath).toLowerCase()
  if (extension === '.gif') {
    return existingMediaSource({
      contentType: 'image/gif',
      kind: 'image',
      path: sourcePath,
      source: 'animated-gif',
    })
  }

  if (extension === '.webp') {
    return existingMediaSource({
      contentType: 'image/webp',
      kind: 'image',
      path: sourcePath,
      source: 'animated-webp',
    })
  }

  const videoContentType = videoContentTypeForExtension(extension)
  if (videoContentType) {
    return existingMediaSource({
      contentType: videoContentType,
      kind: 'video',
      path: sourcePath,
      source: 'animated-video',
    })
  }

  if (extension !== '.png') return null
  if (!(await isAnimatedPng(sourcePath))) return null

  return existingMediaSource({
    contentType: 'image/png',
    kind: 'image',
    path: sourcePath,
    source: 'animated-png',
  })
}

async function stillImageSource(sourcePath: string): Promise<WallpaperMediaSource | null> {
  const contentType = stillImageContentType(sourcePath)
  if (!contentType) return null
  if (await isAnimatedStillSource(sourcePath)) return null

  return existingMediaSource({
    contentType,
    kind: 'image',
    path: sourcePath,
    source: 'still-image',
  })
}

async function dynamicWallpaperVideoSource(
  sourcePath: string,
): Promise<WallpaperMediaSource | null> {
  const documentsDir = dynamicWallpaperDocumentsDir(sourcePath)
  if (!documentsDir) return null

  const parsed = path.parse(sourcePath)
  for (const videoType of VIDEO_EXTENSIONS) {
    const source = await existingMediaSource({
      contentType: videoType.contentType,
      kind: 'video',
      path: path.join(
        documentsDir,
        DYNAMIC_WALLPAPER_VIDEO_DIR,
        `${parsed.name}${videoType.extension}`,
      ),
      source: 'animated-video',
    })
    if (source) return source
  }

  return null
}

async function dynamicWallpaperGifSource(sourcePath: string): Promise<WallpaperMediaSource | null> {
  const documentsDir = dynamicWallpaperDocumentsDir(sourcePath)
  if (!documentsDir) return null

  const parsed = path.parse(sourcePath)
  return existingMediaSource({
    contentType: 'image/gif',
    kind: 'image',
    path: path.join(documentsDir, DYNAMIC_WALLPAPER_GIF_DIR, `${parsed.name}.gif`),
    source: 'animated-gif',
  })
}

function dynamicWallpaperDocumentsDir(sourcePath: string): string | null {
  const parsed = path.parse(sourcePath)
  if (parsed.ext.toLowerCase() !== '.png') return null
  if (path.basename(parsed.dir) !== DYNAMIC_WALLPAPER_STILL_DIR) return null

  return path.dirname(parsed.dir)
}

function videoContentTypeForExtension(extension: string): string | null {
  return (
    VIDEO_EXTENSIONS.find((videoType) => videoType.extension === extension)?.contentType ?? null
  )
}

function stillImageContentType(sourcePath: string): string | null {
  const extension = path.extname(sourcePath).toLowerCase()
  if (extension === '.jpg' || extension === '.jpeg') return 'image/jpeg'
  if (extension === '.png') return 'image/png'
  if (extension === '.webp') return 'image/webp'

  return null
}

async function isAnimatedStillSource(sourcePath: string): Promise<boolean> {
  if (path.extname(sourcePath).toLowerCase() !== '.png') return false

  return isAnimatedPng(sourcePath)
}

async function isAnimatedPng(sourcePath: string): Promise<boolean> {
  const file = Bun.file(sourcePath)
  if (!(await file.exists())) return false

  const sample = await file.slice(0, APNG_SAMPLE_BYTES).arrayBuffer()
  return new TextDecoder('ascii').decode(sample).includes('acTL')
}

async function existingMediaSource(
  mediaSource: WallpaperMediaSource,
): Promise<WallpaperMediaSource | null> {
  const file = Bun.file(mediaSource.path)
  if (await file.exists()) return mediaSource

  return null
}

async function readExistingMedia(
  mediaSource: WallpaperMediaSource,
): Promise<DesktopWallpaperMedia | null> {
  const file = Bun.file(mediaSource.path)
  if (!(await file.exists())) return null

  const buffer = await file.arrayBuffer()
  if (buffer.byteLength === 0) return null

  return {
    buffer,
    contentType: mediaSource.contentType,
    kind: mediaSource.kind,
    source: mediaSource.source,
  }
}

async function convertToJpeg(sourcePath: string): Promise<DesktopWallpaperMedia | null> {
  const outputPath = path.join(tmpdir(), 'platform-desktop-wallpaper.jpg')
  const result = await runCommand([
    'sips',
    '-s',
    'format',
    'jpeg',
    '-Z',
    String(WALLPAPER_MAX_DIMENSION),
    sourcePath,
    '--out',
    outputPath,
  ])
  if (!result.ok) return null

  const buffer = await Bun.file(outputPath).arrayBuffer()
  if (buffer.byteLength === 0) return null

  return {
    buffer,
    ...jpegInfo(),
  }
}

function mediaInfo(mediaSource: WallpaperMediaSource): DesktopWallpaperInfo {
  return {
    contentType: mediaSource.contentType,
    kind: mediaSource.kind,
    source: mediaSource.source,
  }
}

function jpegInfo(): DesktopWallpaperInfo {
  return {
    contentType: 'image/jpeg',
    kind: 'image',
    source: 'converted-jpeg',
  }
}

async function runCommand(command: string[]): Promise<{ ok: boolean; stdout: string }> {
  const child = Bun.spawn({ cmd: command, stderr: 'ignore', stdout: 'pipe' })
  const [stdout] = await Promise.all([new Response(child.stdout).text(), child.exited])

  return { ok: child.exitCode === 0, stdout }
}
