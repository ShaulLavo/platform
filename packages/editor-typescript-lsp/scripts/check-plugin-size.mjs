#!/usr/bin/env node
/**
 * Enforces the 400 source-line budget for `plugin.ts` defined in
 * codebase-review-remediation Req 1.5.
 *
 * Counts every line that is not entirely blank and not entirely a comment.
 * A line is counted when, after trimming leading/trailing whitespace, it:
 *   - is not the empty string
 *   - does not start with `//`
 *   - does not start with `/*`
 *   - does not start with `*` (JSDoc continuation, e.g. ` * foo`, ` */`)
 * A line outside the above categories but sitting inside a multi-line
 * `/* ... *\/` block is also excluded via a simple state machine.
 *
 * Exits non-zero when the resulting count exceeds MAX_SOURCE_LINES so that
 * `oxlint . && node scripts/check-plugin-size.mjs` in the package `lint`
 * script fails the `turbo lint` pipeline at the repo root.
 */

import { readFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const MAX_SOURCE_LINES = 400

const scriptDir = dirname(fileURLToPath(import.meta.url))
const target = resolve(scriptDir, "..", "src", "plugin.ts")

let source
try {
  source = readFileSync(target, "utf8")
} catch (error) {
  console.error(`check-plugin-size: cannot read ${target}: ${error?.message ?? error}`)
  process.exit(2)
}

const lines = source.split(/\r?\n/)

let inBlockComment = false
let count = 0

for (const raw of lines) {
  const line = raw.trim()

  // Blank line.
  if (line === "") continue

  // Fast-path: we're inside a /* ... */ block that began on a previous line.
  if (inBlockComment) {
    // A block can close on this line. Anything after `*/` on the same line
    // would still count, but our extraction style keeps `*/` on its own line,
    // so treat the whole line as comment content.
    if (line.includes("*/")) {
      inBlockComment = false
    }
    continue
  }

  // Line-level comment forms:
  //   `// ...`           – single-line comment
  //   `/* ... */`        – single-line block comment
  //   `/* ...`           – opens a block that continues on later lines
  //   `* ...`, `*/`      – JSDoc continuation / block close
  if (line.startsWith("//")) continue

  if (line.startsWith("/*")) {
    // If the same line also closes the block, stay outside block mode.
    if (!line.includes("*/", 2)) {
      inBlockComment = true
    }
    continue
  }

  if (line.startsWith("*")) continue

  count += 1
}

if (count > MAX_SOURCE_LINES) {
  console.error(
    `check-plugin-size: plugin.ts has ${count} non-blank, non-comment source lines ` +
      `(budget: ${MAX_SOURCE_LINES}). See codebase-review-remediation Req 1.5.`,
  )
  process.exit(1)
}

console.log(
  `check-plugin-size: plugin.ts has ${count} non-blank, non-comment source lines ` +
    `(budget: ${MAX_SOURCE_LINES}).`,
)
