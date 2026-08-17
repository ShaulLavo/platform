import type { FileSystemEntryMetadata } from '@workspace/contracts'
import type { TreeEntry } from './contracts'

/**
 * The one projection from a stat result to the `TreeEntry` clients receive.
 * Both the request path (`FileSystemService`) and the watch path
 * (`FileChangeHub`) go through here so a new `TreeEntry` field cannot land on
 * one and silently miss the other.
 */
export function entryFromStat(stat: FileSystemEntryMetadata): TreeEntry {
  return {
    path: stat.path,
    name: pathBasename(stat.path),
    type: stat.type,
    targetType: stat.targetType,
    size: stat.size,
    mtimeMs: stat.mtimeMs,
    birthtimeMs: stat.birthtimeMs,
    version: stat.version,
  }
}

function pathBasename(input: string) {
  const parts = input.split('/').filter(Boolean)
  return parts.at(-1) ?? 'Root'
}
