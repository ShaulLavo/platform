import { watch, type FSWatcher } from 'node:fs'
import path from 'node:path'
import type { SettingsLayerId } from '@workspace/contracts'
import { runDetached } from '../observability'
import {
  editSettingsText,
  parseSettingsDocument,
  readSettingsFile,
  readSettingsFileSync,
  writeSettingsFile,
  type DocumentEdit,
  type SettingsParseError,
} from './json-document'
import { settingsErrors } from './structured-errors'

/**
 * `fs.watch` fires more than once per editor save, and sometimes before the new
 * content has been flushed. Long enough to coalesce a save, short enough that a
 * hand-edit feels live.
 */
const RELOAD_DEBOUNCE_MS = 100

export type LayerContents = {
  readonly raw: Readonly<Record<string, unknown>>
  readonly parseErrors: readonly SettingsParseError[]
  readonly revision: string | null
  readonly text: string
  readonly present: boolean
}

const EMPTY: LayerContents = {
  raw: {},
  parseErrors: [],
  revision: null,
  text: '',
  present: false,
}

/**
 * One settings file, watched.
 *
 * Owns its own watcher rather than reusing the workspace `FileChangeHub`: that
 * hub is scoped to the fs workspace root, which is `/` in development but a
 * `mkdtemp` directory in every test, so a settings file outside it would never
 * emit. A dedicated watcher is a handful of lines and works in both.
 */
export class SettingsFileLayer {
  readonly id: SettingsLayerId
  readonly filePath: string

  private contents: LayerContents = EMPTY
  private watcher: FSWatcher | null = null
  private directoryWatcher: FSWatcher | null = null
  private debounce: ReturnType<typeof setTimeout> | null = null
  private onChange: (() => void) | null = null

  /**
   * The hash of the last text we wrote, so the watch event our own rename
   * produces does not look like an external edit.
   */
  private selfWrittenRevision: string | null = null

  constructor(id: SettingsLayerId, filePath: string) {
    this.id = id
    this.filePath = filePath
  }

  snapshot(): LayerContents {
    return this.contents
  }

  async load(): Promise<void> {
    this.contents = await this.read()
  }

  loadSync(): void {
    this.contents = this.toContents(readSettingsFileSync(this.filePath))
  }

  /**
   * Applies edits to the file's text.
   *
   * Refuses outright when the document has syntax errors: an edit computed from
   * a partial parse tree corrupts the parts that did parse. Read-tolerance and
   * write-refusal are two halves of one rule — shipping only the first gives
   * data loss, only the second gives a settings file nobody can fix.
   *
   * `baseRevision` is the revision the *caller's* values were computed against.
   * Guarding on our own fresh read instead would compare the file to itself and
   * always pass, which silently loses whatever landed in between — and the
   * collection-valued edits are whole-value replaces, so "in between" means the
   * user's other keybinding, not a merge conflict.
   */
  async write(edits: readonly DocumentEdit[], baseRevision?: string | null): Promise<void> {
    const current = await this.read()
    if (current.parseErrors.length > 0) {
      throw settingsErrors.FILE_MALFORMED({
        file: this.filePath,
        detail: current.parseErrors[0].message,
      })
    }

    const text = editSettingsText(current.text, edits)
    const revision = await writeSettingsFile(this.filePath, text, {
      expectedRevision: baseRevision === undefined ? current.revision : baseRevision,
      onRevisionMismatch: () => {
        throw settingsErrors.REVISION_STALE({ file: this.filePath })
      },
    })

    this.selfWrittenRevision = revision
    const parsed = parseSettingsDocument(text)
    this.contents = {
      raw: parsed.values,
      parseErrors: parsed.parseErrors,
      revision,
      text,
      present: true,
    }
    this.rearmWatchers()
  }

  /**
   * Replaces the whole document, for the JSON escape hatch.
   *
   * Unlike `write`, a malformed *current* file is not a reason to refuse — the
   * user is very likely opening the raw editor precisely to fix it. What is
   * refused is malformed *incoming* text, so the hatch cannot be the way a
   * broken document gets saved.
   */
  async writeText(text: string, baseRevision?: string): Promise<void> {
    const incoming = parseSettingsDocument(text)
    if (incoming.parseErrors.length > 0) {
      throw settingsErrors.FILE_MALFORMED({
        file: this.filePath,
        detail: incoming.parseErrors[0].message,
      })
    }

    const revision = await writeSettingsFile(this.filePath, text, {
      expectedRevision: baseRevision ?? (await this.read()).revision,
      onRevisionMismatch: () => {
        throw settingsErrors.REVISION_STALE({ file: this.filePath })
      },
    })

    this.selfWrittenRevision = revision
    this.contents = {
      raw: incoming.values,
      parseErrors: [],
      revision,
      text,
      present: true,
    }
    this.rearmWatchers()
  }

  watch(onChange: () => void): void {
    this.onChange = onChange
    this.watchFile()
    this.watchDirectory()
  }

  close(): void {
    if (this.debounce) clearTimeout(this.debounce)
    this.debounce = null
    this.watcher?.close()
    this.directoryWatcher?.close()
    this.watcher = null
    this.directoryWatcher = null
    this.onChange = null
  }

  private async read(): Promise<LayerContents> {
    return this.toContents(await readSettingsFile(this.filePath))
  }

  private toContents({ text, revision }: { text: string; revision: string | null }): LayerContents {
    if (revision === null) return EMPTY

    const parsed = parseSettingsDocument(text)

    return { raw: parsed.values, parseErrors: parsed.parseErrors, revision, text, present: true }
  }

  private watchFile() {
    try {
      this.watcher = watch(this.filePath, () => this.scheduleReload())
    } catch {
      // No file yet. The directory watcher picks up its creation.
    }
  }

  /**
   * Arms whatever can be armed now.
   *
   * `fs.watch` throws ENOENT synchronously on a missing path, and a workspace
   * layer points at `<root>/.platform/settings.json` — a directory an ordinary
   * repository does not have — so at construction both watchers fail and the
   * layer is deaf for the process's life. Re-arming after every write is what
   * makes the file we just created watchable, so the hand-edit that follows a
   * click is seen.
   */
  private rearmWatchers() {
    if (!this.onChange) return
    if (this.watcher && this.directoryWatcher) return

    this.watcher?.close()
    this.directoryWatcher?.close()
    this.watcher = null
    this.directoryWatcher = null
    this.watchFile()
    this.watchDirectory()
  }

  /**
   * An atomic save replaces the inode, which silently detaches a file watcher —
   * so the directory is watched too. Filtered on the basename because
   * `~/.platform` also holds `fonts/` and `lsp/`, and an LSP install should not
   * wake the settings store.
   */
  private watchDirectory() {
    const directory = path.dirname(this.filePath)
    const basename = path.basename(this.filePath)

    try {
      this.directoryWatcher = watch(directory, (_event, filename) => {
        // Some platforms report a null filename; re-reading is the safe answer.
        if (filename !== null && filename !== basename) return
        this.scheduleReload()
      })
    } catch {
      // No directory yet either; the layer stays empty until something writes.
    }
  }

  private scheduleReload() {
    if (this.debounce) clearTimeout(this.debounce)
    this.debounce = setTimeout(() => {
      this.debounce = null
      runDetached(() => this.reload(), { area: 'settings', layer: this.id, operation: 'reload' })
    }, RELOAD_DEBOUNCE_MS)
  }

  private async reload() {
    const next = await this.read().catch(() => null)
    if (!next) return

    // Suppress exactly one event: the one our own rename produced.
    //
    // Clearing this on every applied reload is load-bearing. Leaving it set
    // means a file that later returns to previously-written content — an undo in
    // the user's editor — matches the stale hash forever, and the store serves a
    // value the file no longer holds with nothing in the logs to say why.
    const isSelfWrite = next.revision !== null && next.revision === this.selfWrittenRevision
    this.selfWrittenRevision = null
    if (isSelfWrite) return

    if (next.revision === this.contents.revision) return

    this.contents = next
    this.onChange?.()
  }
}
