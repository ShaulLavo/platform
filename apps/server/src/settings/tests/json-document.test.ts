import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  discardStagedSettingsFile,
  editSettingsText,
  parseSettingsDocument,
  readSettingsFile,
  stageSettingsFile,
  tryCommitStagedSettingsFile,
} from '../json-document'

const roots: string[] = []

async function tempFile(name = 'settings.json') {
  const root = await mkdtemp(path.join(tmpdir(), 'settings-doc-'))
  roots.push(root)

  return path.join(root, name)
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

describe('parseSettingsDocument', () => {
  it('treats an empty file as an empty document rather than a parse error', () => {
    for (const text of ['', '   ', '\n\n']) {
      expect(parseSettingsDocument(text)).toEqual({ values: {}, parseErrors: [], keyRanges: {} })
    }
  })

  it('accepts comments and trailing commas', () => {
    const text = `{
      // the editor's font size
      "editor.fontSize": 15,
      "editor.wordWrap": true,
    }`

    expect(parseSettingsDocument(text)).toEqual({
      values: { 'editor.fontSize': 15, 'editor.wordWrap': true },
      parseErrors: [],
      keyRanges: {
        'editor.fontSize': { offset: 40, length: 17 },
        'editor.wordWrap': { offset: 69, length: 17 },
      },
    })
  })

  it('locates the final top-level spelling of each parsed key', () => {
    const text = '{ "editor\\u002efontSize": 15, "editor.fontSize": 18 }'

    expect(parseSettingsDocument(text).keyRanges).toEqual({
      'editor.fontSize': { offset: 30, length: 17 },
    })
  })

  it('recovers what it can from a broken document instead of throwing', () => {
    const { values, parseErrors } = parseSettingsDocument('{ "editor.fontSize": 15, "oops" }')

    expect(values['editor.fontSize']).toBe(15)
    expect(parseErrors.length).toBeGreaterThan(0)
  })

  it('reports a non-object document rather than pretending it parsed', () => {
    const { values, parseErrors } = parseSettingsDocument('[1, 2, 3]')

    expect(values).toEqual({})
    expect(parseErrors.at(-1)?.message).toBe('settings must be a JSON object')
  })
})

describe('editSettingsText', () => {
  it('keeps comments and untouched formatting across an edit', () => {
    const before = `{
  // keep me
  "editor.fontSize": 15,

  /* and me */
  "editor.wordWrap": true
}`
    const after = editSettingsText(before, [{ key: 'editor.fontSize', value: 18 }])

    expect(after).toContain('// keep me')
    expect(after).toContain('/* and me */')
    expect(parseSettingsDocument(after).values).toEqual({
      'editor.fontSize': 18,
      'editor.wordWrap': true,
    })
  })

  it('leaves a key written by another build untouched', () => {
    const before = '{\n  "editor.fontSize": 15,\n  "from.a.newer.build": { "nested": true }\n}'
    const after = editSettingsText(before, [{ key: 'editor.fontSize', value: 18 }])

    expect(parseSettingsDocument(after).values['from.a.newer.build']).toEqual({ nested: true })
  })

  it('removes the key when an edit carries no value, which is what reset does', () => {
    const before = '{\n  "editor.fontSize": 15,\n  "editor.wordWrap": true\n}'
    const after = editSettingsText(before, [{ key: 'editor.fontSize' }])

    expect(parseSettingsDocument(after).values).toEqual({ 'editor.wordWrap': true })
    expect(after).not.toContain('fontSize')
  })

  it('seeds an empty document rather than producing invalid JSON', () => {
    const after = editSettingsText('', [{ key: 'editor.fontSize', value: 18 }])

    expect(parseSettingsDocument(after).values).toEqual({ 'editor.fontSize': 18 })
  })

  it('applies several edits in one pass', () => {
    const after = editSettingsText('{}', [
      { key: 'a.one', value: 1 },
      { key: 'a.two', value: 2 },
      { key: 'a.one' },
    ])

    expect(parseSettingsDocument(after).values).toEqual({ 'a.two': 2 })
  })
})

describe('settings file io', () => {
  it('reports a missing file as empty rather than failing', async () => {
    const filePath = await tempFile()

    expect(await readSettingsFile(filePath)).toEqual({ text: '', revision: null })
  })

  it('creates missing parent directories on write', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'settings-doc-'))
    roots.push(root)
    const filePath = path.join(root, 'nested', 'deeper', 'settings.json')

    const staged = await stageSettingsFile(filePath, '{}\n')
    await tryCommitStagedSettingsFile(staged, undefined)

    expect(await readFile(filePath, 'utf8')).toBe('{}\n')
  })

  it('round-trips the revision it returns', async () => {
    const filePath = await tempFile()
    const staged = await stageSettingsFile(filePath, '{ "a.b": 1 }')
    const result = await tryCommitStagedSettingsFile(staged, undefined)

    expect(result.kind).toBe('committed')
    expect((await readSettingsFile(filePath)).revision).toBe(staged.revision)
  })

  it('refuses when the file changed since the revision was taken', async () => {
    const filePath = await tempFile()
    const first = await stageSettingsFile(filePath, '{ "a.b": 1 }')
    await tryCommitStagedSettingsFile(first, undefined)
    // A hand-edit landing between the store's read and its rename.
    await writeFile(filePath, '{ "a.b": 2 }', 'utf8')

    const staged = await stageSettingsFile(filePath, '{ "a.b": 3 }')
    const result = await tryCommitStagedSettingsFile(staged, first.revision)
    expect(result.kind).toBe('revision-mismatch')
    await discardStagedSettingsFile(staged)
    // The hand-edit survived; the write did not clobber it.
    expect(await readFile(filePath, 'utf8')).toBe('{ "a.b": 2 }')
  })

  it('accepts a write whose expected revision still matches', async () => {
    const filePath = await tempFile()
    const first = await stageSettingsFile(filePath, '{ "a.b": 1 }')
    await tryCommitStagedSettingsFile(first, undefined)

    const second = await stageSettingsFile(filePath, '{ "a.b": 2 }')
    await tryCommitStagedSettingsFile(second, first.revision)

    expect(await readFile(filePath, 'utf8')).toBe('{ "a.b": 2 }')
  })

  it('expects no file when the revision is null', async () => {
    const filePath = await tempFile()

    const staged = await stageSettingsFile(filePath, '{ "a.b": 1 }')
    await tryCommitStagedSettingsFile(staged, null)

    expect((await readSettingsFile(filePath)).text).toBe('{ "a.b": 1 }')
  })

  it('carries the requested mode through the rename', async () => {
    const filePath = await tempFile('secrets.json')

    const staged = await stageSettingsFile(filePath, '{}', 0o600)
    await tryCommitStagedSettingsFile(staged, undefined)

    // A rename carries the temp file's permissions, so writing the mode only on
    // the destination would silently widen them on every save.
    expect((await stat(filePath)).mode & 0o777).toBe(0o600)
  })

  it('leaves no temp file behind', async () => {
    const filePath = await tempFile()
    const staged = await stageSettingsFile(filePath, '{}')
    await tryCommitStagedSettingsFile(staged, undefined)

    const { readdir } = await import('node:fs/promises')
    const entries = await readdir(path.dirname(filePath))

    expect(entries).toEqual(['settings.json'])
  })
})
