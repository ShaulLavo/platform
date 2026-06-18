import { tmpdir } from 'node:os'
import path from 'node:path'

// The wallpaper is a backdrop behind translucent panes, so a downscaled JPEG is
// plenty and keeps the payload small.
const WALLPAPER_MAX_DIMENSION = 1600

// Reads the host machine's current macOS desktop wallpaper as JPEG bytes. macOS
// wallpapers are often dynamic .heic (browsers can't decode HEIC), so sips converts
// + downscales to JPEG. Returns null off macOS or on failure (e.g. Automation
// permission denied); the route 404s and the client falls back to the shipped image.
export async function readDesktopWallpaperJpeg(): Promise<ArrayBuffer | null> {
  if (process.platform !== 'darwin') return null

  const sourcePath = await currentWallpaperPath()
  if (!sourcePath) return null

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

async function convertToJpeg(sourcePath: string): Promise<ArrayBuffer | null> {
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
  return buffer.byteLength > 0 ? buffer : null
}

async function runCommand(command: string[]): Promise<{ ok: boolean; stdout: string }> {
  const child = Bun.spawn({ cmd: command, stderr: 'ignore', stdout: 'pipe' })
  const [stdout] = await Promise.all([new Response(child.stdout).text(), child.exited])

  return { ok: child.exitCode === 0, stdout }
}
