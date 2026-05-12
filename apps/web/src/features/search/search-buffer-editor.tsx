import { useEditorCommands } from "@/features/editor/state/editor-commands"
import { openWorkspaceSearchMatch } from "@/features/search/open-search-match"
import { SearchHistoryInput } from "@/features/search/search-history-input"
import { SearchResultsView } from "@/features/search/search-results-view"
import { SearchSummary } from "@/features/search/search-summary"
import {
  SearchFilterFields,
  SearchModeButtons,
  SearchReplaceFields,
  SearchReplaceToggleButton,
} from "@/features/search/search-controls"
import { useSearchBuffer } from "@/features/search/use-search-buffer"
import { useWorkspaceSearchReplace } from "@/features/search/use-search-replace"

export function SearchBufferEditor({ rootPath }: { rootPath: string }) {
  const {
    groups,
    query,
    replaceText,
    replaceVisible,
    resultsQuery,
    searchOptions,
    selectNextQuery,
    selectNextReplaceText,
    selectPreviousQuery,
    selectPreviousReplaceText,
    setQuery,
    setReplaceText,
    setReplaceVisible,
    setSearchOptions,
    snapshot,
  } = useSearchBuffer(rootPath)
  const replace = useWorkspaceSearchReplace(rootPath)
  const commands = useEditorCommands()

  return (
    <section className="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)] bg-background">
      <div className="border-b bg-muted/20 px-3 py-2">
        <div className="flex max-w-2xl items-center gap-1.5">
          <SearchHistoryInput
            aria-label="Search workspace"
            className="flex-1"
            inputClassName="h-8 pr-28 text-xs"
            label="Search"
            rightAdornment={
              <SearchModeButtons
                className="absolute top-1/2 right-1 -translate-y-1/2"
                options={searchOptions}
                onOptionsChange={setSearchOptions}
              />
            }
            type="search"
            value={query}
            onSelectNextHistory={selectNextQuery}
            onSelectPreviousHistory={selectPreviousQuery}
            onValueChange={setQuery}
          />
          <SearchReplaceToggleButton
            active={replaceVisible}
            onToggle={setReplaceVisible}
          />
        </div>
        <SearchFilterFields
          options={searchOptions}
          onOptionsChange={setSearchOptions}
        />
        <SearchReplaceFields
          canReplace={replace.canReplace}
          replaceText={replaceText}
          replaceVisible={replaceVisible}
          replacing={snapshot?.replaceStatus === "running"}
          onReplaceAll={replace.replaceAll}
          onReplaceNext={replace.replaceNext}
          onSelectNextHistory={selectNextReplaceText}
          onSelectPreviousHistory={selectPreviousReplaceText}
          onReplaceTextChange={setReplaceText}
        />
        <SearchSummary query={query.trim()} snapshot={snapshot} />
      </div>
      <SearchResultsView
        className="bg-muted/10"
        canReplace={replace.canReplace}
        groups={groups}
        query={resultsQuery}
        replaceText={replaceText}
        replaceVisible={replaceVisible}
        snapshot={snapshot}
        onOpenMatch={(match) =>
          openWorkspaceSearchMatch(match, resultsQuery, commands)
        }
        onReplaceGroup={replace.replaceGroup}
        onReplaceMatch={replace.replaceMatch}
      />
    </section>
  )
}
