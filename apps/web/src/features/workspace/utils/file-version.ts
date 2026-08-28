export function fileStatVersion({
  mtimeMs,
  size,
}: {
  readonly mtimeMs: number
  readonly size: number
}) {
  return `stat:${mtimeMs}:${size}`
}
