import { useEditorState } from "@/components/editor/editor-state"
import {
  colorForFileIcon,
  iconForEntry,
  type ResolvedFileIcon,
} from "@/lib/file-icons"
import { basename, toTreePath } from "@/lib/path-formatters"
import { cn } from "@workspace/ui/lib/utils"
import type { CSSProperties, KeyboardEvent } from "react"

import { diffDocumentId } from "../diff-document"
import type { ChangeRow } from "../types"
import { parentPath, statusPresentation } from "../utils"
import { FileActions } from "./file-actions"

export function FileRow({
  rootPath,
  row,
}: {
  rootPath: string
  row: ChangeRow
}) {
  const selectFile = useEditorState((state) => state.selectFile)
  const relativePath = toTreePath(row.file.path, rootPath)
  const name = basename(relativePath)
  const directory = parentPath(relativePath)
  const icon = iconForEntry({ name, type: "file" })
  const status = statusPresentation(row.status)

  function handleOpen() {
    selectFile(diffDocumentId(row.file.path, row.section === "staged"))
  }

  function handleRowKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "Enter" && event.key !== " ") return

    event.preventDefault()
    handleOpen()
  }

  return (
    <div
      className="group/row grid h-6 cursor-pointer grid-cols-[22px_minmax(0,1fr)_auto_18px] items-center px-2 text-xs leading-none outline-none hover:bg-muted/70 focus-visible:ring-1 focus-visible:ring-ring/50"
      role="button"
      tabIndex={0}
      onClick={handleOpen}
      onKeyDown={handleRowKeyDown}
    >
      <span
        aria-hidden="true"
        className="size-4 shrink-0 justify-self-center"
        style={fileIconStyle(icon)}
      />
      <div className="min-w-0 truncate text-left" title={relativePath}>
        <span className="font-medium text-foreground">{name}</span>
        {directory && (
          <span className="ml-2 font-normal text-muted-foreground">
            {directory}
          </span>
        )}
      </div>
      <FileActions path={row.file.path} section={row.section} />
      <span
        className={cn(
          "justify-self-end text-xs font-semibold",
          status.className
        )}
      >
        {status.label}
      </span>
    </div>
  )
}

function fileIconStyle(icon: ResolvedFileIcon): CSSProperties {
  const mask = `url(${icon.src}) center / contain no-repeat`

  return {
    backgroundColor: colorForFileIcon(icon),
    mask,
    WebkitMask: mask,
  }
}
