import { describe, expect, it } from 'vitest'

import { editorTabCloseTargetIds } from '@/features/workspace/utils/tab-close-targets'

describe('editorTabCloseTargetIds', () => {
  it('targets the clicked tab for close', () => {
    expect(editorTabCloseTargetIds(editorTabs(), 'tab-b', 'close')).toEqual(['tab-b'])
  })

  it('targets every tab except the clicked tab for close others', () => {
    expect(editorTabCloseTargetIds(editorTabs(), 'tab-b', 'closeOthers')).toEqual([
      'tab-a',
      'tab-c',
      'tab-d',
    ])
  })

  it('targets tabs to the right of the clicked tab', () => {
    expect(editorTabCloseTargetIds(editorTabs(), 'tab-b', 'closeToRight')).toEqual([
      'tab-c',
      'tab-d',
    ])
  })

  it('targets only clean tabs for close saved', () => {
    expect(editorTabCloseTargetIds(editorTabs(), 'tab-b', 'closeSaved')).toEqual(['tab-a', 'tab-c'])
  })

  it('targets every tab for close all', () => {
    expect(editorTabCloseTargetIds(editorTabs(), 'tab-b', 'closeAll')).toEqual([
      'tab-a',
      'tab-b',
      'tab-c',
      'tab-d',
    ])
  })

  it('returns no targets when the tab is missing', () => {
    expect(editorTabCloseTargetIds(editorTabs(), 'missing-tab', 'closeAll')).toEqual([])
  })
})

function editorTabs() {
  return [
    { dirty: false, id: 'tab-a', path: 'src/a.ts' },
    { dirty: true, id: 'tab-b', path: 'src/b.ts' },
    { dirty: false, id: 'tab-c', path: 'src/c.ts' },
    { dirty: true, id: 'tab-d', path: 'src/d.ts' },
  ]
}
