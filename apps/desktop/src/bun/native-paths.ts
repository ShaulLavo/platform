import { existsSync, mkdirSync } from 'node:fs'
import path from 'node:path'

export const NATIVE_LIBRARY_NAME = 'libVibrancy.dylib'

// Build output lives beside the source rather than in the Electrobun bundle,
// which is regenerated on every dev run and would drop the file.
export function nativeLibraryDir(desktopDir: string): string {
  const dir = path.join(desktopDir, 'native', 'build')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })

  return dir
}

// In dev the process runs from inside the generated .app bundle, so the library
// has to be found through the repo root rather than relative to this module.
// A packaged app carries it next to Electrobun's own native wrapper instead.
export function nativeLibraryCandidates(rootDir: string): readonly string[] {
  return [
    path.join(process.cwd(), NATIVE_LIBRARY_NAME),
    path.join(rootDir, 'apps', 'desktop', 'native', 'build', NATIVE_LIBRARY_NAME),
  ]
}
