import { FolderOpenIcon, HardDrivesIcon } from "@phosphor-icons/react"

import { displayPath } from "@/lib/path-formatters"
import type { PickedFsEntry } from "@/components/file-picker-dialog"
import { Button } from "@workspace/ui/components/button"

export function AppHeader({
  rootFolder,
  onChooseFolder,
}: {
  rootFolder: PickedFsEntry | null
  onChooseFolder: () => void
}) {
  return (
    <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b bg-background px-4">
      <div className="flex min-w-0 items-center gap-2">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-md border bg-muted/50">
          <HardDrivesIcon className="size-4" weight="duotone" />
        </span>
        <div className="min-w-0">
          <h1 className="truncate text-sm font-medium">Platform</h1>
          <p className="truncate text-xs text-muted-foreground">
            {rootFolder ? displayPath(rootFolder.path) : "No folder open"}
          </p>
        </div>
      </div>
      <Button onClick={onChooseFolder} size="sm" type="button">
        <FolderOpenIcon data-icon="inline-start" weight="duotone" />
        {rootFolder ? "Change folder" : "Choose folder"}
      </Button>
    </header>
  )
}
