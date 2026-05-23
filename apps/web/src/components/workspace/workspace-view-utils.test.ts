import { describe, expect, it } from "bun:test"

import { workspacePanelSelectionForTabActivation } from "@/components/workspace/workspace-view-utils"

describe("workspacePanelSelectionForTabActivation", () => {
  it("collapses the sidebar when activating the visible active tab", () => {
    expect(
      workspacePanelSelectionForTabActivation(
        { sidebarVisible: true, workspacePanelTab: "files" },
        "files"
      )
    ).toEqual({ sidebarVisible: false, workspacePanelTab: "files" })
  })

  it("expands the sidebar when activating the hidden active tab", () => {
    expect(
      workspacePanelSelectionForTabActivation(
        { sidebarVisible: false, workspacePanelTab: "search" },
        "search"
      )
    ).toEqual({ sidebarVisible: true, workspacePanelTab: "search" })
  })

  it("switches tabs without collapsing the visible sidebar", () => {
    expect(
      workspacePanelSelectionForTabActivation(
        { sidebarVisible: true, workspacePanelTab: "files" },
        "git"
      )
    ).toEqual({ sidebarVisible: true, workspacePanelTab: "git" })
  })

  it("switches tabs and expands the hidden sidebar", () => {
    expect(
      workspacePanelSelectionForTabActivation(
        { sidebarVisible: false, workspacePanelTab: "git" },
        "search"
      )
    ).toEqual({ sidebarVisible: true, workspacePanelTab: "search" })
  })
})
