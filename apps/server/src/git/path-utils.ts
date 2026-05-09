import { FsError } from "../fs/errors"
import type { GitPathsBody } from "./contracts"

export function mutationPaths(body: GitPathsBody) {
  const paths = body.paths?.length ? body.paths : body.path ? [body.path] : []
  if (paths.length > 0) return paths

  throw new FsError("INVALID_PATH")
}

export function pathspecArgs(pathspec: string | null) {
  if (!pathspec) return []

  return ["--", pathspec]
}

export function splitFields(record: string, count: number) {
  const fields: string[] = []
  let cursor = 0

  for (let field = 1; field < count; field += 1) {
    const index = record.indexOf(" ", cursor)
    if (index < 0) return [...fields, record.slice(cursor)]

    fields.push(record.slice(cursor, index))
    cursor = index + 1
  }

  fields.push(record.slice(cursor))
  return fields
}

export function joinPath(rootPath: string, childPath: string | undefined) {
  if (!childPath) return rootPath
  if (!rootPath) return childPath

  return `${rootPath}/${childPath}`
}

export function repositoryRelativePath(rootPath: string, filePath: string) {
  if (!rootPath) return filePath
  if (filePath === rootPath) return ""

  const prefix = `${rootPath}/`
  if (!filePath.startsWith(prefix)) return filePath

  return filePath.slice(prefix.length)
}

export function unquoteGitPath(value: string) {
  if (!value.startsWith('"')) return value

  try {
    return JSON.parse(value) as string
  } catch {
    return value.slice(1, -1)
  }
}

export function ensureTrailingNewline(value: string) {
  return value.endsWith("\n") ? value : `${value}\n`
}
