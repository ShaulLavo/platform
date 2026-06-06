import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { renderWithProviders } from '../render'

function Probe() {
  return <div>provider tree mounted</div>
}

// Proves the full app provider stack (Query + Theme + EditorColorTheme + Tooltip)
// mounts cleanly under happy-dom.
describe('renderWithProviders', () => {
  it('mounts the app provider stack', () => {
    const { queryClient } = renderWithProviders(<Probe />)

    expect(screen.getByText('provider tree mounted')).toBeInTheDocument()
    expect(queryClient.getDefaultOptions().queries?.retry).toBe(false)
  })
})
