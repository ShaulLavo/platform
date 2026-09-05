export function crashingDiscoveryProcess(env: NodeJS.ProcessEnv) {
  return Bun.spawn(
    [
      process.execPath,
      '-e',
      'await Bun.stdin.text(); console.error("discovery fixture crash"); process.exit(37)',
    ],
    { env, stdin: 'pipe', stdout: 'pipe', stderr: 'pipe' },
  )
}

export function hangingDiscoveryProcess(env: NodeJS.ProcessEnv) {
  return Bun.spawn(
    [
      process.execPath,
      '-e',
      'await Bun.stdin.text(); console.error("discovery fixture hung"); await Bun.sleep(60_000)',
    ],
    { env, stdin: 'pipe', stdout: 'pipe', stderr: 'pipe' },
  )
}
