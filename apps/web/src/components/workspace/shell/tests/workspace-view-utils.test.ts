import { describe, expect, it } from 'vitest'

import {
  isPanelTab,
  panelSelectionForTabActivation,
  panelTabTitle,
} from '@/components/workspace/shell/utils/workspace-view-utils'

describe('panelSelectionForTabActivation', () => {
  it('collapses the sidebar when activating the visible active tab', () => {
    expect(
      panelSelectionForTabActivation({ sidebarVisible: true, workspacePanelTab: 'files' }, 'files'),
    ).toEqual({ sidebarVisible: false, workspacePanelTab: 'files' })
  })

  it('expands the sidebar when activating the hidden active tab', () => {
    expect(
      panelSelectionForTabActivation(
        { sidebarVisible: false, workspacePanelTab: 'search' },
        'search',
      ),
    ).toEqual({ sidebarVisible: true, workspacePanelTab: 'search' })
  })

  it('switches tabs without collapsing the visible sidebar', () => {
    expect(
      panelSelectionForTabActivation({ sidebarVisible: true, workspacePanelTab: 'files' }, 'logs'),
    ).toEqual({ sidebarVisible: true, workspacePanelTab: 'logs' })
  })

  it('switches tabs and expands the hidden sidebar', () => {
    expect(
      panelSelectionForTabActivation({ sidebarVisible: false, workspacePanelTab: 'git' }, 'search'),
    ).toEqual({ sidebarVisible: true, workspacePanelTab: 'search' })
  })

  it('recognizes the logs workspace panel tab', () => {
    expect(isPanelTab('logs')).toBe(true)
    expect(panelTabTitle('logs')).toBe('Logs')
  })
})
