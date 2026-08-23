import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'vitest'

import { Button } from '@workspace/ui/components/button'

const mountedRoots: Array<{ container: HTMLElement; root: Root }> = []

afterEach(() => {
  for (const mounted of mountedRoots.splice(0)) {
    act(() => mounted.root.unmount())
    mounted.container.remove()
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

  it('keeps explicit geometry authoritative over density defaults', () => {
    const container = mount(<Button className='h-auto gap-0 p-0'>Flexible content</Button>)
    const classes = container.querySelector('button')?.className.split(' ') ?? []

    expect(classes).toContain('h-auto')
    expect(classes).toContain('gap-0')
    expect(classes).toContain('p-0')
    expect(classes).not.toContain('h-(--density-control-height)')
    expect(classes).not.toContain('gap-(--density-control-gap)')
    expect(classes).not.toContain('px-(--density-control-padding-x)')
  })
})

function mount(element: React.ReactElement): HTMLElement {
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  mountedRoots.push({ container, root })

  act(() => {
    root.render(element)
  })

  return container
}
