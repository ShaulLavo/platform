import { useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react'
import { commandById, type CommandId } from '@workspace/client-core/commands/catalog'

import { useCommands } from '@/commands/hooks/use-commands'
import { useCommandHandlers } from '@/commands/hooks/use-command-handlers'
import { useThemeCommands } from '@/commands/hooks/use-theme-commands'
import type { FocusToken } from '@/commands/state/focus'
import { CommandPalette } from '@/commands/components/palette'
import { ShortcutHelp } from '@/commands/components/help'
import { SettingsBrowser } from '@/settings/components/browser'
import { FilePicker } from '@/files/components/picker'
import { AddressDialog } from '@/navigation/components/address'
import { createHistory } from '@/navigation/state/history'
import { fileAddress, settingsAddress } from '@/navigation/utils/address'
import type { DialogKind, Overlay } from '@/navigation/utils/overlay'
import type { SessionState, SettingsSession } from '@/connection/state/session'
import type { Theme } from '@/theme/utils/theme'
import { useHostActions } from '@/host/hooks/use-host-actions'

export function Workspace({
  session,
  state,
  theme,
}: {
  session: SettingsSession
  state: Extract<SessionState, { kind: 'ready' }>
  theme: Theme
}) {
  const [overlay, setOverlay] = useState<Overlay | null>(null)
  const [editing, setEditing] = useState(false)
  const [settingsQuery, setSettingsQuery] = useState('')
  const search = useRef(settingsQuery)
  const [history] = useState(() => createHistory({ kind: 'settings', query: '' }))
  const navigation = useSyncExternalStore(history.subscribe, history.getSnapshot)
  const currentOverlay = useRef(overlay)
  useLayoutEffect(() => {
    currentOverlay.current = overlay
  }, [overlay])
  const commands = useCommands()
  const host = useHostActions()
  const restore = useRef<FocusToken | null | undefined>(undefined)
  const pendingCommand = useRef<{ id: CommandId; origin: FocusToken | null } | null>(null)
  const live = state.connection.kind === 'live'
  const networkOverlay = overlay?.kind === 'files' || overlay?.kind === 'address'
  useThemeCommands(state.owner, live)
  useLayoutEffect(() => {
    if (!live && networkOverlay) {
      restore.current = overlay.origin
      history.visit({ kind: 'settings', query: search.current })
      // oxlint-disable-next-line oxc-react-compiler/set-state-in-effect -- Close network dialogs before restoring cached-settings focus.
      setOverlay(null)
      return
    }
    if (overlay?.kind === 'commands') return
    if (!overlay && restore.current !== undefined) {
      commands.focus.restore(restore.current)
      restore.current = undefined
    }
    const pending = pendingCommand.current
    pendingCommand.current = null
    if (pending)
      void commands.bus.capture('palette', pending.origin).dispatch(pending.id).completion
  }, [overlay, networkOverlay, live, commands, history])
  function show(kind: DialogKind, origin: FocusToken | null, query?: string) {
    const location = history.getSnapshot().current
    setOverlay({
      kind,
      query,
      origin: currentOverlay.current?.origin ?? origin,
      returnTo: location.kind === 'files' ? location : undefined,
    })
  }
  function showFiles(origin: FocusToken | null, path?: string, query?: string) {
    setOverlay({ kind: 'files', origin, path, query })
  }
  function dismiss() {
    const active = currentOverlay.current
    if (!active) return false
    if (live && active.kind !== 'files' && active.returnTo) {
      showFiles(active.origin, active.returnTo.path)
      return
    }
    setOverlay(null)
    restore.current = active.origin
    if (active.kind === 'files') history.visit({ kind: 'settings', query: search.current })
  }
  function openSettings(query = search.current) {
    search.current = query
    setSettingsQuery(query)
    history.visit({ kind: 'settings', query })
    if (currentOverlay.current) {
      setOverlay(null)
      restore.current = null
      return
    }
    commands.focus.restore(null)
  }
  function navigate(direction: -1 | 1, origin: FocusToken | null) {
    const location = history.go(direction)
    if (!location) return false
    if (location.kind === 'files') {
      showFiles(origin, location.path)
      return
    }
    openSettings(location.query)
  }
  function updateSearch(query: string) {
    search.current = query
    setSettingsQuery(query)
    if (history.getSnapshot().current.kind === 'settings')
      history.replace({ kind: 'settings', query })
  }
  function recordLocation(location: { path: string; rootPath: string }) {
    history.visit({ kind: 'files', path: location.path, rootPath: location.rootPath })
  }
  function changeSettingsDialog(open: boolean) {
    setEditing(open)
    if (open) openSettings()
  }
  const disabledReason = () => (editing ? 'Finish editing this setting first.' : null)
  const networkDisabledReason = () =>
    live ? disabledReason() : 'Reconnect to browse files and open addresses.'
  const location = navigation.current
  const address =
    location.kind === 'settings'
      ? settingsAddress(state.descriptor.environmentId, location.query)
      : fileAddress(state.descriptor.environmentId, location.path, location.rootPath)
  useCommandHandlers({
    'workspace.showCommandPalette': {
      disabledReason,
      run: ({ origin }) => show('commands', origin, '>'),
    },
    'workspace.showQuickAccess': {
      disabledReason: networkDisabledReason,
      run: ({ origin }) => showFiles(origin),
    },
    'workspace.showSettings': { disabledReason, run: () => openSettings() },
    'workspace.quickOpenView': {
      disabledReason,
      run: ({ origin }) => show('commands', origin, 'view '),
    },
    'workspace.selectColorMode': {
      disabledReason,
      run: ({ origin }) => show('commands', origin, 'color '),
    },
    'workspace.selectColorTheme': {
      disabledReason,
      run: ({ origin }) => show('commands', origin, 'theme '),
    },
    'workspace.openAddress': {
      disabledReason: networkDisabledReason,
      run: ({ origin }) => show('address', origin),
    },
    'workspace.copyAddress': {
      disabledReason: () =>
        disabledReason() ?? (address === null ? 'This location has no shareable address.' : null),
      run: ({ origin }) => show('copy-address', origin),
    },
    'workspace.navigateBack': {
      disabledReason: () =>
        networkDisabledReason() ?? (navigation.canGoBack ? null : 'No earlier location.'),
      run: ({ origin }) => navigate(-1, origin),
    },
    'workspace.navigateForward': {
      disabledReason: () =>
        networkDisabledReason() ?? (navigation.canGoForward ? null : 'No later location.'),
      run: ({ origin }) => navigate(1, origin),
    },
    'workspace.showShortcutHelp': { disabledReason, run: ({ origin }) => show('help', origin) },
    'workspace.reconnect': { run: () => session.refresh() },
    'workspace.quit': { run: host.quit },
    'workspace.dismiss': { run: dismiss },
    'workspace.focusNextPane': {
      run: () => !currentOverlay.current && !editing && commands.focus.cycle(1),
    },
    'workspace.focusPreviousPane': {
      run: () => !currentOverlay.current && !editing && commands.focus.cycle(-1),
    },
    ...(host.suspend ? { 'workspace.suspend': { run: host.suspend } } : {}),
  })
  return (
    <box flexGrow={1} minHeight={0} flexDirection='column' overflow='hidden'>
      <SettingsBrowser
        owner={state.owner}
        theme={theme}
        enabled={!overlay}
        writable={live}
        initialQuery={settingsQuery}
        onQueryChange={updateSearch}
        onDialogChange={changeSettingsDialog}
      />
      {commands.pending && (
        <text fg={theme.info}>
          {commands.pending.commands
            .map(
              (binding) =>
                `${binding.keys} ${commandById(binding.command)?.title ?? binding.command}`,
            )
            .join(' · ')}
        </text>
      )}
      {overlay?.kind === 'commands' && (
        <CommandPalette
          key={overlay.query}
          origin={overlay.origin}
          storage={state.storage}
          owner={state.owner}
          writable={live}
          initialQuery={overlay.query}
          theme={theme}
          onClose={dismiss}
          onFiles={(query) => showFiles(overlay.origin, undefined, query)}
          onRun={(id) => {
            pendingCommand.current = { id, origin: overlay.origin }
            dismiss()
          }}
        />
      )}
      {live && overlay?.kind === 'files' && (
        <FilePicker
          session={session}
          storage={state.storage}
          owner={state.owner}
          theme={theme}
          onClose={dismiss}
          initialPath={overlay.path}
          initialQuery={overlay.query}
          onLocationChange={recordLocation}
        />
      )}
      {((live && overlay?.kind === 'address') || overlay?.kind === 'copy-address') && (
        <AddressDialog
          key={overlay.kind}
          session={session}
          state={state}
          theme={theme}
          address={address ?? ''}
          onClose={dismiss}
          copy={overlay.kind === 'copy-address'}
          onSettings={openSettings}
          onFile={(path) => showFiles(overlay.origin, path)}
        />
      )}
      {overlay?.kind === 'help' && <ShortcutHelp theme={theme} onClose={dismiss} />}
    </box>
  )
}
