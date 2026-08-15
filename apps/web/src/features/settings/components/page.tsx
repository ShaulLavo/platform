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
import { PageActions } from './page-actions'
import { ScopeTabs } from './scope-tabs'
import { SettingRow } from './setting-row'
import { Status } from './status'
import {
  selectSettingsCategory,
  useSettingsCategory,
} from '@/features/settings/state/category-store'

export function SettingsPage() {
  const settings = useSettings()
  const scope = useSettingsScope()
  const hasWorkspace = useHasWorkspace()
  const [query, setQuery] = useState('')
  const searchRef = useRef<HTMLInputElement>(null)
  // Above the early returns: hooks cannot sit behind a conditional exit.
  const selectedCategory = useSettingsCategory()

  if (settings.isPending) return <Status>Loading settings…</Status>
  if (settings.isError) return <Status tone='destructive'>Settings could not be loaded.</Status>

  const visible = matchingSettingIds(query).filter(
    (id) => (descriptorFor(id).visibility ?? 'user') !== 'internal',
  )
  const categories = groupByCategory(visible)
  // An address can narrow the page to one category. Unknown or absent means all of
  // them, so a stale link degrades to the full page rather than to nothing.
  const shown = selectedCategory
    ? [...categories].filter(([category]) => category === selectedCategory)
    : [...categories]

  return (
    <div className='flex h-full min-h-0 flex-col'>
      <header className='border-border flex shrink-0 flex-col gap-2 border-b p-4'>
        <div className='flex flex-wrap items-center justify-between gap-2'>
          <ScopeTabs hasWorkspace={hasWorkspace} />
          <PageActions scope={scope} />
        </div>
        <Input
          aria-label='Search settings'
          autoFocus
          ref={searchRef}
          onChange={(event) => setQuery(event.currentTarget.value)}
          placeholder='Search settings'
          value={query}
        />
        <div className='flex flex-wrap items-center gap-2'>
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
