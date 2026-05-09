#!/usr/bin/env node

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
  console.error(
    `check-plugin-size: cannot read ${target}: ${error?.message ?? error}`
  )
  process.exit(2)
}

const lines = source.split(/\r?\n/)

let inBlockComment = false
let count = 0

for (const raw of lines) {
  const line = raw.trim()

  if (line === "") continue

  if (inBlockComment) {
    if (line.includes("*/")) {
      inBlockComment = false
    }
    continue
  }

  if (line.startsWith("//")) continue

  if (line.startsWith("/*")) {
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
      `(budget: ${MAX_SOURCE_LINES}).`
  )
  process.exit(1)
}

console.log(
  `check-plugin-size: plugin.ts has ${count} non-blank, non-comment source lines ` +
    `(budget: ${MAX_SOURCE_LINES}).`
)
