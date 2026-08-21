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

/**
 * `fs.watch` under Bun is not live when it returns: a change landing in the
 * window between arming and the watcher actually attaching is never reported,
 * and the layer then serves the file's old contents for the life of the process.
 *
 * Measured on darwin/Bun 1.3.10, arming a directory watcher and writing the
 * watched file immediately, with the machine saturated: 15/200 events lost at
 * +0ms, 4/200 at +1ms, 1/200 at +5ms, none from +25ms on. The same probe under
 * Node loses nothing at any offset, so this is not something the call site can
 * detect -- `watch()` returns an `FSWatcher` either way.
 *
 * The window is milliseconds and it closes for good, so one catch-up read past
 * it is the whole fix. This is that offset, with two orders of magnitude of
 * margin over the measurement, spent once per layer per process.
 */
const ARMING_CATCHUP_MS = 250

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
  private catchUpTimer: ReturnType<typeof setTimeout> | null = null
  private onChange: (() => void) | null = null
  /**
   * Bumped on every applied change to `contents`, so a reload can tell whether
   * the layer moved underneath its own `await`.
   */
  private generation = 0
  /** Held for the duration of a write, so a reload does not read across it. */
  private writing: Promise<void> | null = null

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
    this.apply(await this.read())
  }

  loadSync(): void {
    this.apply(this.toContents(readSettingsFileSync(this.filePath)))
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
    const done = this.beginWrite()

    try {
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
      this.apply({
        raw: parsed.values,
        parseErrors: parsed.parseErrors,
        revision,
        text,
        present: true,
      })
      this.rearmWatchers()
    } finally {
      done()
    }
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

    const done = this.beginWrite()

    try {
      const revision = await writeSettingsFile(this.filePath, text, {
        expectedRevision: baseRevision ?? (await this.read()).revision,
        onRevisionMismatch: () => {
          throw settingsErrors.REVISION_STALE({ file: this.filePath })
        },
      })

      this.selfWrittenRevision = revision
      this.apply({
        raw: incoming.values,
        parseErrors: [],
        revision,
        text,
        present: true,
      })
      this.rearmWatchers()
    } finally {
      done()
    }
  }

  watch(onChange: () => void): void {
    this.onChange = onChange
    this.watchFile()
    this.watchDirectory()
    this.catchUpOnArming()
  }

  close(): void {
    if (this.debounce) clearTimeout(this.debounce)
    this.debounce = null
    this.stopCatchUp()
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
    this.catchUpOnArming()
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
        // Some platforms report a null filename, and some hand back a Buffer
        // rather than a string; re-reading is the safe answer to the first, and
        // normalizing is the only way the second ever equals `basename`.
        // Comparing the raw value left this watcher deaf for the process's life
        // wherever it is not already a string -- the workspace FileChangeHub
        // normalizes for the same reason.
        const name = filename?.toString() ?? null
        if (name !== null && name !== basename) return
        this.scheduleReload()
      })
    } catch {
      // No directory yet either; the layer stays empty until something writes.
    }
  }

  private apply(next: LayerContents) {
    this.contents = next
    this.generation += 1
  }

  /**
   * Marks a write in flight, and returns its release.
   *
   * A reload waits this out rather than reading across the rename: mid-write it
   * cannot tell the pre- from the post-rename bytes, and the pre-rename ones
   * would be published as an external edit of content the file no longer holds,
   * consuming the echo hash on the way so the write's own event lands as a
   * second one. The debounce alone does not settle it -- it delays a reload, it
   * does not order one against a write -- and the arming catch-up below puts a
   * second reload into the same window, so this is worth naming rather than
   * leaving to luck.
   */
  private beginWrite(): () => void {
    let release = () => {}
    const writing = new Promise<void>((resolve) => {
      release = resolve
    })
    this.writing = writing

    return () => {
      // Only if this write is still the current one: two overlapping writes
      // would otherwise have the first clear the second's marker.
      if (this.writing === writing) this.writing = null
      release()
    }
  }

  /** Covers the window in which the freshly armed watcher is not yet delivering. */
  private catchUpOnArming() {
    this.stopCatchUp()
    if (!this.onChange) return

    const armedRevision = this.contents.revision
    this.catchUpTimer = setTimeout(() => this.catchUp(armedRevision), ARMING_CATCHUP_MS)
  }

  private catchUp(armedRevision: string | null) {
    this.catchUpTimer = null
    // Anything that moved the layer -- a delivered watch event, or our own
    // write -- proves the window is behind us and there is nothing to catch.
    if (this.contents.revision !== armedRevision) return

    // Through the debounce rather than straight into `reload`: an atomic save is
    // a delete and a create, and a read that lands between them publishes an
    // empty document the file never held. Coalescing is what the watch path uses
    // against exactly that, and this is not a second way to notice a change --
    // only another reason to look.
    this.scheduleReload()
  }

  private stopCatchUp() {
    if (this.catchUpTimer) clearTimeout(this.catchUpTimer)
    this.catchUpTimer = null
  }

  private scheduleReload() {
    if (this.debounce) clearTimeout(this.debounce)
    this.debounce = setTimeout(() => {
      this.debounce = null
      runDetached(() => this.reload(), {
        area: 'settings',
        layer: this.id,
        operation: 'reload',
      })
    }, RELOAD_DEBOUNCE_MS)
  }

  private async reload() {
    // Before the generation is captured, so a write that lands first is read as
    // the current state rather than as a change to publish.
    await this.writing
    const generation = this.generation
    const next = await this.read().catch(() => null)
    if (!next) return

    // Discard a read the layer outran. `write` re-reads, edits and renames, so a
    // reload that started before it can resolve holding the pre-write bytes --
    // and would then hand listeners content the file no longer holds, having
    // consumed the echo hash on the way, which delivers the write's own event as
    // an external edit right after it.
    if (generation !== this.generation) return

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

    this.apply(next)
    this.onChange?.()
  }
}
