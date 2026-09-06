import { useEffect, useState } from 'react'
import { useRenderer } from '@opentui/react'

import { useCommands } from '@/commands/hooks/use-commands'
import { useCommandFocus } from '@/commands/hooks/use-command-focus'
import { Dialog } from '@/components/dialog'
import { Prompt } from '@/components/prompt'
import { Spinner } from '@/components/spinner'
import { Toast } from '@/components/toast'
import type { SessionState, SettingsSession } from '@/connection/state/session'
import { connectionFailure } from '@/connection/utils/failure'
import { resolveAddress } from '@/navigation/utils/address'
import type { Theme } from '@/theme/utils/theme'

export function AddressDialog({
  session,
  state,
  theme,
  onClose,
  onSettings,
  onFile,
  address,
  copy = false,
}: {
  session: SettingsSession
  state: Extract<SessionState, { kind: 'ready' }>
  theme: Theme
  onClose: () => void
  onSettings: (query: string) => void
  onFile: (path: string) => void
  copy?: boolean
  address: string
}) {
  const [input, setInput] = useState(copy ? address : '')
  const [pending, setPending] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [controller] = useState(() => new AbortController())
  const commands = useCommands()
  const renderer = useRenderer()
  useCommandFocus(
    {
      ...commands.focus.getSnapshot().scope,
      id: 'address-input',
      area: 'dialog',
      textEntry: true,
      overlay: true,
      focus: () => true,
    },
    true,
  )
  useEffect(() => {
    // oxlint-disable-next-line oxc-react-compiler/set-state-in-effect -- Clipboard support is known only after the terminal write.
    if (copy) setCopied(renderer.copyToClipboardOSC52(address))
  }, [copy, renderer, address])
  useEffect(() => () => controller.abort(), [controller])
  const open = async (value: string) => {
    if (pending) return
    if (state.connection.kind !== 'live') {
      setFailure('Reconnect before opening an address.')
      return
    }
    setPending(true)
    setFailure(null)
    try {
      const result = await resolveAddress(
        value,
        session.client,
        state.descriptor.environmentId,
        controller.signal,
      )
      controller.signal.throwIfAborted()
      if (result.kind === 'failed') {
        setFailure(result.message)
        return
      }
      if (result.kind === 'settings') {
        onSettings(result.query)
        return
      }
      onFile(result.path)
    } catch (error) {
      if (!controller.signal.aborted) setFailure(connectionFailure(error).message)
    } finally {
      if (!controller.signal.aborted) setPending(false)
    }
  }
  return (
    <Dialog
      title={copy ? 'Current address' : 'Open address'}
      theme={theme}
      onClose={onClose}
      footer='Enter open'
      dismissLabel='close'
      width={100}
    >
      <Prompt
        id='address-input'
        value={input}
        onChange={setInput}
        onSubmit={(value) => void open(value)}
        theme={theme}
        disabled={pending}
        placeholder='Paste a Platform address…'
      />
      {copy && (
        <text fg={theme.mutedForeground}>
          {copied
            ? 'Copied through the terminal clipboard.'
            : 'Select the address above to copy it from your terminal.'}
        </text>
      )}
      {pending && <Spinner theme={theme} />}
      {failure && <Toast message={failure} tone='error' theme={theme} durationMs={0} />}
    </Dialog>
  )
}
