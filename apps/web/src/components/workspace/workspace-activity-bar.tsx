import type { WorkspacePanelTab } from "@/lib/workspace-cache"
import { cn } from "@workspace/ui/lib/utils"
import { TabsList, TabsTrigger } from "@workspace/ui/components/tabs"
import {
  FolderIcon,
  GitBranchIcon,
  MagnifyingGlassIcon,
} from "@phosphor-icons/react"
import type { ReactNode } from "react"

export function WorkspaceActivityBar({
  currentVisible,
  onSelectTab,
}: {
  currentVisible: boolean
  onSelectTab: (tab: WorkspacePanelTab) => void
}) {
  return (
    <TabsList
      aria-label="Workspace activity"
      className="h-full w-10 flex-col items-stretch justify-start gap-1 border-r border-b-0 border-border bg-background px-1 py-2"
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
    </TabsList>
  )
}

function WorkspaceActivityTab({
  currentVisible,
  icon,
  label,
  onSelectTab,
  value,
}: {
  currentVisible: boolean
  icon: ReactNode
  label: string
  onSelectTab: (tab: WorkspacePanelTab) => void
  value: WorkspacePanelTab
}) {
  return (
    <TabsTrigger
      aria-label={label}
      className={cn(
        "h-10 w-full flex-none flex-col rounded-md px-0 text-muted-foreground hover:bg-muted/50 data-active:shadow-none",
        currentVisible
          ? "data-active:bg-accent data-active:text-accent-foreground"
          : "data-active:bg-transparent data-active:text-muted-foreground"
      )}
      title={label}
      value={value}
      onClick={() => onSelectTab(value)}
    >
      {icon}
      <span className="sr-only">{label}</span>
    </TabsTrigger>
  )
}
