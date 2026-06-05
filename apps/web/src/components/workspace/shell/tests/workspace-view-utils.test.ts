import { describe, expect, it } from 'bun:test'

import {
  isWorkspacePanelTab,
  workspacePanelSelectionForTabActivation,
  workspacePanelTabTitle,
} from '@/components/workspace/shell/utils/workspace-view-utils'

describe('workspacePanelSelectionForTabActivation', () => {
  it('collapses the sidebar when activating the visible active tab', () => {
    expect(
      workspacePanelSelectionForTabActivation(
        { sidebarVisible: true, workspacePanelTab: 'files' },
        'files',
      ),
    ).toEqual({ sidebarVisible: false, workspacePanelTab: 'files' })
  })

  it('expands the sidebar when activating the hidden active tab', () => {
    expect(
      workspacePanelSelectionForTabActivation(
        { sidebarVisible: false, workspacePanelTab: 'search' },
        'search',
      ),
    ).toEqual({ sidebarVisible: true, workspacePanelTab: 'search' })
  })

  it('switches tabs without collapsing the visible sidebar', () => {
    expect(
      workspacePanelSelectionForTabActivation(
        { sidebarVisible: true, workspacePanelTab: 'files' },
        'logs',
      ),
    ).toEqual({ sidebarVisible: true, workspacePanelTab: 'logs' })
  })

  it('switches tabs and expands the hidden sidebar', () => {
    expect(
      workspacePanelSelectionForTabActivation(
        { sidebarVisible: false, workspacePanelTab: 'git' },
        'search',
      ),
    ).toEqual({ sidebarVisible: true, workspacePanelTab: 'search' })
  })

  it('recognizes the logs workspace panel tab', () => {
    expect(isWorkspacePanelTab('logs')).toBe(true)
    expect(workspacePanelTabTitle('logs')).toBe('Logs')
  })
})
