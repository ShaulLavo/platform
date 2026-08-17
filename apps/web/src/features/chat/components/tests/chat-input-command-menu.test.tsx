import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { ChatInputCommandMenu } from '@/features/chat/components/chat-input-command-menu'
import {
  chatInputMentionCommandItems,
  type ChatInputCommandItem,
} from '@/features/chat/utils/input-logic'
import { expect, test } from '../../../../../test/fixtures'
import { renderWithProviders } from '../../../../../test/render'

test('the menu is portalled out of the composer instead of clipped inside it', () => {
  const { container } = renderMenu()

  const listbox = screen.getByRole('listbox')
  expect(container).not.toContainElement(listbox)
  expect(document.body).toContainElement(listbox)
})

test('every suggestion is an option row inside the portalled list', () => {
  renderMenu()

  expect(screen.getAllByRole('option').map((option) => option.textContent)).toEqual([
    expect.stringContaining('app.tsx'),
    expect.stringContaining('main.tsx'),
  ])
})

test('picking a row reports the item it belongs to', async () => {
  const selected = renderMenu().selected

  await userEvent.click(screen.getByRole('option', { name: /main.tsx/ }))

  expect(selected.at(0)).toMatchObject({ path: 'src/main.tsx', type: 'mention' })
})

test('a press outside the popover clears the trigger the composer is holding', async () => {
  const menu = renderMenu()

  await userEvent.click(document.body)

  expect(menu.dismissals).toBe(1)
})

function renderMenu() {
  const items = chatInputMentionCommandItems([
    { id: 'path:app.tsx', label: 'app.tsx', path: 'src/app.tsx', type: 'file' },
    { id: 'path:main.tsx', label: 'main.tsx', path: 'src/main.tsx', type: 'file' },
  ])
  const selected: ChatInputCommandItem[] = []
  const state = { dismissals: 0 }

  const result = renderWithProviders(
    <div className='relative'>
      <ChatInputCommandMenu
        activeItemId={items[0]?.id ?? null}
        emptyLabel='Type a file or folder name'
        isLoading={false}
        items={items}
        triggerKind='mention'
        onActiveItemChange={() => {}}
        onDismiss={() => {
          state.dismissals += 1
        }}
        onSelect={(item) => {
          selected.push(item)
        }}
      />
    </div>,
  )

  return {
    container: result.container,
    get dismissals() {
      return state.dismissals
    },
    selected,
  }
}
