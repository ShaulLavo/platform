import { FileIcon, XIcon } from "@phosphor-icons/react"

import { useEditorState } from "@/components/editor/editor-state"
import { basename, displayPath } from "@/lib/path-formatters"
import { cn } from "@workspace/ui/lib/utils"

export function EditorTabBar() {
  const dirtyFilePaths = useEditorState((state) => state.dirtyFilePaths)
  const openFilePaths = useEditorState((state) => state.openFilePaths)
  const selectedFilePath = useEditorState((state) => state.selectedFilePath)
  const closeTab = useEditorState((state) => state.closeTab)
  const selectFile = useEditorState((state) => state.selectFile)

  if (openFilePaths.length === 0) return null

  return (
    <nav
      aria-label="Open files"
      className="flex h-10 min-w-0 shrink-0 overflow-x-auto border-b bg-muted/30"
      role="tablist"
    >
      <div className="flex min-w-0 items-end">
        {openFilePaths.map((path) => {
          const active = path === selectedFilePath
          const dirty = dirtyFilePaths.has(path)
          const name = basename(path)
          const showCloseIcon = active && !dirty

          return (
            <div
              className={cn(
                "group flex h-10 min-w-36 max-w-56 shrink-0 items-center border-r border-border bg-background/40 text-xs",
                active &&
                  "border-t-2 border-t-foreground bg-background text-foreground"
              )}
              key={path}
            >
              <button
                aria-selected={active}
                className={cn(
                  "flex h-full min-w-0 flex-1 items-center gap-2 px-3 text-left text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-1 focus-visible:ring-ring/50",
                  active && "text-foreground"
                )}
                onClick={() => selectFile(path)}
                role="tab"
                title={displayPath(path)}
                type="button"
              >
                <FileIcon
                  className="size-3.5 shrink-0 text-sky-600"
                  weight="duotone"
                />
                <span className="truncate">{name}</span>
              </button>
              <button
                aria-label={`Close ${name}`}
                className={cn(
                  "group/close relative mr-1 flex size-6 shrink-0 items-center justify-center text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-1 focus-visible:ring-ring/50",
                  showCloseIcon || dirty
                    ? "opacity-100"
                    : "opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                )}
                onClick={() => closeTab(path)}
                title={`Close ${name}`}
                type="button"
              >
                <XIcon
                  className={cn(
                    "size-3 transition-opacity",
                    showCloseIcon
                      ? "opacity-70"
                      : "opacity-0 group-hover:opacity-70 group-focus-visible/close:opacity-70"
                  )}
                />
                {dirty && (
                  <span
                    aria-hidden="true"
                    className="absolute size-2 rounded-full bg-amber-500 transition-opacity group-hover:opacity-0 group-focus-visible/close:opacity-0"
                  />
                )}
              </button>
            </div>
          )
        })}
      </div>
    </nav>
  )
}
