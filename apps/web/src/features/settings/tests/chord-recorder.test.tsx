import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { ChordRecorder } from '../components/widgets/chord-recorder'

function record(chord: Partial<KeyboardEvent> & { key: string }) {
  fireEvent.keyDown(screen.getByRole('button'), chord)
}

describe('ChordRecorder', () => {
  it('captures a chord from the keystroke instead of asking for notation', async () => {
    const onChange = vi.fn()
    render(<ChordRecorder conflictCount={0} id='k' onChange={onChange} value='' />)

    await userEvent.click(screen.getByRole('button'))
    record({ key: 's', metaKey: true, shiftKey: true })

    // `Mod`, not `Meta`: the settings document stores the portable spelling, so
    // the same override works on a machine with a different keyboard.
    expect(onChange).toHaveBeenCalledWith(expect.stringContaining('Mod'))
    expect(onChange.mock.calls[0]?.[0]).toContain('Shift')
  })

  it('ignores a modifier pressed on its own', async () => {
    const onChange = vi.fn()
    render(<ChordRecorder conflictCount={0} id='k' onChange={onChange} value='' />)

    await userEvent.click(screen.getByRole('button'))
    record({ key: 'Meta', metaKey: true })

    // A held modifier is a chord in progress, not a chord.
    expect(onChange).not.toHaveBeenCalled()
  })

  it('cancels on Escape rather than binding it', async () => {
    const onChange = vi.fn()
    render(<ChordRecorder conflictCount={0} id='k' onChange={onChange} value='Mod+S' />)

    await userEvent.click(screen.getByRole('button'))
    record({ key: 'Escape' })

    expect(onChange).not.toHaveBeenCalled()
    expect(screen.getByRole('button')).toHaveTextContent('Mod+S')
  })

  it('does not record until asked', () => {
    const onChange = vi.fn()
    render(<ChordRecorder conflictCount={0} id='k' onChange={onChange} value='' />)

    record({ key: 's', metaKey: true })

    // Otherwise every keystroke that reached a focused row would rebind it.
    expect(onChange).not.toHaveBeenCalled()
  })

  it('warns when other commands already use the chord', () => {
    const { container } = render(
      <ChordRecorder conflictCount={2} id='k' onChange={vi.fn()} value='Mod+S' />,
    )

    // Before the save, rather than discovered later by a shortcut that stopped
    // working.
    expect(container.textContent).toContain('2 other commands use this')
  })

  it('says nothing when the chord is free', () => {
    const { container } = render(
      <ChordRecorder conflictCount={0} id='k' onChange={vi.fn()} value='Mod+S' />,
    )

    expect(container.textContent).not.toContain('use this')
  })

  it('says unassigned rather than showing an empty control', () => {
    render(<ChordRecorder conflictCount={0} id='k' onChange={vi.fn()} value='' />)

    expect(screen.getByRole('button')).toHaveTextContent('Unassigned')
  })
})
