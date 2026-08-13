import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { RecordWidget } from '../components/widgets/record-widget'

describe('RecordWidget', () => {
  it('deletes the key on remove rather than writing null', async () => {
    const onChange = vi.fn()
    render(
      <RecordWidget
        id='keybindings.overrides'
        onChange={onChange}
        value={{ 'workspace.saveFile': 'Mod+S' }}
      />,
    )

    await userEvent.click(screen.getByRole('button', { name: 'Remove workspace.saveFile' }))

    // Those are different documents: an absent key keeps the command's default
    // binding, a null one unbinds it entirely.
    expect(onChange).toHaveBeenCalledWith({})
  })

  it('shows an unbound entry as unbound rather than as empty', () => {
    render(
      <RecordWidget
        id='keybindings.overrides'
        onChange={vi.fn()}
        value={{ 'workspace.saveFile': null }}
      />,
    )

    const field = screen.getByLabelText('Value for workspace.saveFile')
    expect(field).toHaveValue('')
    expect(field).toHaveAttribute('placeholder', 'unbound')
  })

  it('adds a key on Enter and refuses a duplicate', async () => {
    const onChange = vi.fn()
    render(<RecordWidget id='k' onChange={onChange} value={{ existing: 'Mod+1' }} />)

    const add = screen.getByLabelText('Add an entry to k')
    await userEvent.type(add, 'existing{Enter}')
    expect(onChange).not.toHaveBeenCalled()

    await userEvent.clear(add)
    await userEvent.type(add, 'fresh{Enter}')
    expect(onChange).toHaveBeenCalledWith({ existing: 'Mod+1', fresh: '' })
  })

  it('edits a value in place', async () => {
    const onChange = vi.fn()
    render(<RecordWidget id='k' onChange={onChange} value={{ 'a.b': 'Mod+1' }} />)

    await userEvent.type(screen.getByLabelText('Value for a.b'), '2')

    expect(onChange).toHaveBeenCalledWith({ 'a.b': 'Mod+12' })
  })
})
