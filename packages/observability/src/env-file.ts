import { existsSync, readFileSync } from 'node:fs'
import type { ObservabilityEnv } from './env'

export function observabilityEnvFromFile(filePath: string, base: ObservabilityEnv) {
  if (!existsSync(filePath)) return base

  return {
    ...base,
    ...parseEnvFile(readFileSync(filePath, 'utf8')),
  }
}

export function applyEnvFileOverrides(filePath: string, target: ObservabilityEnv) {
  Object.assign(target, observabilityEnvFromFile(filePath, target))
}

function parseEnvFile(contents: string) {
  const env: ObservabilityEnv = {}

  for (const line of contents.split(/\r?\n/u)) {
    applyEnvLine(env, line)
  }

  return env
}

function applyEnvLine(env: ObservabilityEnv, line: string) {
  const normalized = normalizeEnvLine(line)
  if (!normalized) return

  const separatorIndex = normalized.indexOf('=')
  if (separatorIndex <= 0) return

  const key = normalized.slice(0, separatorIndex).trim()
  if (!key) return

  env[key] = unquoteEnvValue(normalized.slice(separatorIndex + 1).trim())
}

function normalizeEnvLine(line: string) {
  const trimmed = line.trim()
  if (!trimmed || trimmed.startsWith('#')) return ''
  if (trimmed.startsWith('export ')) return trimmed.slice('export '.length).trim()

  return trimmed
}

function unquoteEnvValue(value: string) {
  if (value.length < 2) return value

  const quote = value[0]
  if (quote !== '"' && quote !== "'") return value
  if (value.at(-1) !== quote) return value

  return value.slice(1, -1)
}
