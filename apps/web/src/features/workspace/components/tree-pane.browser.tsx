import '@workspace/ui/globals.css'
import type { GitStatusEntry } from '@workspace/tree/utils/publicTypes'
import { useState } from 'react'
import { flushSync } from 'react-dom'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, expect, test } from 'vitest'

import { EditorStateProvider } from '@/features/editor/providers/state-provider'
import { useEditorCommands } from '@/features/editor/state/commands'
import { useEditorWorkspaceState } from '@/features/editor/state/workspace-state'
import { TreePane } from '@/features/workspace/components/tree-pane'
import {
  FileTreeActionsContext,
  type FileTreeActions,
} from '@/features/workspace/providers/actions-context'
import { FocusProvider } from '@/features/workspace/providers/focus-provider'
import { TreeCommandsContext } from '@/features/workspace/providers/tree-commands-context'
import { createTreeCommandStore } from '@/features/workspace/state/tree-command-store'
import type { TreeEntry, TreeResult } from '@/lib/file-system-types'
import { treeModel } from '@/lib/tree-model'
import { AppProviders, createTestQueryClient, seedBootMirrorTheme } from '../../../../test/render'

const ROOT_PATH = '/repo'
const DEEP_FILE_PATH = `${ROOT_PATH}/src/file-79.ts`
const UNLOADED_FILE_PATH = `${ROOT_PATH}/src/unloaded/deep.ts`

const fileTreeActions: FileTreeActions = {
  loadDirectory: () => {},
  prefetchDirectory: () => {},
  publishVisibleItemCount: () => {},
}

let root: Root | null = null

afterEach(() => {
  flushSync(() => root?.unmount())
  root = null
  document.body.replaceChildren()
  localStorage.clear()
})

test('the live navigator retains search, consumes queued focus, reveals, and creates at root', async () => {
  const commandStore = createTreeCommandStore()
  commandStore.request('focus', ROOT_PATH)
  mountTreePane(commandStore)

  const shadowRoot = await fileTreeShadowRoot()
  await expect.poll(() => activeTreePath(shadowRoot)).toBe('src/')

  clickToolbarButton('Filter files')
  const searchInput = searchField(shadowRoot)
  await expect.poll(() => shadowRoot.activeElement).toBe(searchInput)
  typeSearch(searchInput, 'file-7')
  await expect.poll(() => matchCountText()).toBe('11 matches')

  clickToolbarButton('Outside tree')
  expect(searchInput.value).toBe('file-7')
  expect(searchContainer(shadowRoot).dataset.open).toBe('true')

  const firstMatch = searchInput.getAttribute('aria-activedescendant')
  expect(firstMatch).not.toBeNull()
  clickToolbarButton('Next file match')
  await expect.poll(() => searchInput.getAttribute('aria-activedescendant')).not.toBe(firstMatch)
  clickToolbarButton('Previous file match')
  await expect.poll(() => searchInput.getAttribute('aria-activedescendant')).toBe(firstMatch)

  clickToolbarButton('Clear file filter')
  await expect.poll(() => searchInput.value).toBe('')
  await expect.poll(() => shadowRoot.activeElement).toBe(searchInput)
  expect(document.querySelector('output[aria-live="polite"]')).toBeNull()

  clickToolbarButton('Close file filter')
  await expect.poll(() => searchContainer(shadowRoot).dataset.open).toBe('false')
  clickToolbarButton('Filter files')
  await expect.poll(() => shadowRoot.activeElement).toBe(searchInput)
  searchInput.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Escape' }))
  await expect.poll(() => searchContainer(shadowRoot).dataset.open).toBe('false')

  clickToolbarButton('Select deep file')
  await expect.poll(() => selectedFilePathText()).toBe(DEEP_FILE_PATH)
  clickToolbarButton('Reveal active file in tree')
  await expect.poll(() => activeTreePath(shadowRoot)).toBe('src/file-79.ts')
  expect(treeScroller(shadowRoot).scrollTop).toBeGreaterThan(0)

  const treeHost = document.querySelector('file-tree-container')
  clickToolbarButton('Mark deep file modified')
  await expect
    .poll(() => rowButton(shadowRoot, 'src/file-79.ts')?.dataset.itemGitStatus)
    .toBe('modified')
  const scroller = treeScroller(shadowRoot)
  scroller.scrollTop = 0
  scroller.dispatchEvent(new Event('scroll', { bubbles: true }))
  await expect.poll(() => treeRow(shadowRoot, 'src/')?.dataset.itemContainsGitChange).toBe('true')
  clickToolbarButton('Clear git status')
  await expect
    .poll(() => treeRow(shadowRoot, 'src/')?.dataset.itemContainsGitChange)
    .toBeUndefined()
  clickToolbarButton('Reveal active file in tree')
  await expect
    .poll(() => rowButton(shadowRoot, 'src/file-79.ts')?.dataset.itemGitStatus)
    .toBeUndefined()
  expect(document.querySelector('file-tree-container')).toBe(treeHost)

  clickToolbarButton('Select unloaded file')
  await expect.poll(() => selectedFilePathText()).toBe(UNLOADED_FILE_PATH)
  clickToolbarButton('Reveal active file in tree')
  await expect.poll(() => activeTreePath(shadowRoot)).toBe('src/')

  clickToolbarButton('New file at workspace root')
  await expect.poll(() => renameField(shadowRoot)).toBeTruthy()
  const renameInput = renameField(shadowRoot)!
  expect(renameInput.value).toBe('untitled')
  renameInput.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Escape' }))
  await expect.poll(() => renameField(shadowRoot)).toBeNull()

  clickToolbarButton('New folder at workspace root')
  await expect.poll(() => renameField(shadowRoot)?.value).toBe('new folder')
  renameField(shadowRoot)?.dispatchEvent(
    new KeyboardEvent('keydown', { bubbles: true, key: 'Escape' }),
  )
  await expect.poll(() => renameField(shadowRoot)).toBeNull()
})

function TreePaneHarness() {
  const { selectFile } = useEditorCommands()
  const selectedFilePath = useEditorWorkspaceState((state) => state.selectedFilePath)
  const [gitStatus, setGitStatus] = useState<readonly GitStatusEntry[]>([])
  const [model] = useState(navigatorModel)

  return (
    <>
      <button aria-label='Outside tree' type='button'>
        Outside
      </button>
      <button
        aria-label='Select deep file'
        type='button'
        onClick={() => selectFile(DEEP_FILE_PATH)}
      >
        Select deep file
      </button>
      <button
        aria-label='Select unloaded file'
        type='button'
        onClick={() => selectFile(UNLOADED_FILE_PATH)}
      >
        Select unloaded file
      </button>
      <button
        aria-label='Mark deep file modified'
        type='button'
        onClick={() => setGitStatus([{ path: 'src/file-79.ts', status: 'modified' }])}
      >
        Mark modified
      </button>
      <button aria-label='Clear git status' type='button' onClick={() => setGitStatus([])}>
        Clear status
      </button>
      <output data-selected-file-path>{selectedFilePath}</output>
      <div className='h-[180px] w-[360px]'>
        <TreePane
          gitStatus={gitStatus}
          rootPath={ROOT_PATH}
          state={{ data: model, status: 'ready' }}
        />
      </div>
    </>
  )
}

function mountTreePane(commandStore: ReturnType<typeof createTreeCommandStore>) {
  seedBootMirrorTheme('dark')
  const host = document.createElement('main')
  document.body.append(host)
  root = createRoot(host)

  flushSync(() => {
    root?.render(
      <AppProviders queryClient={createTestQueryClient()}>
        <EditorStateProvider>
          <FocusProvider>
            <TreeCommandsContext value={commandStore}>
              <FileTreeActionsContext value={fileTreeActions}>
                <TreePaneHarness />
              </FileTreeActionsContext>
            </TreeCommandsContext>
          </FocusProvider>
        </EditorStateProvider>
      </AppProviders>,
    )
  })
}

function navigatorModel() {
  const children = Array.from({ length: 80 }, (_, index) =>
    file(`${ROOT_PATH}/src/file-${index}.ts`),
  )
  const model = treeModel(tree(ROOT_PATH, [directory(`${ROOT_PATH}/src`, children)]), ROOT_PATH)
  model.loadedDirectoryPaths.add('src')

  return model
}

function tree(path: string, entries: TreeEntry[]): TreeResult {
  return { entries, path }
}

function directory(path: string, children: TreeEntry[]): TreeEntry {
  return { ...entry(path), children, type: 'directory' }
}

function file(path: string): TreeEntry {
  return { ...entry(path), type: 'file' }
}

function entry(path: string) {
  return {
    birthtimeMs: 1,
    mtimeMs: 1,
    name: path.split('/').at(-1) ?? path,
    path,
    size: 1,
    version: `browser:1:${path}`,
  }
}

async function fileTreeShadowRoot() {
  await expect.poll(() => document.querySelector('file-tree-container')?.shadowRoot).toBeTruthy()

  return document.querySelector('file-tree-container')!.shadowRoot!
}

function clickToolbarButton(label: string) {
  const button = document.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)
  expect(button).not.toBeNull()
  button?.click()
}

function searchField(shadowRoot: ShadowRoot) {
  const input = shadowRoot.querySelector<HTMLInputElement>('[data-file-tree-search-input]')
  expect(input).not.toBeNull()

  return input!
}

function renameField(shadowRoot: ShadowRoot) {
  return shadowRoot.querySelector<HTMLInputElement>('[data-item-rename-input]')
}

function rowButton(shadowRoot: ShadowRoot, path: string) {
  return shadowRoot.querySelector<HTMLButtonElement>(
    `button[data-item-path="${path}"]:not([data-file-tree-sticky-row="true"])`,
  )
}

function treeRow(shadowRoot: ShadowRoot, path: string) {
  return shadowRoot.querySelector<HTMLButtonElement>(`button[data-item-path="${path}"]`)
}

function searchContainer(shadowRoot: ShadowRoot) {
  return shadowRoot.querySelector<HTMLElement>('[data-file-tree-search-container]')!
}

function treeScroller(shadowRoot: ShadowRoot) {
  return shadowRoot.querySelector<HTMLElement>('[data-file-tree-virtualized-scroll="true"]')!
}

function typeSearch(input: HTMLInputElement, value: string) {
  input.value = value
  input.dispatchEvent(new InputEvent('input', { bubbles: true, data: value }))
}

function matchCountText() {
  return document.querySelector('output[aria-live="polite"]')?.textContent?.trim() ?? null
}

function selectedFilePathText() {
  return document.querySelector('output[data-selected-file-path]')?.textContent ?? null
}

function activeTreePath(shadowRoot: ShadowRoot) {
  const activeElement = shadowRoot.activeElement
  if (!(activeElement instanceof HTMLElement)) return null

  return activeElement.dataset.itemPath ?? null
}
