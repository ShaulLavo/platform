import { dlopen, FFIType } from 'bun:ffi'
import { existsSync } from 'node:fs'

import { recordDesktopError, recordDesktopInfo } from './observability'
import { nativeLibraryCandidates } from './native-paths'

// NSVisualEffectMaterialUnderWindowBackground. The window sits over the desktop,
// so this is the material AppKit tunes for wallpaper showing through.
const UNDER_WINDOW_BACKGROUND = 21

// The native window is created asynchronously, so the first attempts can land
// before AppKit has the window. Retry briefly rather than racing window creation.
const ATTACH_ATTEMPTS = 40
const ATTACH_RETRY_MS = 50

type VibrancyLibrary = {
  readonly symbols: {
    readonly platform_attach_vibrancy: (title: Uint8Array, material: number) => number
  }
}

// Replaces the web layer's wallpaper video with the compositor's own blur of
// whatever is behind the window. Best-effort: a window with no vibrancy still
// works, it just renders opaque.
export async function attachWindowVibrancy(windowTitle: string, rootDir: string) {
  if (process.platform !== 'darwin') return

  const library = loadLibrary(rootDir)
  if (!library) return

  // NUL-terminated: the native side takes a C string.
  const title = new TextEncoder().encode(`${windowTitle}\0`)
  for (let attempt = 0; attempt < ATTACH_ATTEMPTS; attempt++) {
    const attached = library.symbols.platform_attach_vibrancy(title, UNDER_WINDOW_BACKGROUND)
    if (attached === 1) {
      recordDesktopInfo('desktop.vibrancy.attached', { attempt, windowTitle })
      return
    }

    await Bun.sleep(ATTACH_RETRY_MS)
  }

  recordDesktopError('desktop.vibrancy.window-not-found', { windowTitle })
}

function loadLibrary(rootDir: string): VibrancyLibrary | null {
  const libraryPath = nativeLibraryCandidates(rootDir).find((candidate) => existsSync(candidate))
  if (!libraryPath) {
    // Expected when the native build step has not run; the window stays opaque.
    recordDesktopInfo('desktop.vibrancy.library-missing', {
      searched: nativeLibraryCandidates(rootDir),
    })
    return null
  }

  try {
    return dlopen(libraryPath, {
      platform_attach_vibrancy: {
        args: [FFIType.ptr, FFIType.i32],
        returns: FFIType.i32,
      },
    }) as unknown as VibrancyLibrary
  } catch (error) {
    recordDesktopError('desktop.vibrancy.dlopen-failed', {
      error: error instanceof Error ? error.message : String(error),
      libraryPath,
    })
    return null
  }
}
