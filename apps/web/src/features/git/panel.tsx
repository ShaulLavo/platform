import { cn } from "@workspace/ui/lib/utils"
import { useMemo, useState, type ComponentProps, type ReactNode } from "react"

import { errorMessage } from "@/lib/file-server"
import { useStatus } from "./hooks"
import { StateContext, createGitStore, useGitState } from "./state"
import type { FileStatus } from "./types"
import { changeRows } from "./utils"
import { ChangeGroup } from "./components/change-group"
import { CommitControls } from "./components/commit-controls"
import { Header } from "./components/header"
import { PanelShell } from "./components/panel-shell"

const EMPTY_FILES: readonly FileStatus[] = []

export function Panel({
  className,
  rootPath,
}: ComponentProps<"section"> & { rootPath: string }) {
  return (
    <StateProvider>
      <PanelContent className={className} rootPath={rootPath} />
    </StateProvider>
  )
}

function StateProvider({ children }: { children: ReactNode }) {
  const [store] = useState(createGitStore)

  return <StateContext.Provider value={store}>{children}</StateContext.Provider>
}

function PanelContent({
  className,
  rootPath,
}: ComponentProps<"section"> & { rootPath: string }) {
  const status = useStatus(rootPath)
  const files = status.data?.files ?? EMPTY_FILES
  const repository = status.data?.repository ?? null
  const rows = useMemo(() => changeRows(files), [files])
  const panelOpen = useGitState((state) => state.panelOpen)

  if (status.isPending) {
    return <PanelShell className={className} label="Loading Git" />
  }
  if (status.isError) {
    return (
      <PanelShell
        className={className}
        label={errorMessage(status.error)}
        tone="error"
      />
    )
  }
  if (!repository) {
    return <PanelShell className={className} label="No Git repository" />
  }

  return (
    <section
      className={cn(
        "flex h-full min-h-0 flex-col bg-background text-foreground",
        className
      )}
    >
      <Header repository={repository} rootPath={rootPath} />
      {panelOpen && (
        <>
          <CommitControls
            branch={repository.branch ?? "HEAD"}
            rootPath={rootPath}
          />
          <div className="app-scrollbar-thin min-h-0 flex-1 overflow-auto pt-2">
            <ChangeGroup
              label="Staged Changes"
              rootPath={rootPath}
              rows={rows.staged}
              section="staged"
            />
            <ChangeGroup
              label="Changes"
              rootPath={rootPath}
              rows={rows.worktree}
              section="worktree"
            />
            {rows.staged.length === 0 && rows.worktree.length === 0 && (
              <div className="px-7 py-4 text-xs text-muted-foreground">
                Working tree clean
              </div>
            )}
          </div>
        </>
      )}
      {!panelOpen && (
        <div aria-hidden="true" className="min-h-0 flex-1 bg-background" />
      )}
    </section>
  )
}
