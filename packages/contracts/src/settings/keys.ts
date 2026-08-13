import * as v from 'valibot'
import {
  keybindingOverridesSchema,
  modelRefListSchema,
  providerInstanceConfigsSchema,
} from '../settings'
import { defineSetting, type SettingDescriptor } from './registry'

/**
 * Every setting this build knows about, keyed by its dotted id.
 *
 * Flat keys rather than nested sections: `editor.fontSize` as a first-class key
 * is what makes per-key reset, per-key scope, per-key search and per-key
 * `inspect()` possible at all, and it is the shape a hand-edited settings.json
 * has to have. Sections survive only as `category`, a presentation concern.
 *
 * A key is never registered inert. Every entry here has a consumer wired in the
 * same phase it is added, so the table cannot drift into a list of knobs that
 * write a file nothing reads.
 *
 * PHASE 1 registers only the keys that already exist on disk, so the resolver
 * can be proven against real schemas before the storage layer moves. Phases 3
 * and 5-7 add the rest; see `docs/settings-registry-inventory.md`.
 */
/** Percent, as a whole number, for the surface material knobs. */
const percentSchema = v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(100))

export const SETTINGS_REGISTRY = {
  'workbench.colorTheme': defineSetting({
    schema: v.picklist(['dark', 'light', 'system'] as const),
    default: 'system',
    scope: 'window',
    widget: 'enum',
    category: 'Appearance',
    description: 'Light or dark, or follow the operating system.',
    keywords: ['theme', 'dark', 'light', 'appearance', 'colour'],
  }),
  'workbench.surface.opacity': defineSetting({
    schema: percentSchema,
    default: 80,
    scope: 'window',
    widget: 'number',
    category: 'Appearance',
    description:
      'How opaque panels and sidebars are over the wallpaper. 100 turns the glass material off.',
    keywords: ['transparency', 'opacity', 'glass', 'material', 'blur'],
  }),
  'workbench.surface.contentOpacity': defineSetting({
    schema: percentSchema,
    default: 95,
    scope: 'window',
    widget: 'number',
    category: 'Appearance',
    // Narrower than it sounds: `--content-opacity` has exactly one consumer,
    // the terminal background. Claiming it covers the editor too would be a
    // slider that visibly does nothing there.
    description: 'How opaque the terminal background is.',
    keywords: ['transparency', 'opacity', 'terminal', 'content'],
  }),
  'workbench.surface.blur': defineSetting({
    // Clamped rather than open: at `window` scope a cloned repository can set
    // this, and an unbounded backdrop-filter blur is a real GPU cost.
    schema: v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(40)),
    default: 12,
    scope: 'window',
    widget: 'number',
    category: 'Appearance',
    description: 'Backdrop blur radius, in pixels, behind translucent surfaces.',
    keywords: ['blur', 'glass', 'material', 'vibrancy'],
  }),
  'workbench.surface.saturation': defineSetting({
    schema: v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(400)),
    default: 160,
    scope: 'window',
    widget: 'number',
    category: 'Appearance',
    description: 'Backdrop saturation, as a percentage, behind translucent surfaces.',
    visibility: 'advanced',
    keywords: ['saturation', 'glass', 'material', 'vibrancy'],
  }),
  'workbench.wallpaper.enabled': defineSetting({
    schema: v.boolean(),
    default: true,
    scope: 'window',
    widget: 'boolean',
    category: 'Appearance',
    description: 'Show the desktop wallpaper behind the workbench.',
    keywords: ['wallpaper', 'background', 'desktop'],
  }),
  'editor.fontFamily': defineSetting({
    // A Nerd Font id, not a CSS stack. The server can fetch, subset and cache any
    // of these on demand, so naming one is a font the user actually gets — where
    // a free-text stack naming a font nobody has installed silently does nothing.
    schema: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(64)),
    default: 'JetBrainsMono',
    scope: 'window',
    widget: 'font',
    category: 'Editor',
    description: 'Font for the editor and, unless overridden, the terminal.',
    keywords: ['font', 'typeface', 'monospace', 'nerd font', 'editor'],
  }),
  'editor.fontSize': defineSetting({
    schema: v.pipe(v.number(), v.integer(), v.minValue(6), v.maxValue(72)),
    default: 13,
    scope: 'window',
    widget: 'number',
    category: 'Editor',
    description: 'Editor font size in pixels.',
    keywords: ['font', 'size', 'zoom', 'editor'],
  }),
  'editor.lineHeight': defineSetting({
    schema: v.pipe(v.number(), v.integer(), v.minValue(8), v.maxValue(120)),
    default: 24,
    scope: 'window',
    widget: 'number',
    category: 'Editor',
    description: 'Editor row height in pixels.',
    keywords: ['line', 'height', 'spacing', 'density'],
  }),
  'editor.tabSize': defineSetting({
    schema: v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(16)),
    default: 4,
    scope: 'window',
    widget: 'number',
    category: 'Editor',
    // Rendered width only. The editor package reads `--editor-tab-size` from CSS,
    // which is what makes this live without a cross-repo setter; what it does
    // *not* change is the indentation the editor inserts, which is captured in
    // the Editor constructor and has no setter.
    description: 'Rendered width of a tab character, in spaces.',
    keywords: ['tab', 'indent', 'width', 'spaces'],
  }),
  'editor.diff.viewMode': defineSetting({
    schema: v.picklist(['split', 'stacked'] as const),
    default: 'stacked',
    scope: 'window',
    widget: 'enum',
    category: 'Editor',
    description: 'Show diffs side by side or stacked.',
    keywords: ['diff', 'split', 'stacked', 'compare', 'git'],
  }),
  'terminal.integrated.fontSize': defineSetting({
    schema: v.pipe(v.number(), v.integer(), v.minValue(6), v.maxValue(72)),
    default: 12,
    scope: 'window',
    widget: 'number',
    category: 'Terminal',
    description: 'Terminal font size in pixels.',
    keywords: ['terminal', 'font', 'size'],
  }),
  'terminal.integrated.scrollback': defineSetting({
    schema: v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(500_000)),
    default: 10_000,
    scope: 'window',
    widget: 'number',
    category: 'Terminal',
    description: 'How many lines of output the terminal keeps.',
    keywords: ['terminal', 'scrollback', 'history', 'buffer'],
  }),
  'terminal.integrated.cursorBlinking': defineSetting({
    schema: v.boolean(),
    default: true,
    scope: 'window',
    widget: 'boolean',
    category: 'Terminal',
    description: 'Blink the terminal cursor while the terminal has focus.',
    keywords: ['terminal', 'cursor', 'blink'],
  }),
  'editor.minimap.enabled': defineSetting({
    schema: v.boolean(),
    default: true,
    scope: 'window',
    widget: 'boolean',
    category: 'Editor',
    description: 'Show the minimap beside the editor.',
    // The non-critical plugin list is built once per page load, behind a lazy
    // module-level promise. Claiming this applies live would be a lie the user
    // discovers by toggling it and seeing nothing happen.
    requiresRestart: true,
    keywords: ['minimap', 'overview', 'performance'],
  }),
  'editor.guides.indentation': defineSetting({
    schema: v.boolean(),
    default: true,
    scope: 'window',
    widget: 'boolean',
    category: 'Editor',
    description: 'Draw indentation guides (scope lines).',
    requiresRestart: true,
    keywords: ['indent', 'guides', 'scope lines', 'performance'],
  }),
  'editor.syntaxHighlighting.enabled': defineSetting({
    schema: v.boolean(),
    default: true,
    scope: 'window',
    widget: 'boolean',
    category: 'Editor',
    description: 'Colour code by syntax. Turning this off makes very large files faster.',
    requiresRestart: true,
    keywords: ['syntax', 'highlighting', 'colour', 'performance'],
  }),
  'editor.decode.mode': defineSetting({
    schema: v.picklist(['off', 'diffusion', 'autoregressive', 'parallel', 'token'] as const),
    default: 'off',
    scope: 'window',
    widget: 'enum',
    category: 'Editor',
    description: 'Animate a file as it opens, as if it were being written.',
    requiresRestart: true,
    visibility: 'advanced',
    keywords: ['decode', 'animation', 'diffusion', 'typewriter'],
  }),
  'search.defaultMatchMode': defineSetting({
    schema: v.picklist(['literal', 'regex', 'fuzzy'] as const),
    default: 'literal',
    // Suppression, not execution: this picks between fixed ripgrep flags, so a
    // workspace may set it — with the cross-scope indicator, because a
    // workspace-authored search default changes what the user *and* the agent
    // find.
    scope: 'window',
    widget: 'enum',
    category: 'Search',
    description: 'How a new search interprets the query.',
    keywords: ['search', 'regex', 'literal', 'fuzzy', 'match'],
  }),
  'search.caseSensitive': defineSetting({
    schema: v.boolean(),
    default: false,
    scope: 'window',
    widget: 'boolean',
    category: 'Search',
    description: 'Match case by default.',
    keywords: ['search', 'case', 'sensitive'],
  }),
  'search.wholeWord': defineSetting({
    schema: v.boolean(),
    default: false,
    scope: 'window',
    widget: 'boolean',
    category: 'Search',
    description: 'Match whole words by default.',
    keywords: ['search', 'word', 'boundary'],
  }),
  'search.maxResults': defineSetting({
    schema: v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(200)),
    default: 200,
    scope: 'window',
    widget: 'number',
    category: 'Search',
    // The route caps this at 200 and rejects rather than clamps, so the schema
    // has to agree or a legal-looking setting produces a failed request.
    description: 'How many matches a workspace search returns.',
    keywords: ['search', 'results', 'limit'],
  }),
  'search.quickOpenLimit': defineSetting({
    schema: v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(200)),
    default: 80,
    scope: 'window',
    widget: 'number',
    category: 'Search',
    // A different surface from `search.maxResults`, despite the similar name:
    // this is the file picker, that is the workspace search pane.
    description: 'How many files the file picker lists.',
    visibility: 'advanced',
    keywords: ['search', 'quick open', 'picker', 'files', 'limit'],
  }),
  'chat.defaultRuntimeMode': defineSetting({
    schema: v.picklist(['full-access', 'approval-required', 'auto-accept-edits'] as const),
    default: 'full-access',
    // Execution, unambiguously: this is the permission posture a provider session
    // spawns with. A cloned repository setting it to full-access would silently
    // overrule a user who chose approval-required.
    scope: 'application',
    widget: 'enum',
    category: 'Chat',
    description: 'Permission posture a new session starts in.',
    keywords: ['chat', 'permission', 'approval', 'runtime', 'safety'],
  }),
  'chat.defaultInteractionMode': defineSetting({
    schema: v.picklist(['default', 'plan'] as const),
    default: 'default',
    // Same permission axis: plan mode decides whether the agent writes and execs
    // before the user approves.
    scope: 'application',
    widget: 'enum',
    category: 'Chat',
    description: 'Whether a new session starts in plan mode.',
    keywords: ['chat', 'plan', 'mode', 'interaction'],
  }),
  'logs.defaultTimeRange': defineSetting({
    schema: v.picklist(['15m', '1h', '6h', '24h', 'all'] as const),
    default: '1h',
    scope: 'window',
    widget: 'enum',
    category: 'Logs',
    description: 'Time range the logs view opens on.',
    visibility: 'advanced',
    keywords: ['logs', 'time', 'range', 'filter'],
  }),
  'logs.slowThresholdMs': defineSetting({
    schema: v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(60_000)),
    default: 500,
    scope: 'window',
    widget: 'number',
    category: 'Logs',
    description: 'How many milliseconds counts as a slow operation.',
    visibility: 'advanced',
    keywords: ['logs', 'slow', 'threshold', 'performance'],
  }),
  'window.nativeVibrancy': defineSetting({
    schema: v.boolean(),
    default: false,
    // Machine scope: window chrome is a property of this machine's desktop shell,
    // and a cloned repository must not be able to re-chrome the window.
    scope: 'machine',
    widget: 'boolean',
    category: 'Window',
    description: 'Composite the live macOS desktop behind the window.',
    // Shown rather than hidden, so the answer to "why is this off" is on the page
    // rather than in a commit message.
    readOnlyReason:
      'Deliberately off: transparency forces CEF into off-screen rendering, which measured a 5.5MB CPU copy per paint.',
    keywords: ['window', 'vibrancy', 'transparency', 'desktop', 'macos'],
  }),
  'window.defaultWidth': defineSetting({
    schema: v.pipe(v.number(), v.integer(), v.minValue(480), v.maxValue(10_000)),
    default: 1440,
    scope: 'machine',
    widget: 'number',
    category: 'Window',
    description: 'Width the desktop window opens at.',
    // The desktop shell reads the settings file itself, at startup, before the
    // server is even healthy — so a change lands on the next launch.
    requiresRestart: true,
    keywords: ['window', 'width', 'size', 'desktop'],
  }),
  'window.defaultHeight': defineSetting({
    schema: v.pipe(v.number(), v.integer(), v.minValue(360), v.maxValue(10_000)),
    default: 960,
    scope: 'machine',
    widget: 'number',
    category: 'Window',
    description: 'Height the desktop window opens at.',
    requiresRestart: true,
    keywords: ['window', 'height', 'size', 'desktop'],
  }),
  'files.autoSave': defineSetting({
    schema: v.picklist(['off', 'afterDelay', 'onFocusChange', 'onWindowChange'] as const),
    default: 'off',
    scope: 'window',
    widget: 'enum',
    category: 'Files',
    description: 'Save edited files automatically, and when.',
    keywords: ['autosave', 'save', 'files', 'automatic'],
  }),
  'files.autoSaveDelay': defineSetting({
    schema: v.pipe(v.number(), v.integer(), v.minValue(100), v.maxValue(60_000)),
    default: 1_000,
    scope: 'window',
    widget: 'number',
    category: 'Files',
    description: 'Milliseconds of quiet before an automatic save, when saving after a delay.',
    keywords: ['autosave', 'delay', 'debounce', 'files'],
  }),
  'providers.instances': defineSetting({
    schema: providerInstanceConfigsSchema,
    default: [],
    // Carries `binaryPath` and `environment`, both of which reach process spawn.
    // A cloned repo must never be able to point a provider at another binary.
    scope: 'application',
    widget: 'providers',
    category: 'Providers',
    description: 'Configured provider instances, in the order the picker shows them.',
    keywords: ['provider', 'agent', 'codex', 'claude', 'model'],
  }),
  'models.hidden': defineSetting({
    schema: modelRefListSchema,
    default: [],
    // Steers which credentialed account a turn bills to, so it stays out of a
    // workspace file for the same reason `providers.instances` does.
    scope: 'application',
    widget: 'models',
    category: 'Models',
    description: 'Models the picker must not offer.',
    keywords: ['model', 'hide', 'picker'],
  }),
  'models.order': defineSetting({
    schema: modelRefListSchema,
    default: [],
    scope: 'application',
    widget: 'models',
    category: 'Models',
    description:
      'Explicit leading order for the picker. Models named by neither list stay visible after these, in provider order.',
    keywords: ['model', 'order', 'sort', 'picker'],
  }),
  'keybindings.overrides': defineSetting({
    schema: keybindingOverridesSchema,
    default: {},
    // A binding can invoke any app command, which puts this on the execution
    // side of the scope rule despite looking like pure preference.
    scope: 'application',
    widget: 'record',
    category: 'Keyboard shortcuts',
    description:
      'Command id to hotkey. A missing key keeps the default; an explicit null unbinds the command.',
    // The one key that merges rather than replaces: a later layer should be able
    // to bind a command without dropping every other binding the user set.
    merge: 'record',
    keywords: ['keybinding', 'shortcut', 'hotkey', 'keymap'],
  }),
} satisfies Readonly<Record<string, SettingDescriptor>>

export type SettingsRegistry = typeof SETTINGS_REGISTRY

export type SettingId = keyof SettingsRegistry & string

/**
 * The typed shape of a resolved document, derived from the registry rather than
 * written out by hand. Adding a key to `SETTINGS_REGISTRY` types it everywhere;
 * there is no second list to keep in step.
 */
export type SettingsValues = {
  [K in SettingId]: v.InferOutput<SettingsRegistry[K]['schema']>
}

export type SettingValue<K extends SettingId> = SettingsValues[K]

export const SETTING_IDS = Object.keys(SETTINGS_REGISTRY) as SettingId[]

export function descriptorFor<K extends SettingId>(id: K): SettingsRegistry[K] {
  return SETTINGS_REGISTRY[id]
}

export function isSettingId(id: string): id is SettingId {
  return Object.hasOwn(SETTINGS_REGISTRY, id)
}

/**
 * Registry defaults as a resolved document.
 *
 * Frozen and module-level so the resolver can hand out a default value by
 * reference. Consumers diff object-valued settings by identity — see the
 * `useMemo` on the keymap in `app-command-surface.tsx` — so a fresh `{}` on
 * every resolve would re-register the whole binding table on unrelated writes.
 */
export const DEFAULT_SETTING_VALUES: SettingsValues = Object.freeze(
  Object.fromEntries(
    Object.entries(SETTINGS_REGISTRY).map(([id, descriptor]) => [id, descriptor.default]),
  ),
) as SettingsValues

/**
 * Runtime schema for a whole resolved document.
 *
 * Every key is optional with its registered default, so `{}` parses into a
 * complete value and a document written by a build with fewer keys still reads.
 * The cast is unavoidable — `Object.fromEntries` erases the key/value pairing —
 * but it cannot drift, because `SettingsValues` is itself derived from the same
 * table this is built from.
 */
export const settingsValuesSchema = v.object(
  Object.fromEntries(
    Object.entries(SETTINGS_REGISTRY).map(([id, descriptor]) => [
      id,
      v.optional(descriptor.schema, descriptor.default),
    ]),
  ) as Record<string, v.GenericSchema>,
) as unknown as v.GenericSchema<unknown, SettingsValues>
