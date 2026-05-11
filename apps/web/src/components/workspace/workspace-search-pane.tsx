import {
  ArrowSquareOutIcon,
  MagnifyingGlassIcon,
} from "@phosphor-icons/react"
import type { ChangeEvent } from "react"

import { useEditorCommands } from "@/features/editor/state/editor-commands"
import { openWorkspaceSearchMatch } from "@/features/search/open-search-match"
import { SearchResultsView } from "@/features/search/search-results-view"
import { SearchSummary } from "@/features/search/search-summary"
import { searchBufferDocumentId } from "@/features/search/search-buffer-document"
import { useSearchBuffer } from "@/features/search/use-search-buffer"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"

export function WorkspaceSearchPane({ rootPath }: { rootPath: string }) {
  const { groups, query, resultsQuery, setQuery, snapshot } =
    useSearchBuffer(rootPath)
  const commands = useEditorCommands()
  const trimmedQuery = query.trim()

  function handleQueryChange(event: ChangeEvent<HTMLInputElement>) {
    setQuery(event.target.value)
  }

  function handleOpenBuffer() {
    commands.selectFile(searchBufferDocumentId(rootPath))
  }

  return (
    <section className="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)]">
      <div className="border-b bg-muted/20 p-2">
        <div className="flex items-center gap-1.5">
          <div className="relative min-w-0 flex-1">
            <MagnifyingGlassIcon className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              aria-label="Search workspace"
              autoCapitalize="off"
              autoCorrect="off"
              className="h-8 pr-2 pl-8 text-xs"
              placeholder="Search workspace"
              spellCheck={false}
              type="search"
              value={query}
              onChange={handleQueryChange}
            />
          </div>
          <Button
            aria-label="Open search results in editor"
            className="size-8 shrink-0 text-muted-foreground hover:text-foreground"
            disabled={!trimmedQuery}
            size="icon-sm"
            title="Open search results in editor"
            type="button"
            variant="ghost"
            onClick={handleOpenBuffer}
          >
            <ArrowSquareOutIcon className="size-4" />
          </Button>
        </div>
        <SearchSummary query={trimmedQuery} snapshot={snapshot} />
      </div>
      <SearchResultsView
        groups={groups}
        query={resultsQuery}
        snapshot={snapshot}
        onOpenMatch={(match) =>
          openWorkspaceSearchMatch(match, resultsQuery, commands)
        }
      />
    </section>
  )
}
