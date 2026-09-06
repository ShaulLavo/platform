import { dlopen } from 'bun:ffi'
import path from 'node:path'

export function foregroundJobGroup(): number | null {
  if (process.platform === 'win32' || !process.stdin.isTTY) return null
  const library = dlopen(
    process.platform === 'darwin' ? '/usr/lib/libSystem.B.dylib' : 'libc.so.6',
    {
      getpgrp: { args: [], returns: 'i32' },
      getsid: { args: ['i32'], returns: 'i32' },
      tcgetpgrp: { args: ['i32'], returns: 'i32' },
    },
  )
  try {
    const group = library.symbols.getpgrp()
    if (group <= 1 || library.symbols.tcgetpgrp(process.stdin.fd) !== group) return null
    if (group === library.symbols.getsid(0)) return null
    return ownsJobGroup(group) ? group : null
  } finally {
    library.close()
  }
}

function ownsJobGroup(group: number): boolean {
  if (group === process.pid) return true
  // The launcher can lead our group; an enclosing shell must never be stopped.
  const leader = Bun.spawnSync(['ps', '-p', String(group), '-o', 'comm='], {
    stdin: 'ignore',
    stdout: 'pipe',
    stderr: 'pipe',
  })
  if (leader.exitCode !== 0) return false
  return path.basename(leader.stdout.toString().trim()) === path.basename(process.execPath)
}
