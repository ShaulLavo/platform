import type { GitCommandResult } from "./types"

export async function writeProcessInput(
  stdin: Bun.FileSink | undefined,
  input: string
) {
  if (!stdin) return

  stdin.write(input)
  stdin.end()
}

export function commandOutput(result: GitCommandResult) {
  const output = `${result.stdout}${result.stderr}`.trim()
  return output || "ok"
}

export function gitErrorMessage(result: GitCommandResult) {
  const message = `${result.stderr}${result.stdout}`.trim()
  return message || "git command failed"
}
