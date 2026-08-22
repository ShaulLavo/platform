import { descriptorFor, type SettingId } from '@workspace/contracts'
import { Button } from '@workspace/ui/components/button'
import { Input } from '@workspace/ui/components/input'
import { XIcon } from '@phosphor-icons/react'
import { useRef, useState } from 'react'

import { useHasWorkspace } from '../hooks/use-has-workspace'
import { useSettings } from '../hooks/use-settings'
import { useSettingsScope } from '../state/scope-store'
import { matchingSettingIds } from '../utils/search'
import { DiagnosticsBanner } from './diagnostics-banner'
import { MalformedBanner } from './malformed-banner'
import { PageActions } from './page-actions'
import { ScopeTabs } from './scope-tabs'
import { SettingsJsonView } from './json-view'
import { SettingRow } from './setting-row'
import { Status } from './status'
import { ViewToggle } from './view-toggle'
import { useSettingsView } from '../state/view-store'
import type { EditorKeymapLayer } from '@singapor/core'
import type { EditorRenderDocument } from '@/features/editor/utils/render-document'
import {
  selectSettingsCategory,
  useSettingsCategory,
} from '@/features/settings/state/category-store'

/**
 * The settings tab: one document, two views.
 *
 * `tabId` and the editor props are threaded through because the JSON view is a
 * real editor bound to this tab — not because the form needs them.
 */
export function SettingsPage({
  editorKeymapLayers = [],
  liveDocument = null,
  rootPath = '',
  tabId = '',
}: {
  editorKeymapLayers?: readonly EditorKeymapLayer[]
  liveDocument?: EditorRenderDocument | null
  rootPath?: string
  tabId?: string
} = {}) {
  const settings = useSettings()
  const scope = useSettingsScope()
  const hasWorkspace = useHasWorkspace()
  const [query, setQuery] = useState('')
  const searchRef = useRef<HTMLInputElement>(null)
  // Above the early returns: hooks cannot sit behind a conditional exit.
  const selectedCategory = useSettingsCategory()
  const view = useSettingsView()
  // The dialog mount has no tab to bind an editor to, so it only has the form.
  const showJson = view === 'json' && tabId !== ''

  if (settings.isPending) return <Status>Loading settings…</Status>
  if (settings.isError) return <Status tone='destructive'>Settings could not be loaded.</Status>

  // `matchingSettingIds` already searches rows rather than keys, so a key edited
  // from another row is folded into its owner here rather than dropped.
  const visible = matchingSettingIds(query).filter(
    (id) => (descriptorFor(id).visibility ?? 'user') !== 'internal',
  )
  const categories = groupByCategory(visible)
  const selectedFile = settings.data.layers.find((layer) => layer.id === scope)?.file ?? null
  // An address can narrow the page to one category. Unknown or absent means all of
  // them, so a stale link degrades to the full page rather than to nothing.
  const shown = selectedCategory
    ? [...categories].filter(([category]) => category === selectedCategory)
    : [...categories]

  return (
    <div className='flex h-full min-h-0 flex-col'>
      <header className='border-border flex shrink-0 flex-col gap-2 border-b px-4 pt-2 pb-4'>
        {/* The tab's own action strip, above the scope tabs: these act on the tab,
            the row below picks which file the tab is showing. */}
        <div className='flex items-center justify-end gap-1'>
          {tabId ? <ViewToggle /> : null}
          <PageActions scope={scope} />
        </div>
        <ScopeTabs hasWorkspace={hasWorkspace} />
        {showJson ? null : (
          <Input
            aria-label='Search settings'
            autoFocus
            ref={searchRef}
            onChange={(event) => setQuery(event.currentTarget.value)}
            placeholder='Search settings'
            value={query}
          />
        )}
        <div className={showJson ? 'hidden' : 'flex flex-wrap items-center gap-2'}>
          {/* `visible` is already query-filtered, so "of N" only says something while a
              category narrows the list further; otherwise it printed the same number twice. */}
          <p className='text-muted-foreground text-xs tabular-nums'>
            {selectedCategory ? `${shownCount(shown)} of ` : ''}
            {visible.length} {visible.length === 1 ? 'setting' : 'settings'}
          </p>
          {/* The only way out of a category a link pinned. Without it the page showed
              one section while the header counted every setting, and nothing in the UI
              could clear it — `selectSettingsCategory` had no caller but the applier. */}
          {selectedCategory ? (
            <Button
              aria-label={`Show all settings, not just ${selectedCategory}`}
              onClick={() => selectSettingsCategory(null)}
              size='sm'
              variant='secondary'
            >
              {selectedCategory}
              <XIcon aria-hidden />
            </Button>
          ) : null}
        </div>
      </header>

      {/* Escape returns to the search box from anywhere in the list, so a
          keyboard user is never more than one key from starting over. Captured
          on the container rather than per row — every control below would
          otherwise need its own handler, and a new widget would silently miss
          it. */}
      {showJson ? (
        <div className='flex min-h-0 flex-1 flex-col'>
          <div className='px-4 pt-4'>
            <MalformedBanner layers={settings.data.layers} />
          </div>
          <div className='min-h-0 flex-1'>
            <SettingsJsonView
              diagnostics={settings.data.diagnostics}
              editorKeymapLayers={editorKeymapLayers}
              file={selectedFile}
              liveDocument={liveDocument}
              rootPath={rootPath}
              scope={scope}
              tabId={tabId}
            />
          </div>
        </div>
      ) : (
        <div
          className='min-h-0 flex-1 overflow-y-auto p-4'
          onKeyDown={(event) => {
            if (event.key !== 'Escape') return
            // Not while a control is mid-interaction: a recorder is capturing, and
            // a text field treats Escape as "discard my edit".
            if (event.defaultPrevented) return

            searchRef.current?.focus()
          }}
        >
          <MalformedBanner layers={settings.data.layers} />
          <DiagnosticsBanner diagnostics={settings.data.diagnostics} />
          {shown.length === 0 ? (
            <Status>{emptySettingsMessage(query, selectedCategory)}</Status>
          ) : (
            shown.map(([category, ids]) => (
              <section className='mb-6' key={category}>
                <h2 className='text-foreground mb-1 text-sm font-semibold'>{category}</h2>
                {ids.map((id) => (
                  <SettingRow id={id} key={id} snapshot={settings.data} />
                ))}
              </section>
            ))
          )}
        </div>
      )}
    </div>
  )
}

/**
 * A category filter and a search query can disagree: the query matches settings that
 * live in another section. Saying so beats an empty page under a header that claims
 * matches exist.
 */
function emptySettingsMessage(query: string, category: string | null) {
  if (category) return `No settings in ${category} match “${query}”.`

  return `No settings match “${query}”.`
}

/** What the list is actually showing, which a pinned category makes smaller. */
function shownCount(shown: readonly (readonly [string, SettingId[]])[]) {
  return shown.reduce((total, [, ids]) => total + ids.length, 0)
}

/**
 * Grouped by the descriptor's own `category`, not by key prefix. Deriving groups
 * from prefixes invents categories nobody chose and reshuffles the page whenever
 * a key is renamed.
 */
function groupByCategory(ids: readonly SettingId[]): Map<string, SettingId[]> {
  const categories = new Map<string, SettingId[]>()

  for (const id of ids) {
    const category = descriptorFor(id).category
    const existing = categories.get(category)
    if (existing) {
      existing.push(id)
      continue
    }

    categories.set(category, [id])
  }

  return categories
}
