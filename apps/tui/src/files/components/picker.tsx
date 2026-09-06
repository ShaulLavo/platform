import { useEffect, useEffectEvent, useRef, useState, useSyncExternalStore } from 'react'
import { isDirectoryEntry } from '@workspace/contracts'
import { useKeyboard, useTerminalDimensions } from '@opentui/react'
import type { KeyValueStorage } from '@workspace/client-core/storage'
import type { SettingsOwner } from '@workspace/client-core/settings/owner'
import { absolutePickerPath } from '@workspace/client-core/files/path-input'

import { useCommands } from '@/commands/hooks/use-commands'
import { useCommandFocus } from '@/commands/hooks/use-command-focus'
import { Dialog } from '@/components/dialog'
import { Prompt } from '@/components/prompt'
import { Select } from '@/components/select'
import { LoadingState } from '@/components/loading-state'
import { EmptyState } from '@/components/empty-state'
import type { SettingsSession } from '@/connection/state/session'
import { connectionFailure } from '@/connection/utils/failure'
import { FilePreview } from '@/files/components/preview'
import { createFileBrowser } from '@/files/state/browser'
import {
  fileOptions,
  nextPickerFocus,
  parentDirectory,
  pickerFocusHint,
  type PickerFocus,
  type FileLocation,
} from '@/files/utils/list'
import type { Theme } from '@/theme/utils/theme'
import { useSettingValue } from '@/settings/hooks/use-setting-value'

export function FilePicker({
  session,
  storage,
  owner,
  theme,
  onClose,
  initialPath,
  initialQuery = '',
  onLocationChange,
}: {
  session: SettingsSession
  storage: KeyValueStorage
  owner: SettingsOwner
  theme: Theme
  onClose: () => void
  initialPath?: string
  initialQuery?: string
  onLocationChange?: (location: FileLocation) => void
}) {
  const [browser] = useState(() => createFileBrowser(session.client, storage))
  const state = useSyncExternalStore(browser.subscribe, browser.getSnapshot)
  const [query, setQuery] = useState(initialQuery)
  const [pathDraft, setPathDraft] = useState<{ directory: string; value: string } | null>(null)
  const [inputError, setInputError] = useState<string | null>(null)
  const [focus, setFocus] = useState<PickerFocus>('filter')
  const [selection, setSelection] = useState<{ directory: string; index: number } | null>(null)
  const latestSelection = useRef(selection)
  const directory = absolutePickerPath(state.path, state.paths?.workspaceRoot ?? '')
  const pathInput = pathDraft?.directory === directory ? pathDraft.value : directory
  const selected = selection?.directory === directory ? selection.index : 0
  const setSelected = (index: number) => {
    // Enter can arrive before React commits the native list's arrow selection.
    latestSelection.current = { directory, index }
    setSelection(latestSelection.current)
  }
  const commands = useCommands()
  const { height, width } = useTerminalDimensions()
  const wide = width >= 90
  const showPlaces = !wide && focus === 'places'
  const showPreview = !wide && !showPlaces && state.preview.kind !== 'empty'
  const showFiles = !showPlaces && !showPreview
  const scope = commands.focus.getSnapshot().scope
  const showHidden = useSettingValue(owner, 'files.showHidden')
  const notifyLocation = useEffectEvent((location: FileLocation) => onLocationChange?.(location))
  useEffect(() => {
    if (state.location) notifyLocation(state.location)
  }, [state.location])
  const dismiss = () => {
    if (showPreview) {
      browser.clearPreview()
      return
    }
    onClose()
  }
  useCommandFocus(
    {
      ...scope,
      id: 'file-picker-filter',
      area: 'dialog',
      textEntry: true,
      overlay: true,
      focus: () => {
        setFocus('filter')
        return true
      },
    },
    focus === 'filter',
  )
  useCommandFocus(
    {
      ...scope,
      id: 'file-picker-path',
      area: 'dialog',
      textEntry: true,
      overlay: true,
      focus: () => {
        setFocus('path')
        return true
      },
    },
    focus === 'path',
  )
  useCommandFocus(
    {
      ...scope,
      id: 'file-picker-places',
      area: 'dialog',
      textEntry: false,
      overlay: true,
      focus: () => {
        setFocus('places')
        return true
      },
    },
    focus === 'places',
  )
  useEffect(() => {
    void browser.open(initialPath)
  }, [browser, initialPath])
  useEffect(() => () => browser.dispose(), [browser])
  async function completePath() {
    try {
      const completed = await browser.completePath(pathInput)
      setPathDraft((current) => {
        const value = current?.directory === directory ? current.value : directory
        return value === pathInput ? { directory, value: completed } : current
      })
    } catch (error) {
      setInputError(connectionFailure(error).message)
    }
  }
  useKeyboard((event) => {
    if (event.defaultPrevented) return
    if (event.name === 'tab' && focus === 'path' && !event.shift) {
      event.preventDefault()
      void completePath()
      return
    }
    if (event.name === 'tab') {
      event.preventDefault()
      setFocus((current) => nextPickerFocus(current, event.shift ? -1 : 1))
      return
    }
    if (event.name !== 'backspace' || focus !== 'filter' || query) return
    event.preventDefault()
    void browser.navigate(parentDirectory(state.path))
  })
  const entries = state.listing.kind === 'ready' ? state.listing.entries : []
  const options = fileOptions(entries, query, showHidden)
  const places = state.paths
    ? [
        { name: 'Home', description: state.paths.homePath, value: '~' },
        {
          name: 'Start folder',
          description: state.paths.defaultPath,
          value: absolutePickerPath(state.paths.defaultPath, state.paths.workspaceRoot),
        },
        {
          name: 'Server root',
          description: state.paths.workspaceRoot,
          value: state.paths.workspaceRoot,
        },
      ]
    : []
  const select = (index: number, filter = query) => {
    const rows = filter === query ? options : fileOptions(entries, filter, showHidden)
    const entry = rows[index]?.value
    if (!entry) return
    if (isDirectoryEntry(entry)) setQuery('')
    void browser.select(entry)
  }
  const enterPath = (input: string) => {
    const failure = browser.enterPath(input)
    setInputError(failure)
    if (!failure) setQuery('')
  }
  return (
    <Dialog
      title='Files'
      theme={theme}
      onClose={dismiss}
      width={110}
      height={height - 2}
      footer={`${pickerFocusHint(focus)}${showPreview ? '' : ' · ↑↓ select · Enter open'}`}
      dismissLabel={showPreview ? 'back to files' : 'close'}
    >
      <box flexDirection='column' flexGrow={1} minHeight={0} gap={1}>
        <box flexDirection='column' flexShrink={0}>
          <box flexDirection='row' height={1}>
            <text width={7} fg={focus === 'path' ? theme.primary : theme.mutedForeground}>
              Path
            </text>
            <box flexGrow={1} minWidth={0}>
              <Prompt
                id='file-picker-path'
                value={pathInput}
                onChange={(value) => {
                  setPathDraft({ directory, value })
                  setInputError(null)
                }}
                onSubmit={enterPath}
                focused={focus === 'path'}
                theme={theme}
                placeholder='Folder path…'
              />
            </box>
          </box>
          <box flexDirection='row' height={1}>
            <text width={7} fg={focus === 'filter' ? theme.primary : theme.mutedForeground}>
              Filter
            </text>
            <box flexGrow={1} minWidth={0}>
              <Prompt
                id='file-picker-filter'
                value={query}
                onChange={(value) => {
                  setQuery(value)
                  setSelected(0)
                  browser.clearPreview()
                }}
                onSubmit={(value) => {
                  const current = latestSelection.current
                  const index =
                    value === query && current?.directory === directory ? current.index : 0
                  select(index, value)
                }}
                focused={focus === 'filter'}
                theme={theme}
                placeholder='Filter files…'
              />
            </box>
          </box>
        </box>
        {inputError && (
          <text fg={theme.destructive} flexShrink={0}>
            {inputError}
          </text>
        )}
        <box flexDirection='row' gap={2} flexGrow={1} minHeight={0} overflow='hidden'>
          {(wide || showPlaces) && (
            <Select
              id='file-picker-places'
              options={places}
              focused={focus === 'places'}
              width={wide ? 18 : '100%'}
              height='100%'
              onSelect={(index) => {
                const place = places[index]
                if (!place) return
                enterPath(place.value)
                setFocus('filter')
              }}
              showDescription={false}
              textColor={theme.mutedForeground}
              selectedTextColor={theme.primary}
              selectedBackgroundColor={theme.accent}
            />
          )}
          {(wide || showFiles) && (
            <box flexDirection='column' flexGrow={1} flexBasis={0} minWidth={0} minHeight={0}>
              {state.listing.kind === 'loading' && (
                <LoadingState theme={theme} label='Reading folder…' />
              )}
              {state.listing.kind === 'failed' && (
                <text fg={theme.destructive}>{state.listing.message}</text>
              )}
              {state.listing.kind === 'ready' && options.length === 0 && (
                <EmptyState
                  title='No matching files'
                  description='Try another folder or a shorter filter.'
                  theme={theme}
                />
              )}
              {state.listing.kind === 'ready' && options.length > 0 && (
                <Select
                  options={options}
                  selectedIndex={selected}
                  onChange={setSelected}
                  onSelect={(index) => select(index)}
                  navigateFromInput={focus === 'filter'}
                  flexGrow={1}
                  minHeight={0}
                  textColor={theme.foreground}
                  selectedTextColor={theme.primary}
                  selectedBackgroundColor={theme.accent}
                  showDescription={false}
                />
              )}
            </box>
          )}
          {(wide || showPreview) && (
            <FilePreview preview={state.preview} theme={theme} lines={Math.max(1, height - 13)} />
          )}
        </box>
      </box>
    </Dialog>
  )
}
