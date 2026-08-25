import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'

import { useAttachToComposer } from '@/features/chat/hooks/use-attach-to-composer'
import {
  resetComposerInboxStore,
  useComposerInboxStore,
} from '@/features/chat/state/composer-inbox-store'
import { log } from '@/lib/client-logging'
import { useFocusTarget } from '@/lib/focus/hooks/use-target'
import { expect, test } from '../../../../../test/fixtures'
import { renderWithProviders } from '../../../../../test/render'

test.beforeEach(() => {
  resetComposerInboxStore()
})

test.afterEach(() => {
  resetComposerInboxStore()
  vi.restoreAllMocks()
})

test('records command claim and settled reveal outcome in one attachment event', async () => {
  const info = vi.spyOn(log, 'info').mockImplementation(() => {})
  renderWithProviders(<AttachHarness />, { command: { rootPath: '/repo' } })
  const user = userEvent.setup()

  await user.click(screen.getByRole('button', { name: 'Attach context' }))

  expect(useComposerInboxStore.getState().pending).toHaveLength(1)
  expect(attachmentEvent(info.mock.calls)).toBeUndefined()

  screen.getByRole('button', { name: 'Chat composer' }).focus()

  await waitFor(() => {
    expect(attachmentEvent(info.mock.calls)).toMatchObject({
      action: 'chat.composer_attach',
      area: 'chat',
      claimed: true,
      revealOutcome: 'handled',
      source: 'test',
      textLength: 7,
    })
  })
  expect(attachmentEvent(info.mock.calls)).not.toHaveProperty('revealed')
})

function AttachHarness() {
  const { attachText } = useAttachToComposer()
  const { ref } = useFocusTarget<HTMLButtonElement>({
    area: 'chat',
    id: { key: '/repo', kind: 'chat-composer' },
    onIntent: () => true,
  })

  return (
    <div data-workbench=''>
      <button type='button' onClick={() => attachText('test', 'context')}>
        Attach context
      </button>
      <button ref={ref} type='button'>
        Chat composer
      </button>
    </div>
  )
}

function attachmentEvent(calls: readonly (readonly unknown[])[]) {
  return calls
    .map(([event]) => event)
    .find(
      (event): event is Record<string, unknown> =>
        event !== null &&
        typeof event === 'object' &&
        'action' in event &&
        event.action === 'chat.composer_attach',
    )
}
