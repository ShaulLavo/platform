// Compiles the vibrancy dylib that gives the window real macOS behind-window
// blur. Runs before `electrobun dev`/`build`; a no-op off macOS, where the
// runtime loader simply finds no library and leaves the window opaque.
import { existsSync } from 'node:fs'
import path from 'node:path'

import { NATIVE_LIBRARY_NAME, nativeLibraryDir } from '../src/bun/native-paths'

const DESKTOP_DIR = path.join(import.meta.dirname, '..')
const SOURCE = path.join(DESKTOP_DIR, 'native', 'vibrancy.m')
const OUTPUT = path.join(nativeLibraryDir(DESKTOP_DIR), NATIVE_LIBRARY_NAME)

if (process.platform !== 'darwin') process.exit(0)

if (!existsSync(SOURCE)) {
  console.error(`[native] missing source ${SOURCE}`)
  process.exit(1)
}

const result = Bun.spawnSync({
  cmd: [
    'clang',
    '-dynamiclib',
    '-fobjc-arc',
    '-mmacosx-version-min=11.0',
    '-framework',
    'Cocoa',
    '-O2',
    '-o',
    OUTPUT,
    SOURCE,
  ],
  stderr: 'pipe',
  stdout: 'pipe',
})

if (result.exitCode !== 0) {
  console.error(`[native] failed to build ${NATIVE_LIBRARY_NAME}`)
  console.error(new TextDecoder().decode(result.stderr))
  process.exit(result.exitCode ?? 1)
}

console.log(`[native] built ${OUTPUT}`)
