import { execFileSync } from 'node:child_process'
import { readFileSync, realpathSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { normalizeRegisterableHotkey } from '@tanstack/hotkeys'
import * as built from '@singapor/core'
import { activePlatformKeyBindings } from '../src/keymap/active-bindings.ts'
import { defaultPlatformKeyBindings } from '../src/keymap/default-bindings.ts'
import { editorCommands } from '../src/keymap/editor-commands.ts'
import { buildKeymapTrie, trieStep } from '../src/keymap/utils/keymap-trie.ts'

const webRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const editorPackage = resolve(
  dirname(realpathSync(fileURLToPath(import.meta.resolve('@singapor/core')))),
  '..',
)
const editorRoot = resolve(editorPackage, '../..')
const source = await import(pathToFileURL(resolve(editorPackage, 'src/editor/keymap.ts')).href)
const commandSource = await import(
  pathToFileURL(resolve(editorPackage, 'src/editor/commands.ts')).href
)
const registered = new Set(editorCommands.map((command) => command.id.slice('editor.'.length)))
const commandDeclaration = readFileSync(resolve(editorPackage, 'src/editor/commands.ts'), 'utf8')
  .split('export type EditorCommandId =')[1]
  .split('export type EditorCommandContext')[0]
const commandIds = [
  ...Array.from(commandDeclaration.matchAll(/\| '([^']+)'/gu), (match) => match[1]),
  ...commandSource.EDITOR_FOLD_LEVELS.map((level) => `editor.foldLevel${level}`),
]

function revision(root) {
  return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim()
}

function editorRows(api, platform) {
  return api.defaultEditorKeymapLayers(platform).map((layer) => ({
    id: layer.id,
    source: layer.source ?? null,
    bindings: layer.bindings.map((binding) => ({
      command: binding.command,
      keys: normalizeRegisterableHotkey(binding.hotkey, platform),
      preventDefault: binding.preventDefault ?? null,
      stopPropagation: binding.stopPropagation ?? null,
    })),
  }))
}

function platformReport(platform) {
  const sourceRows = editorRows(source, platform)
  const builtRows = editorRows(built, platform)
  const bindings = defaultPlatformKeyBindings(platform)
  const active = activePlatformKeyBindings(bindings, 'editor')
  const trie = buildKeymapTrie(active, platform)
  const commands = new Set(sourceRows.flatMap((layer) => layer.bindings.map((row) => row.command)))
  return {
    sourceMatchesBuild: JSON.stringify(sourceRows) === JSON.stringify(builtRows),
    sourceRows,
    builtRows,
    missingBoundEditorCommands: [...commands].filter((id) => !registered.has(id)).sort(),
    unboundEditorCommands: commandIds.filter((id) => !commands.has(id)).sort(),
    platformBindings: bindings,
    activeEditorBindings: active,
    trieDropped: trie.dropped,
    reservations: bindings.filter((binding) => binding.command === null),
    platformOnlyCommands: bindings
      .filter((binding) => binding.command && !binding.command.startsWith('editor.'))
      .map((binding) => binding.command),
    benchmark: benchmark(trie),
  }
}

function benchmark(trie) {
  const events = [
    { key: 'k', code: 'KeyK', ctrlKey: true },
    { key: 'k', code: 'KeyK', metaKey: true },
    { key: 'ArrowDown', code: 'ArrowDown' },
    { key: 'Backspace', code: 'Backspace' },
    { key: 'ש', code: 'KeyA', ctrlKey: true },
    { key: 'z', code: 'KeyW', ctrlKey: true },
    { key: 'F24', code: 'F24' },
  ].map((event) => ({ altKey: false, ctrlKey: false, metaKey: false, shiftKey: false, ...event }))
  const iterations = 100_000
  for (let index = 0; index < 10_000; index += 1) trieStep(trie.root, events[index % events.length])
  const results = { miss: 0, arm: 0, run: 0 }
  const started = performance.now()
  for (let index = 0; index < iterations; index += 1) {
    results[trieStep(trie.root, events[index % events.length]).kind] += 1
  }
  return { iterations, elapsedMs: performance.now() - started, results, events }
}

const platforms = Object.fromEntries(
  ['mac', 'windows', 'linux'].map((name) => [name, platformReport(name)]),
)
process.stdout.write(
  `${JSON.stringify(
    {
      platformRevision: revision(webRoot),
      editorRevision: revision(editorRoot),
      missingEditorCommands: commandIds.filter((id) => !registered.has(id)).sort(),
      commandConditions: editorCommands.map((command) => ({
        id: command.id,
        when: command.when ?? null,
      })),
      platforms,
    },
    null,
    2,
  )}\n`,
)
if (Object.values(platforms).some((report) => !report.sourceMatchesBuild)) process.exitCode = 1
