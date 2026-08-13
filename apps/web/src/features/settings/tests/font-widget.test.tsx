import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createElement, type ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'

import { FontWidget } from '../components/widgets/font-widget'

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })

  return createElement(QueryClientProvider, { client }, children)
}

describe('FontWidget', () => {
  it('accepts a family the catalogue does not offer', async () => {
    const onChange = vi.fn()
    render(<FontWidget id='editor.fontFamily' onChange={onChange} value='JetBrainsMono' />, {
      wrapper,
    })

    const field = screen.getByLabelText('Font family')
    await userEvent.clear(field)
    await userEvent.type(field, 'Comic Mono{Enter}')

    // A font already installed on the machine must not be unreachable just
    // because it is not one of the ~70 the server can fetch.
    expect(onChange).toHaveBeenCalledWith('Comic Mono')
  })

  it('commits on blur and ignores an unchanged value', async () => {
    const onChange = vi.fn()
    render(<FontWidget id='editor.fontFamily' onChange={onChange} value='JetBrainsMono' />, {
      wrapper,
    })

    await userEvent.click(screen.getByLabelText('Font family'))
    await userEvent.tab()

    expect(onChange).not.toHaveBeenCalled()
  })

  it('snaps back on Escape without committing', async () => {
    const onChange = vi.fn()
    render(<FontWidget id='editor.fontFamily' onChange={onChange} value='JetBrainsMono' />, {
      wrapper,
    })

    const field = screen.getByLabelText('Font family')
    await userEvent.clear(field)
    await userEvent.type(field, 'Nope{Escape}')

    expect(onChange).not.toHaveBeenCalled()
    expect(field).toHaveValue('JetBrainsMono')
  })

  it('offers a browse control for the fetchable catalogue', () => {
    render(<FontWidget id='editor.fontFamily' onChange={vi.fn()} value='JetBrainsMono' />, {
      wrapper,
    })

    expect(screen.getByRole('button', { name: 'Browse Nerd Fonts' })).toBeDefined()
  })
})
