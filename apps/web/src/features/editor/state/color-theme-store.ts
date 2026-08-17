import type { EditorTheme } from '@singapor/core'
import {
  editorThemeFromVscodeTheme,
  loadVscodeThemeRegistration,
  VSCODE_THEMES,
  type VscodeThemeDefinition,
  type VscodeThemeRegistration,
} from '@singapor/core/shiki'
import type { ShikiWorkerThemeRegistration } from '@singapor/core/shiki'
import { Debouncer } from '@tanstack/react-pacer/debouncer'

import {
  builtinEditorTheme,
  editorThemeExists,
  isBuiltinEditorThemeId,
  type BuiltinEditorThemeDefinition,
} from '@/features/editor/utils/theme-catalog'
import { log } from '@/lib/client-logging'
import { clientErrors } from '@/lib/structured-errors'

export type EditorColorMode = 'dark' | 'light'

export type LoadedEditorColorTheme = {
  /** `null` for the built-in themes: they are not backed by a VSCode theme. */
  readonly definition: VscodeThemeDefinition | null
  readonly registration: VscodeThemeRegistration | null
  readonly editorTheme: EditorTheme
}

const EDITOR_COLOR_THEME_STORAGE_KEY = 'platform.editor-color-theme.v1'
const EDITOR_COLOR_THEME_STORAGE_VERSION = 1
/**
 * Running the pointer down the theme list is one decision, not sixty-five.
 * Applying a preview costs the shiki worker a re-tokenize of every open document
 * (~120ms here, and the worker runs them one after another per document), so
 * applying every row the pointer crosses queues far more work than the scrub took
 * to perform and buries the theme the user actually stopped on behind it. The
 * preview state moves immediately — badges and anything reading the selection
 * stay honest — while the reload it triggers waits for the pointer to settle.
 *
 * Kept short deliberately: this is the floor on how fast a preview can feel, so
 * it wants to be just long enough to swallow a scrub and no longer.
 */
const PREVIEW_SETTLE_MS = 60

const DEFAULT_DEFINITION_BY_COLOR_MODE = {
  dark: requireVscodeThemeDefinition('dark-plus'),
  light: requireVscodeThemeDefinition('light-plus'),
} satisfies Record<EditorColorMode, VscodeThemeDefinition>

const vscodeThemeDefinitionById = new Map(VSCODE_THEMES.map((theme) => [theme.id, theme]))
const editorColorThemeListeners = new Set<() => void>()
const loadedThemeById = new Map<string, Promise<LoadedEditorColorTheme>>()
// Registrations cached for synchronous reads (the shiki plugin resolves theme
// registrations at worker-session creation, with no await).
const registrationByIdSync = new Map<string, VscodeThemeRegistration>()

const previewSettle = new Debouncer(() => notifyEditorColorThemeListeners(), {
  wait: PREVIEW_SETTLE_MS,
})

let themeSwitchingPrepared = false
let selectionByColorMode: Record<EditorColorMode, string> | null = null
let activeEditorColorMode: EditorColorMode = 'dark'
// A hover-preview that overlays the persisted selection without touching
// localStorage. Cleared on commit (select) or cancel (palette close).
let previewTheme: { readonly colorMode: EditorColorMode; readonly themeId: string } | null = null

/**
 * The theme id the editor/highlighter should render right now — the hover-preview
 * when one is active, otherwise the committed selection. Used by the shiki
 * plugin's theme resolver and by surfaces that follow live preview.
 */
export function getSelectedEditorThemeId(colorMode: EditorColorMode): string {
  if (previewTheme?.colorMode === colorMode) return previewTheme.themeId
  return readSelectionByColorMode()[colorMode]
}

/**
 * The persisted selection only — ignores any active hover-preview. Used by the
 * palette's "active" badge so it tracks what the user committed, not the row
 * currently under the pointer.
 */
export function getCommittedEditorThemeId(colorMode: EditorColorMode): string {
  return readSelectionByColorMode()[colorMode]
}

export function setSelectedEditorThemeId(colorMode: EditorColorMode, themeId: string) {
  const selection = readSelectionByColorMode()
  if (!editorThemeExists(themeId)) return

  // A commit outranks any preview still waiting to settle; letting that one fire
  // afterwards would reload every editor a second time for the same theme.
  previewSettle.cancel()
  if (selection[colorMode] === themeId && previewTheme === null) return

  previewTheme = null
  selectionByColorMode = { ...selection, [colorMode]: themeId }
  persistSelectionByColorMode(selectionByColorMode)
  notifyEditorColorThemeListeners()
  // The plugin reloads synchronously off the notify above; make sure the worker
  // gets a real registration for the commit, not just the name fallback.
  void ensureRegistrationLoaded(themeId)
}

export function previewEditorTheme(colorMode: EditorColorMode, themeId: string) {
  if (!editorThemeExists(themeId)) return
  if (previewTheme?.colorMode === colorMode && previewTheme.themeId === themeId) return
  if (previewTheme === null && readSelectionByColorMode()[colorMode] === themeId) return

  previewTheme = { colorMode, themeId }
  // Paced, not immediate — see PREVIEW_SETTLE_MS. Rows the pointer only passes
  // over never reach the highlighter.
  previewSettle.maybeExecute()
  // The registration load is not paced: it is a cached dynamic import with no
  // per-document cost, and having it in flight during the settle window is what
  // lets the preview that does land hand the worker a real registration instead
  // of a bare name it can only resolve for ~20 of the bundled themes.
  void ensureRegistrationLoaded(themeId)
}

export function clearEditorThemePreview() {
  previewSettle.cancel()
  if (previewTheme === null) return

  previewTheme = null
  notifyEditorColorThemeListeners()
}

/**
 * Called when the user opens the theme picker, i.e. the first moment switching
 * themes stops being hypothetical. Until then a highlighter session names only
 * the theme it renders, so opening a document never pays for the other
 * sixty-four; from here on sessions name them all, which is what keeps a swap on
 * one already-built highlighter. The notify rebuilds the open sessions right
 * away, so the cost lands while the user is still reaching for the first row
 * rather than inside the first preview.
 *
 * One-way on purpose: a user who has opened the picker once is likely to open it
 * again, and narrowing the set back would spend the same rebuild to undo it.
 */
export function prepareEditorThemeSwitching() {
  if (themeSwitchingPrepared) return

  themeSwitchingPrepared = true
  notifyEditorColorThemeListeners()
}

export function editorThemeSwitchingPrepared(): boolean {
  return themeSwitchingPrepared
}

/**
 * Whether the active selection is painted by shiki. The built-in themes color
 * tree-sitter captures instead, and tree-sitter only emits highlights while no
 * highlighter session exists — so this is what decides whether the shiki
 * highlighter is registered at all.
 */
export function activeEditorThemeUsesShiki(): boolean {
  return !isBuiltinEditorThemeId(getSelectedEditorThemeId(activeEditorColorMode))
}

/**
 * The shiki theme name for the active color mode. Falls back to that mode's
 * default when a built-in theme is selected, so a resolver call that races the
 * highlighter's deregistration can never hand the worker a name it cannot
 * resolve.
 */
export function activeShikiThemeId(): string {
  const themeId = getSelectedEditorThemeId(activeEditorColorMode)
  if (vscodeThemeDefinitionById.has(themeId)) return themeId

  return DEFAULT_DEFINITION_BY_COLOR_MODE[activeEditorColorMode].id
}

/**
 * The registration the shiki worker should use for `themeId`, if it has finished
 * loading. Returns `undefined` for not-yet-loaded themes; callers must fall
 * back to the theme name string and accept the worker may fail to resolve it.
 */
export function getLoadedVscodeThemeRegistration(
  themeId: string,
): ShikiWorkerThemeRegistration | undefined {
  const registration = registrationByIdSync.get(themeId)
  if (!registration?.name) return undefined

  return registration as ShikiWorkerThemeRegistration
}

export function subscribeEditorColorTheme(listener: () => void): () => void {
  editorColorThemeListeners.add(listener)

  return () => {
    editorColorThemeListeners.delete(listener)
  }
}

export function getActiveEditorColorMode(): EditorColorMode {
  return activeEditorColorMode
}

export function setActiveEditorColorMode(colorMode: EditorColorMode) {
  if (activeEditorColorMode === colorMode) return

  activeEditorColorMode = colorMode
  notifyEditorColorThemeListeners()
}

export function loadEditorThemeForSelection(
  colorMode: EditorColorMode,
): Promise<LoadedEditorColorTheme> {
  const themeId = getSelectedEditorThemeId(colorMode)
  const builtin = builtinEditorTheme(themeId)
  if (builtin) return loadBuiltinEditorTheme(builtin)

  const definition =
    vscodeThemeDefinitionById.get(themeId) ?? DEFAULT_DEFINITION_BY_COLOR_MODE[colorMode]

  return loadEditorTheme(definition, colorMode)
}

/**
 * Fire-and-forget load of every bundled theme's registration so hover-preview
 * can switch instantly without waiting on the dynamic import for an unloaded
 * id. Cheap once warm: each `@shikijs/themes/<id>` module is module-cached after
 * its first import, and the registrations land in the sync cache as they come.
 * Silent: it never notifies listeners — reloads are driven by preview/commit
 * notifications, not by warming the cache. Returns a promise so callers can
 * await warmup if needed, but the typical UI caller lets it run in the back.
 */
export function preloadVscodeThemeRegistrations(): Promise<void> {
  return Promise.all(
    VSCODE_THEMES.map((theme) => ensureRegistrationLoaded(theme.id, { silent: true })),
  ).then(() => undefined)
}

/** Test hook: drops in-memory state so the next read hits localStorage again. */
export function resetEditorColorThemeStore() {
  previewSettle.cancel()
  themeSwitchingPrepared = false
  selectionByColorMode = null
  activeEditorColorMode = 'dark'
  previewTheme = null
  loadedThemeById.clear()
  registrationByIdSync.clear()
  editorColorThemeListeners.clear()
}

function loadBuiltinEditorTheme(
  builtin: BuiltinEditorThemeDefinition,
): Promise<LoadedEditorColorTheme> {
  const cached = loadedThemeById.get(builtin.id)
  if (cached) return cached

  const loaded = Promise.resolve({
    definition: null,
    editorTheme: builtin.editorTheme,
    registration: null,
  } satisfies LoadedEditorColorTheme)

  loadedThemeById.set(builtin.id, loaded)
  return loaded
}

function loadEditorTheme(
  definition: VscodeThemeDefinition,
  colorMode: EditorColorMode,
): Promise<LoadedEditorColorTheme> {
  const cached = loadedThemeById.get(definition.id)
  if (cached) return cached

  const loaded = loadVscodeThemeRegistration(definition)
    .then((registration) => {
      registrationByIdSync.set(definition.id, registration)
      // Covers the mode-switch path: the plugin reloaded synchronously when the
      // active mode changed, before this registration had landed.
      if (themeIdIsCurrentlySelected(definition.id)) notifyEditorColorThemeListeners()
      return {
        definition,
        registration,
        editorTheme: editorThemeFromVscodeTheme(registration),
      } satisfies LoadedEditorColorTheme
    })
    .catch((error: unknown) => {
      loadedThemeById.delete(definition.id)
      log.error({
        action: 'editor.color-theme.load_failed',
        area: 'editor',
        colorMode,
        themeId: definition.id,
        error,
      })

      const fallback = DEFAULT_DEFINITION_BY_COLOR_MODE[colorMode]
      if (fallback.id === definition.id) throw error

      return loadEditorTheme(fallback, colorMode)
    })

  loadedThemeById.set(definition.id, loaded)
  return loaded
}

function ensureRegistrationLoaded(
  themeId: string,
  { silent = false }: { readonly silent?: boolean } = {},
): Promise<void> {
  if (registrationByIdSync.has(themeId)) return Promise.resolve()
  // The selection path is already loading this id; wait for it to land in the
  // sync cache rather than starting a duplicate import.
  const inFlight = loadedThemeById.get(themeId)
  if (inFlight) {
    return inFlight.then(() => undefined).catch(() => undefined)
  }

  // Built-in themes carry their palette inline — nothing to import, and nothing
  // the shiki worker would accept.
  const definition = vscodeThemeDefinitionById.get(themeId)
  if (!definition) return Promise.resolve()

  return loadVscodeThemeRegistration(definition)
    .then((registration) => {
      registrationByIdSync.set(themeId, registration)
      // The shiki plugin reloaded synchronously off the preview/commit notify,
      // when no registration was sync-available yet. Re-notify now so it
      // reloads with a real registration instead of going through name lookup.
      // Silent mode (preload) just warms the cache without churning the plugin.
      if (silent) return
      // The selection may have moved on (or the store was reset) while the
      // import was in flight; a stale re-notify would reload editors for a
      // theme nobody is looking at anymore.
      if (!themeIdIsCurrentlySelected(themeId)) return
      notifyEditorColorThemeListeners()
    })
    .catch((error: unknown) => {
      log.error({
        action: 'editor.color-theme.preview_load_failed',
        area: 'editor',
        themeId,
        error,
      })
    })
}

function readSelectionByColorMode(): Record<EditorColorMode, string> {
  if (selectionByColorMode) return selectionByColorMode

  selectionByColorMode = {
    dark: persistedThemeIdForColorMode('dark'),
    light: persistedThemeIdForColorMode('light'),
  }
  return selectionByColorMode
}

function persistedThemeIdForColorMode(colorMode: EditorColorMode): string {
  const fallback = DEFAULT_DEFINITION_BY_COLOR_MODE[colorMode].id
  const persisted = readPersistedSelection()
  const themeId = persisted?.[colorMode]
  if (!themeId || !editorThemeExists(themeId)) return fallback

  return themeId
}

function readPersistedSelection(): Partial<Record<EditorColorMode, string>> | null {
  if (!canUseLocalStorage()) return null

  try {
    const raw = localStorage.getItem(EDITOR_COLOR_THEME_STORAGE_KEY)
    if (!raw) return null

    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return null
    if ((parsed as { version?: unknown }).version !== EDITOR_COLOR_THEME_STORAGE_VERSION)
      return null

    const selection = (parsed as { selection?: unknown }).selection
    if (!selection || typeof selection !== 'object') return null

    return selection as Partial<Record<EditorColorMode, string>>
  } catch {
    return null
  }
}

function persistSelectionByColorMode(selection: Record<EditorColorMode, string>) {
  if (!canUseLocalStorage()) return

  try {
    localStorage.setItem(
      EDITOR_COLOR_THEME_STORAGE_KEY,
      JSON.stringify({ selection, version: EDITOR_COLOR_THEME_STORAGE_VERSION }),
    )
  } catch {
    // A full or unavailable store only costs the selection on next reload.
  }
}

function notifyEditorColorThemeListeners() {
  for (const listener of editorColorThemeListeners) listener()
}

function themeIdIsCurrentlySelected(themeId: string): boolean {
  return (
    getSelectedEditorThemeId('dark') === themeId || getSelectedEditorThemeId('light') === themeId
  )
}

function requireVscodeThemeDefinition(themeId: string): VscodeThemeDefinition {
  const definition = VSCODE_THEMES.find((theme) => theme.id === themeId)
  if (!definition) {
    throw clientErrors.CLIENT_INVARIANT_ERROR({
      message: `Bundled VSCode themes are missing the default theme: ${themeId}`,
    })
  }

  return definition
}

function canUseLocalStorage() {
  return typeof localStorage !== 'undefined'
}
