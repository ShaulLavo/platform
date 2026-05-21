import {
  CaretRightIcon,
  FileCodeIcon,
  XIcon,
} from "@phosphor-icons/react"
import type {
  LanguageServerDefinitionTarget,
  LanguageServerReferencesResult,
} from "@editor/language-server"
import type { CSSProperties } from "react"
import { useMemo, useState } from "react"

import type { CachedEditorDocument } from "@/features/editor/state/editor-document-state"
import { textLineAt } from "@/features/editor/utils/editor-position"
import { compareSearchPaths } from "@/features/search/search-sort"
import { basename, toTreePath } from "@/lib/path-formatters"
import {
  colorForFileIcon,
  iconForEntry,
  type ResolvedFileIcon,
} from "@/lib/file-icons"
import { Button } from "@workspace/ui/components/button"
import { cn } from "@workspace/ui/lib/utils"

type LanguageServerReferencesPaneProps = {
  readonly documents: Readonly<Record<string, CachedEditorDocument>>
  readonly references: LanguageServerReferencesResult
  readonly rootPath: string
  onClose(): void
  onOpenReference(target: LanguageServerDefinitionTarget): void | boolean
}

type ReferenceGroup = {
  readonly name: string
  readonly path: string
  readonly pathLabel: string
  readonly targets: readonly LanguageServerDefinitionTarget[]
}

export function LanguageServerReferencesPane({
  documents,
  references,
  rootPath,
  onClose,
  onOpenReference,
}: LanguageServerReferencesPaneProps) {
  const [collapsedPaths, setCollapsedPaths] = useState<ReadonlySet<string>>(
    () => new Set()
  )
  const groups = useMemo(
    () => referenceGroups(references.targets, rootPath),
    [references.targets, rootPath]
  )

  function handleToggle(path: string) {
    setCollapsedPaths((current) => toggledPathSet(current, path))
  }

  return (
    <aside
      aria-label="References"
      className="grid h-full min-h-0 border-l bg-background grid-rows-[auto_minmax(0,1fr)]"
    >
      <div className="flex h-10 items-center justify-between gap-2 border-b px-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate text-xs font-medium">References</span>
          <span className="rounded bg-muted/70 px-1.5 text-[10px] leading-4 text-muted-foreground">
            {references.targets.length.toLocaleString()}
          </span>
        </div>
        <Button
          aria-label="Close references"
          className="size-7 shrink-0 text-muted-foreground hover:text-foreground"
          size="icon-sm"
          title="Close references"
          type="button"
          variant="ghost"
          onClick={onClose}
        >
          <XIcon className="size-4" />
        </Button>
      </div>
      <div className="min-h-0 overflow-y-auto py-1">
        {groups.length === 0 ? (
          <div className="px-3 py-4 text-xs text-muted-foreground">
            No references found
          </div>
        ) : (
          groups.map((group) => {
            const collapsed = collapsedPaths.has(group.path)

            return (
              <div key={group.path}>
                <ReferenceGroupHeader
                  collapsed={collapsed}
                  group={group}
                  onToggle={handleToggle}
                />
                {collapsed
                  ? null
                  : group.targets.map((target, index) => (
                      <ReferenceRow
                        document={documents[target.path]}
                        key={`${target.uri}:${target.range.start.line}:${target.range.start.character}:${index}`}
                        target={target}
                        onOpenReference={onOpenReference}
                      />
                    ))}
              </div>
            )
          })
        )}
      </div>
    </aside>
  )
}

function ReferenceGroupHeader({
  collapsed,
  group,
  onToggle,
}: {
  readonly collapsed: boolean
  readonly group: ReferenceGroup
  onToggle(path: string): void
}) {
  const icon = iconForEntry({ name: group.name, type: "file" })

  return (
    <button
      className="grid h-7 w-full grid-cols-[14px_14px_minmax(0,1fr)_auto] items-center gap-1.5 px-2 text-left text-xs outline-none hover:bg-muted/55 focus-visible:ring-1 focus-visible:ring-ring/50"
      type="button"
      onClick={() => onToggle(group.path)}
    >
      <CaretRightIcon
        className={cn(
          "size-3 text-muted-foreground transition-transform",
          !collapsed && "rotate-90"
        )}
      />
      <span aria-hidden="true" className="size-3.5" style={fileIconStyle(icon)}>
        <FileCodeIcon className="size-3.5" />
      </span>
      <span className="flex min-w-0 items-center gap-1.5 overflow-hidden whitespace-nowrap">
        <span className="max-w-[55%] min-w-0 shrink-0 truncate font-medium">
          {group.name}
        </span>
        <span className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground">
          {group.pathLabel}
        </span>
      </span>
      <span className="rounded bg-muted/50 px-1 text-[10px] leading-4 text-muted-foreground">
        {group.targets.length}
      </span>
    </button>
  )
}

function ReferenceRow({
  document,
  target,
  onOpenReference,
}: {
  readonly document: CachedEditorDocument | undefined
  readonly target: LanguageServerDefinitionTarget
  onOpenReference(target: LanguageServerDefinitionTarget): void | boolean
}) {
  const line = target.range.start.line + 1
  const preview = referencePreview(document, target)

  return (
    <button
      className="group grid h-6 w-full grid-cols-[38px_minmax(0,1fr)] items-center gap-2 px-2 pl-7 text-left text-xs outline-none hover:bg-muted/55 focus-visible:ring-1 focus-visible:ring-ring/50"
      type="button"
      onClick={() => onOpenReference(target)}
    >
      <span className="text-right text-[11px] text-muted-foreground tabular-nums">
        {line}
      </span>
      <span className="min-w-0 truncate font-mono text-[11px] text-muted-foreground group-hover:text-foreground">
        {preview}
      </span>
    </button>
  )
}

function referenceGroups(
  targets: readonly LanguageServerDefinitionTarget[],
  rootPath: string
): readonly ReferenceGroup[] {
  const byPath = new Map<string, LanguageServerDefinitionTarget[]>()
  for (const target of targets) {
    const existing = byPath.get(target.path) ?? []
    existing.push(target)
    byPath.set(target.path, existing)
  }

  return [...byPath.entries()]
    .sort(([left], [right]) => compareSearchPaths(left, right))
    .map(([path, pathTargets]) => ({
      name: basename(path),
      path,
      pathLabel: referencePathLabel(path, rootPath),
      targets: [...pathTargets].sort(compareTargets),
    }))
}

function compareTargets(
  left: LanguageServerDefinitionTarget,
  right: LanguageServerDefinitionTarget
) {
  return (
    left.range.start.line - right.range.start.line ||
    left.range.start.character - right.range.start.character
  )
}

function referencePathLabel(path: string, rootPath: string) {
  const parent = parentPath(path)
  if (!parent) return ""

  return toTreePath(parent, rootPath)
}

function referencePreview(
  document: CachedEditorDocument | undefined,
  target: LanguageServerDefinitionTarget
) {
  const line = document
    ? textLineAt(document.session.getTextSnapshot(), target.range.start.line)
    : null
  const trimmed = line?.trim()
  if (trimmed) return trimmed
  if (line !== null) return "(blank line)"

  return `Line ${target.range.start.line + 1}, column ${
    target.range.start.character + 1
  }`
}

function toggledPathSet(paths: ReadonlySet<string>, path: string) {
  const next = new Set(paths)
  if (next.has(path)) {
    next.delete(path)
    return next
  }

  next.add(path)
  return next
}

function fileIconStyle(icon: ResolvedFileIcon): CSSProperties {
  const mask = `url(${icon.src}) center / contain no-repeat`

  return {
    backgroundColor: colorForFileIcon(icon),
    mask,
    WebkitMask: mask,
  }
}

function parentPath(path: string) {
  const index = path.lastIndexOf("/")
  if (index < 0) return ""

  return path.slice(0, index)
}
