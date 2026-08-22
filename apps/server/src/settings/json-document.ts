import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import {
  applyEdits,
  getNodeValue,
  modify,
  parseTree,
  printParseErrorCode,
  type FormattingOptions,
  type Node as JsonNode,
  type ParseError,
} from 'jsonc-parser'
import { isRecord } from '@workspace/contracts'
import { textFileVersion } from '../fs/version'

/**
 * Matches how the repo formats its own JSON, so a file the UI writes and a file
 * a person writes do not fight over indentation on every save.
 */
const FORMATTING: FormattingOptions = { tabSize: 2, insertSpaces: true, eol: '\n' }

const PARSE_OPTIONS = {
  allowTrailingComma: true,
  // An empty file is an empty document, not a parse error. It is the most common
  // outcome of a crashed or interrupted editor save, and treating it as a
  // failure would deadlock every write under the refuse-to-write-broken rule.
  allowEmptyContent: true,
} as const

export type SettingsParseError = {
  readonly message: string
  readonly offset: number
  readonly length: number
}

export type SettingsTextRange = {
  readonly offset: number
  readonly length: number
}

export type ParsedSettingsDocument = {
  readonly values: Record<string, unknown>
  readonly parseErrors: readonly SettingsParseError[]
  readonly keyRanges: Readonly<Record<string, SettingsTextRange>>
}

export type SettingsFileContents = {
  readonly text: string
  /** Content hash of the bytes on disk; `null` when the file does not exist. */
  readonly revision: string | null
}

export type DocumentEdit = {
  readonly key: string
  /** Omitted removes the key, which is what a reset does. */
  readonly value?: unknown
}

/**
 * Tolerant read.
 *
 * Comments and trailing commas are allowed, and a syntax error yields whatever
 * the parser could recover plus the errors — never a throw and never an empty
 * wipe. The caller decides what to do with a partial document; the store falls
 * back per key so one bad line cannot take out the keybindings the running app
 * depends on.
 */
export function parseSettingsDocument(text: string): ParsedSettingsDocument {
  if (text.trim() === '') return { values: {}, parseErrors: [], keyRanges: {} }

  const errors: ParseError[] = []
  const root = parseTree(text, errors, PARSE_OPTIONS)
  const parsed: unknown = root ? getNodeValue(root) : undefined
  const parseErrors = errors.map(toParseError)

  if (!isRecord(parsed)) {
    const notAnObject = { message: 'settings must be a JSON object', offset: 0, length: 0 }

    return { values: {}, parseErrors: [...parseErrors, notAnObject], keyRanges: {} }
  }

  return { values: parsed, parseErrors, keyRanges: topLevelKeyRanges(root) }
}

function topLevelKeyRanges(root: JsonNode | undefined): Record<string, SettingsTextRange> {
  if (root?.type !== 'object') return {}

  const ranges: Record<string, SettingsTextRange> = {}
  for (const property of root.children ?? []) {
    const key = property.children?.[0]
    if (key?.type !== 'string') continue
    if (typeof key.value !== 'string') continue

    ranges[key.value] = { offset: key.offset, length: key.length }
  }

  return ranges
}

/**
 * Applies edits to the document text, preserving everything it does not touch.
 *
 * Text in, text out — never a re-serialized parse result. Parsing, mutating and
 * re-stringifying would drop comments, reorder keys, and silently delete any key
 * this build does not know about, which is the opposite of the round-trip
 * guarantee the provider config already makes.
 */
export function editSettingsText(text: string, edits: readonly DocumentEdit[]): string {
  let next = text.trim() === '' ? '{}\n' : text

  for (const edit of edits) {
    const value = Object.hasOwn(edit, 'value') ? edit.value : undefined
    next = applyEdits(next, modify(next, [edit.key], value, { formattingOptions: FORMATTING }))
  }

  return next
}

/**
 * The boot read, done synchronously.
 *
 * `createApp` is synchronous and fifteen call sites depend on that, while the
 * provider registry has to be built from settings before the app finishes
 * constructing. One small file read at startup is a far smaller cost than making
 * app construction async everywhere.
 */
export function readSettingsFileSync(filePath: string): SettingsFileContents {
  try {
    const text = readFileSync(filePath, 'utf8')

    return { text, revision: textFileVersion(text) }
  } catch (error) {
    if (isMissingFile(error)) return { text: '', revision: null }
    throw error
  }
}

/** `null` when the file does not exist — an untouched install, not an error. */
export async function readSettingsFile(filePath: string): Promise<SettingsFileContents> {
  try {
    const text = await readFile(filePath, 'utf8')

    return { text, revision: textFileVersion(text) }
  } catch (error) {
    if (isMissingFile(error)) return { text: '', revision: null }
    throw error
  }
}

export type WriteSettingsFileOptions = {
  /**
   * The revision the edits were computed against. The write is refused when the
   * file moved underneath, so a hand-edit landing between our read and our
   * rename is reported rather than silently overwritten.
   */
  readonly expectedRevision?: string | null
  /** Secrets pass `0o600`; the settings document takes the default. */
  readonly mode?: number
  readonly onRevisionMismatch: (found: string | null) => never
}

/**
 * Atomic write: temp file in the target directory, then rename.
 *
 * The temp file is created with the final mode rather than chmod-ed afterwards,
 * because a rename carries the temp file's permissions — writing 0600 only on
 * the destination would silently widen them on every save.
 */
export async function writeSettingsFile(
  filePath: string,
  text: string,
  options: WriteSettingsFileOptions,
): Promise<string> {
  await mkdir(path.dirname(filePath), { recursive: true })
  await assertRevisionUnchanged(filePath, options)

  const temporary = path.join(
    path.dirname(filePath),
    `.${path.basename(filePath)}.${randomUUID()}.tmp`,
  )

  try {
    await writeFile(temporary, text, { encoding: 'utf8', mode: options.mode })
    await rename(temporary, filePath)

    return textFileVersion(text)
  } catch (error) {
    await rm(temporary, { force: true }).catch(() => {})
    throw error
  }
}

/**
 * Re-read immediately before the rename rather than trusting the revision the
 * caller read earlier. The gap between a store's read and its write is exactly
 * where a hand-edit lands, and a counter-style revision cannot see it.
 */
async function assertRevisionUnchanged(filePath: string, options: WriteSettingsFileOptions) {
  if (options.expectedRevision === undefined) return

  const current = await currentRevision(filePath)
  if (current === options.expectedRevision) return

  options.onRevisionMismatch(current)
}

async function currentRevision(filePath: string): Promise<string | null> {
  try {
    await stat(filePath)

    return textFileVersion(await readFile(filePath, 'utf8'))
  } catch (error) {
    if (isMissingFile(error)) return null
    throw error
  }
}

function toParseError(error: ParseError): SettingsParseError {
  return {
    message: printParseErrorCode(error.error),
    offset: error.offset,
    length: error.length,
  }
}

function isMissingFile(error: unknown): boolean {
  return isRecord(error) && error.code === 'ENOENT'
}
