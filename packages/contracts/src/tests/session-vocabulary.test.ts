import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { expect, test } from 'vitest'
import allowlist from './session-vocabulary-allowlist.json'

const repositoryRoot = path.resolve(import.meta.dirname, '../../../..')
const ownedRoots = [
  'packages/contracts/src',
  'apps/server/src/orchestration',
  'apps/server/src/provider',
  'apps/web/src/features/chat',
  'apps/web/src/features/chat-mode',
  'apps/web/src/features/address',
]
const noun = ['th', 'read'].join('')
const idName = ['Thread', 'Id'].join('')
const recordName = ['Orchestration', 'Thread'].join('')
const vocabulary = new RegExp(
  String.raw`\b(?:[\w$]*(?:${idName}|${recordName})[\w$]*|${noun}Id|${noun}\.[\w$.]+)\b`,
  'g',
)

test('retains only exact upstream protocol vocabulary across the session domain', () => {
  const actual = ownedRoots.flatMap((root) => sourceFiles(root)).flatMap(symbolsInFile)
  actual.sort(compareMatches)
  expect(actual).toEqual(allowlist)
})

function sourceFiles(relative: string): string[] {
  return readdirSync(path.join(repositoryRoot, relative), { withFileTypes: true }).flatMap(
    (entry) => {
      const file = `${relative}/${entry.name}`
      if (entry.isDirectory()) return sourceFiles(file)
      return /\.tsx?$/.test(entry.name) ? [file] : []
    },
  )
}

function symbolsInFile(file: string) {
  const counts = new Map<string, number>()
  const source = readFileSync(path.join(repositoryRoot, file), 'utf8')
  for (const [symbol] of source.matchAll(vocabulary))
    counts.set(symbol, (counts.get(symbol) ?? 0) + 1)
  return [...counts].map(([symbol, count]) => ({ path: file, symbol, count }))
}

function compareMatches(
  left: { path: string; symbol: string },
  right: { path: string; symbol: string },
) {
  if (left.path !== right.path) return left.path < right.path ? -1 : 1
  if (left.symbol === right.symbol) return 0
  return left.symbol < right.symbol ? -1 : 1
}
