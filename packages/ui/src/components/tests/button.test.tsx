import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'vitest'

import { Button } from '@workspace/ui/components/button'

const containers: HTMLElement[] = []

afterEach(() => {
  for (const container of containers.splice(0)) {
    container.remove()
  }
})

describe('Button', () => {
  it('renders a button element carrying its slot attribute', () => {
    const container = mount(<Button>Save</Button>)
    const button = container.querySelector('button')

    expect(button).not.toBeNull()
    expect(button?.getAttribute('data-slot')).toBe('button')
    expect(button?.textContent).toBe('Save')
  })

  it('keeps variant and size classes on the rendered element', () => {
    const container = mount(
      <Button size='sm' variant='destructive'>
        Delete
      </Button>,
    )
    const className = container.querySelector('button')?.className ?? ''

    expect(className).toContain('bg-destructive')
    expect(className.length).toBeGreaterThan(0)
  })
})

function mount(element: React.ReactElement): HTMLElement {
  const container = document.createElement('div')
  document.body.append(container)
  containers.push(container)

  act(() => {
    createRoot(container).render(element)
  })

  return container
}
