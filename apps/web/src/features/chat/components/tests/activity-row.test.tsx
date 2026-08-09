import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { ActivityRow } from '@/features/chat/components/activity-row'
import type { ChatWorkLogEntry } from '@/features/chat/lib/chat-work-log'
import { useChatWorkLogExpansionStore } from '@/features/chat/state/chat-work-log-expansion-store'
import { expect, test } from '../../../../../test/fixtures'
import { renderWithProviders } from '../../../../../test/render'

test('a failed tool call is distinguishable from a successful one', () => {
  const { unmount } = renderWithProviders(
    <ActivityRow activity={entry({ id: 'ok', outcome: 'succeeded', title: 'Command run' })} />,
  )

  expect(screen.getByLabelText('Succeeded')).toBeInTheDocument()
  expect(screen.queryByLabelText('Failed')).not.toBeInTheDocument()
  unmount()

  renderWithProviders(
    <ActivityRow
      activity={entry({
        id: 'broken',
        outcome: 'failed',
        output: 'cat: missing.txt: No such file or directory',
        title: 'Command run',
      })}
    />,
  )

  expect(screen.getByLabelText('Failed')).toBeInTheDocument()
  expect(screen.getByText('Command run')).toHaveClass('text-destructive')
})

test('expanding a row reveals its raw command, output and changed files', async () => {
  resetExpansion()
  renderWithProviders(
    <ActivityRow
      activity={entry({
        changedFiles: ['src/a.ts'],
        command: 'bun test --filter chat',
        output: '12 passed',
      })}
    />,
  )

  expect(screen.queryByLabelText('Command')).not.toBeInTheDocument()

  await userEvent.click(screen.getByRole('button'))

  expect(screen.getByLabelText('Command')).toHaveTextContent('bun test --filter chat')
  expect(screen.getByLabelText('Output')).toHaveTextContent('12 passed')
  expect(screen.getByLabelText('Changed files')).toHaveTextContent('src/a.ts')
})

test('expansion survives the row unmounting', async () => {
  resetExpansion()
  const activity = entry({ command: 'bun test', output: '12 passed' })
  const { unmount } = renderWithProviders(<ActivityRow activity={activity} />)

  await userEvent.click(screen.getByRole('button'))
  expect(screen.getByLabelText('Command')).toBeInTheDocument()

  unmount()
  renderWithProviders(<ActivityRow activity={activity} />)

  expect(screen.getByLabelText('Command')).toHaveTextContent('bun test')
})

test('a plan row renders every step and marks the one in progress', () => {
  resetExpansion()
  renderWithProviders(
    <ActivityRow
      activity={entry({
        icon: 'task',
        id: 'turn-plan:turn-1',
        plan: {
          completedCount: 1,
          currentStep: 'Write the test',
          steps: [
            { status: 'completed', step: 'Read the code' },
            { status: 'inProgress', step: 'Write the test' },
            { status: 'pending', step: 'Ship it' },
          ],
        },
        title: 'Plan updated',
        tone: 'info',
      })}
    />,
  )

  expect(screen.getByText('Read the code')).toBeInTheDocument()
  expect(screen.getByText('Ship it')).toBeInTheDocument()
  expect(screen.getByText('Write the test')).toHaveClass('text-foreground/85')
  expect(screen.getByLabelText('Plan progress')).toHaveTextContent('Plan 1/3')
})

function resetExpansion() {
  useChatWorkLogExpansionStore.setState({ expandedGroupIds: {}, expandedRowIds: {} })
}

function entry(overrides: Partial<ChatWorkLogEntry> = {}): ChatWorkLogEntry {
  return {
    changedFiles: [],
    command: null,
    createdAt: '2026-05-28T00:00:00.000Z',
    detail: null,
    icon: 'tool',
    id: 'activity-1',
    itemType: 'command_execution',
    outcome: null,
    output: null,
    plan: null,
    status: 'Completed',
    title: 'Command run',
    tone: 'tool',
    turnId: null,
    ...overrides,
  }
}
