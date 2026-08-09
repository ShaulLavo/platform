import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'

import { EditorStateProvider } from '@/features/editor/editor-state-provider'
import { MessageBubble } from '@/features/chat/components/message-bubble'
import {
  ChatTimelineActionsContext,
  type ChatTimelineActions,
} from '@/features/chat/providers/timeline-actions-context'
import { chatMessage } from '../../../../../test/factories/chat'
import { expect, test } from '../../../../../test/fixtures'
import { renderWithProviders } from '../../../../../test/render'

const LONG_USER_TEXT = Array.from({ length: 40 }, (_, index) => `line ${index}`).join('\n')

test('a user message renders markdown instead of raw text', () => {
  const { container } = renderBubble(
    chatMessage({
      role: 'user',
      text: 'Try this:\n\n```ts\nconst a = 1\n```\n\n- first\n- second',
    }),
  )

  expect(container.querySelector('[data-streamdown="code-block"]')).not.toBeNull()
  expect(container.querySelector('ul')).not.toBeNull()
  expect(container.textContent).not.toContain('```')
})

test('a long user message collapses until it is expanded', async () => {
  const user = userEvent.setup()
  const { container, getByRole } = renderBubble(chatMessage({ role: 'user', text: LONG_USER_TEXT }))

  expect(userMessageBody(container)?.dataset.userMessageCollapsed).toBe('true')

  await user.click(getByRole('button', { name: 'Show full message' }))

  expect(userMessageBody(container)?.dataset.userMessageCollapsed).toBe('false')
  expect(getByRole('button', { name: 'Show less' })).toBeInTheDocument()
})

test('a short user message is never collapsible', () => {
  const { container } = renderBubble(chatMessage({ role: 'user', text: 'ship it' }))

  expect(userMessageBody(container)?.dataset.userMessageCollapsible).toBe('false')
})

test('only the terminal assistant message shows its metadata row', () => {
  const shown = renderBubble(chatMessage({ text: 'Done.' }), { showAssistantCopyButton: true })
  expect(shown.container.querySelector('[data-assistant-message-meta]')).not.toBeNull()

  const hidden = renderBubble(chatMessage({ text: 'Still working.' }))
  expect(hidden.container.querySelector('[data-assistant-message-meta]')).toBeNull()
})

function userMessageBody(container: HTMLElement) {
  return container.querySelector<HTMLElement>('[data-user-message-body]')
}

function renderBubble(
  message: ReturnType<typeof chatMessage>,
  { showAssistantCopyButton = false }: { showAssistantCopyButton?: boolean } = {},
) {
  return renderWithProviders(
    withProviders(
      <MessageBubble message={message} showAssistantCopyButton={showAssistantCopyButton} />,
    ),
  )
}

function withProviders(children: ReactNode) {
  const actions: ChatTimelineActions = {
    openCheckpointDiff: () => undefined,
    openThreadCheckpointDiff: () => undefined,
    revertToCheckpoint: () => undefined,
  }

  return (
    <EditorStateProvider>
      <ChatTimelineActionsContext value={actions}>{children}</ChatTimelineActionsContext>
    </EditorStateProvider>
  )
}
