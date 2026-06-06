import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

function Hello({ name }: { name: string }) {
  return <p>Hello {name}</p>
}

// Proves the `dom` project boots: react plugin + happy-dom environment +
// jest-dom matchers + RTL render/cleanup.
describe('vitest happy-dom world', () => {
  it('renders a component into a real DOM tree', () => {
    render(<Hello name='Shaul' />)
    expect(screen.getByText('Hello Shaul')).toBeInTheDocument()
  })
})
