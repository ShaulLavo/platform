import { readFile } from "node:fs/promises"
import path from "node:path"

import { toPosix, type WorkspacePaths } from "./path"

type GitIgnoreRule = {
  anchored: boolean
  negated: boolean
  pattern: string
}

export type GitIgnoreMatcher = {
  ignores(relativePath: string): boolean
}

export async function workspaceGitIgnoreMatcher(
  paths: WorkspacePaths
): Promise<GitIgnoreMatcher> {
  const rules = await workspaceGitIgnoreRules(paths.workspaceRoot)

  return {
    ignores(relativePath) {
      return gitIgnoreRulesIgnorePath(rules, relativePath)
    },
  }
}

async function workspaceGitIgnoreRules(root: string) {
  try {
    const contents = await readFile(path.join(root, ".gitignore"), "utf8")
    return contents.split(/\r?\n/u).flatMap(gitIgnoreRuleFromLine)
  } catch (error) {
    if (isMissingFileError(error)) return []
    throw error
  }
}

function isMissingFileError(error: unknown) {
  return (
    error instanceof Error &&
    "code" in error &&
    (error as NodeJS.ErrnoException).code === "ENOENT"
  )
}

function gitIgnoreRuleFromLine(line: string): GitIgnoreRule[] {
  const text = line.trim()
  if (!text) return []
  if (text.startsWith("#")) return []

  const negated = text.startsWith("!")
  const rawPattern = negated ? text.slice(1) : text
  const pattern = gitIgnoreRulePattern(rawPattern)
  if (!pattern) return []

  return [
    {
      anchored: rawPattern.startsWith("/"),
      negated,
      pattern,
    },
  ]
}

function gitIgnoreRulePattern(pattern: string) {
  const withoutAnchor = pattern.replace(/^\/+/u, "")
  const withoutTrailingSlash = withoutAnchor.replace(/\/+$/u, "")
  if (!withoutTrailingSlash) return null

  return toPosix(withoutTrailingSlash)
}

function gitIgnoreRulesIgnorePath(
  rules: readonly GitIgnoreRule[],
  relativePath: string
) {
  const normalized = toPosix(relativePath).replace(/^\/+/u, "")
  if (!normalized) return false

  let ignored = false
  for (const rule of rules) {
    if (!gitIgnoreRuleMatches(rule, normalized)) continue
    ignored = !rule.negated
  }

  return ignored
}

function gitIgnoreRuleMatches(rule: GitIgnoreRule, relativePath: string) {
  if (rule.anchored || rule.pattern.includes("/")) {
    return pathOrAncestorMatchesGlob(relativePath, rule.pattern)
  }

  return relativePath
    .split("/")
    .some((segment) => globPatternMatches(segment, rule.pattern))
}

function pathOrAncestorMatchesGlob(relativePath: string, pattern: string) {
  const parts = relativePath.split("/")

  for (let index = parts.length; index > 0; index -= 1) {
    const candidate = parts.slice(0, index).join("/")
    if (globPatternMatches(candidate, pattern)) return true
  }

  return false
}

function globPatternMatches(value: string, pattern: string) {
  return new RegExp(`^${globToRegExp(pattern)}$`, "u").test(value)
}

function globToRegExp(pattern: string) {
  let source = ""

  for (let index = 0; index < pattern.length; index += 1) {
    const character = pattern[index]
    if (character === "*" && pattern[index + 1] === "*") {
      source += ".*"
      index += 1
      continue
    }
    if (character === "*") {
      source += "[^/]*"
      continue
    }
    if (character === "?") {
      source += "[^/]"
      continue
    }
    source += escapeRegExp(character)
  }

  return source
}

function escapeRegExp(character: string) {
  return /[\\^$.*+?()[\]{}|]/u.test(character) ? `\\${character}` : character
}
