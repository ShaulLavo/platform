import type { WorkspacePanelTab } from "@/lib/workspace-cache"
import { WorkspaceActivityButton } from "@/components/workspace/workspace-activity-button"
import { WorkspaceActivityTab } from "@/components/workspace/workspace-activity-tab"
import { TabsList } from "@workspace/ui/components/tabs"
import {
  FolderIcon,
  GitBranchIcon,
  MagnifyingGlassIcon,
  TerminalWindowIcon,
} from "@phosphor-icons/react"

export function WorkspaceActivityBar({
  currentVisible,
  onSelectTab,
  onToggleTerminal,
  terminalCollapsed,
}: {
  currentVisible: boolean
  onSelectTab: (tab: WorkspacePanelTab) => void
  onToggleTerminal: () => void
  terminalCollapsed: boolean
}) {
  return (
    <nav
      aria-label="Workspace activity"
      className="flex h-full w-10 flex-col items-stretch gap-1 border-r border-border bg-background px-1 py-2"
    >
      <TabsList
        aria-label="Workspace panels"
        className="h-auto w-full flex-col items-stretch justify-start gap-1 border-0 bg-transparent p-0"
      >
        <WorkspaceActivityTab
          icon={<FolderIcon className="size-5" />}
          label="Files"
          value="files"
          currentVisible={currentVisible}
          onSelectTab={onSelectTab}
        />
        <WorkspaceActivityTab
          icon={<MagnifyingGlassIcon className="size-5" />}
          label="Search"
          value="search"
          currentVisible={currentVisible}
          onSelectTab={onSelectTab}
        />
        <WorkspaceActivityTab
          icon={<GitBranchIcon className="size-5" />}
          label="Git"
          value="git"
          currentVisible={currentVisible}
          onSelectTab={onSelectTab}
        />
        <WorkspaceActivityButton
          active={!terminalCollapsed}
          icon={<TerminalWindowIcon className="size-5" />}
          label="Terminal"
          onClick={onToggleTerminal}
        />
      </TabsList>
    </nav>
  )
}
