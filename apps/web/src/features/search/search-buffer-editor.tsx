import { MagnifyingGlassIcon } from "@phosphor-icons/react"

import { useEditorCommands } from "@/features/editor/state/editor-commands"
import { openWorkspaceSearchMatch } from "@/features/search/open-search-match"
import { SearchResultsView } from "@/features/search/search-results-view"
import { SearchSummary } from "@/features/search/search-summary"
import { useSearchBuffer } from "@/features/search/use-search-buffer"
import { Input } from "@workspace/ui/components/input"

export function SearchBufferEditor({ rootPath }: { rootPath: string }) {
  const { groups, query, resultsQuery, setQuery, snapshot } =
    useSearchBuffer(rootPath)
  const commands = useEditorCommands()

  return (
    <section className="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)] bg-background">
      <div className="border-b bg-muted/20 px-3 py-2">
        <div className="relative max-w-2xl">
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
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        <SearchSummary query={query.trim()} snapshot={snapshot} />
      </div>
      <SearchResultsView
        className="bg-muted/10"
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
