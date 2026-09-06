import { createHash } from 'node:crypto'
import { writeFileSync, writeSync } from 'node:fs'

const mode = process.argv[2]
const stdout = process.stdout

function raw() {
  Bun.spawnSync(['stty', 'raw', '-echo'], { stdin: 'inherit' })
}

function writeAll(bytes: Uint8Array) {
  let offset = 0
  while (offset < bytes.byteLength) offset += writeSync(1, bytes, offset)
}

function resizeFrame() {
  stdout.write(`SIZE:${stdout.columns}x${stdout.rows}\n`)
}

function readUntilQuit() {
  process.stdin.setRawMode(true)
  process.stdin.on('data', (chunk: Buffer) => {
    if (chunk.toString() !== 'q') return
    process.exit(0)
  })
  process.stdin.resume()
}

function metadata() {
  console.log(
    JSON.stringify({
      args: process.argv.slice(3),
      cwd: process.cwd(),
      env: process.env.PTY_TEST_VALUE,
      pid: process.pid,
      ppid: process.ppid,
      tty: [process.stdin.isTTY, process.stdout.isTTY, process.stderr.isTTY],
      size: [process.stdout.columns, process.stdout.rows],
    }),
  )
  process.exit(7)
}

function output() {
  raw()
  const bytes = Buffer.alloc(Number(process.argv[3]))
  for (let index = 0; index < bytes.byteLength; index++) bytes[index] = index % 256
  writeAll(bytes)
  process.exit(23)
}

function input() {
  raw()
  const expectedLength = Number(process.argv[3])
  const hash = createHash('sha256')
  let received = 0
  process.stdout.write('READY\n')
  setTimeout(() => {
    process.stdin.on('data', (chunk: Buffer) => {
      received += chunk.byteLength
      hash.update(chunk)
      if (received < expectedLength) return
      process.stdout.write(`RECEIVED:${received}:${hash.digest('hex')}\n`)
      process.exit(0)
    })
    process.stdin.resume()
  }, 150)
}

function tui() {
  raw()
  process.stdout.write('\x1b[?1049h\x1b[2J\x1b[H')
  process.on('SIGWINCH', resizeFrame)
  resizeFrame()
  process.stdin.on('data', (chunk: Buffer) => {
    process.stdout.write(`KEY:${chunk.toString('hex')}\n`)
    if (chunk.toString() !== 'q') return
    process.stdout.write('\x1b[?1049l')
    process.exit(0)
  })
  process.stdin.resume()
}

function stubborn() {
  process.on('SIGTERM', () => {})
  process.on('SIGHUP', () => {})
  console.log('READY')
  setInterval(() => {}, 1000)
}

function descendant() {
  process.on('SIGHUP', () => {})
  process.send?.('ready')
  setTimeout(
    () => {
      const outcome = writeTail()
      const reportFile = process.argv[4]
      if (reportFile) writeFileSync(reportFile, outcome)
      process.exit(0)
    },
    Number(process.argv[3] ?? 150),
  )
}

function writeTail() {
  try {
    writeSync(1, 'TAIL')
    return 'written'
  } catch (error) {
    if (error instanceof Error && 'code' in error) return String(error.code)
    throw error
  }
}

function delayedTail() {
  const child = Bun.spawn(
    [
      process.execPath,
      import.meta.filename,
      'descendant',
      process.argv[3] ?? '150',
      process.argv[4] ?? '',
    ],
    {
      stdin: 'inherit',
      stdout: 'inherit',
      stderr: 'inherit',
      ipc(message) {
        if (message !== 'ready') return
        process.stdout.write(mode === 'held-tail' ? `HEAD:${child.pid}\n` : 'HEAD')
        process.exit(7)
      },
    },
  )
}

switch (mode) {
  case 'metadata':
    metadata()
    break
  case 'output':
    output()
    break
  case 'input':
    input()
    break
  case 'tui':
    tui()
    break
  case 'stubborn':
    stubborn()
    break
  case 'delayed-tail':
    delayedTail()
    break
  case 'held-tail':
    delayedTail()
    break
  case 'descendant':
    descendant()
    break
  case 'resize':
    readUntilQuit()
    process.on('SIGWINCH', resizeFrame)
    resizeFrame()
    break
  default:
    process.exit(64)
}
