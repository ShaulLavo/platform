import type { WorkspacePanelTab } from "@/lib/workspace-cache"
import { TabsTrigger } from "@workspace/ui/components/tabs"
import { cn } from "@workspace/ui/lib/utils"
import type { ReactNode } from "react"

export function WorkspaceActivityTab({
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
