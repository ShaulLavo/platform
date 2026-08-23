import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'vitest'

import { Input } from '@workspace/ui/components/input'

const mountedRoots: Array<{ container: HTMLElement; root: Root }> = []

afterEach(() => {
  for (const mounted of mountedRoots.splice(0)) {
    act(() => mounted.root.unmount())
    mounted.container.remove()
  }
})

describe('Input', () => {
  it('keeps explicit geometry authoritative over density defaults', () => {
    const container = mount(<Input className='h-6 px-0' />)
    const classes = container.querySelector('input')?.className.split(' ') ?? []

    expect(classes).toContain('h-6')
    expect(classes).toContain('px-0')
    expect(classes).not.toContain('h-(--density-control-height)')
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
