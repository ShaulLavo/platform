import { useCallback } from "react"
import type { EditorKeymapLayer } from "@editor/core"

import { useEditorCommands } from "@/features/editor/state/editor-commands"
import { openWorkspaceSearchMatch } from "@/features/search/open-search-match"
import { SearchHistoryInput } from "@/features/search/search-history-input"
import { SearchSummary } from "@/features/search/search-summary"
import { SearchResultEditorSurface } from "@/features/search/search-result-editor-surface"
import type { SearchResultOpenTarget } from "@/features/search/search-result-view-model"
import {
  SearchErrorState,
  SearchIdleState,
  SearchPendingOrEmpty,
} from "@/features/search/search-status-states"
import {
  SearchFilterFields,
  SearchModeButtons,
  SearchReplaceFields,
  SearchReplaceToggleButton,
} from "@/features/search/search-controls"
import { useSearchBuffer } from "@/features/search/use-search-buffer"
import { useSearchBufferState } from "@/features/search/search-buffer-state"
import { useWorkspaceSearchReplace } from "@/features/search/use-search-replace"

export function SearchBufferEditor({
  editorKeymapLayers,
  rootPath,
}: {
  editorKeymapLayers: readonly EditorKeymapLayer[]
  rootPath: string
}) {
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
  const selectResult = useSearchBufferState((state) => state.selectResult)
  const toggleGroup = useSearchBufferState((state) => state.toggleGroup)
  const replace = useWorkspaceSearchReplace(rootPath)
  const commands = useEditorCommands()
  const resultCanReplace = replaceVisible ? replace.canReplace : false

  const handleOpenTarget = useCallback(
    (target: SearchResultOpenTarget) => {
      if (!target.match) {
        commands.selectFile(target.path)
        return
      }

      openWorkspaceSearchMatch(target.match, resultsQuery, commands)
    },
    [commands, resultsQuery]
  )

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
        <SearchSummary query={query} snapshot={snapshot} />
      </div>
      {groups.length > 0 && snapshot ? (
        <SearchResultEditorSurface
          activeResultId={snapshot.activeResultId}
          canReplace={resultCanReplace}
          deferredPluginMode="immediate"
          groups={groups}
          keymapLayers={editorKeymapLayers}
          prewarmEditorPool={snapshot.status !== "loading"}
          replaceVisible={replaceVisible}
          resultsQuery={resultsQuery}
          displayedResultsQuery={snapshot.resultsSearchQuery?.query ?? null}
          onOpenTarget={handleOpenTarget}
          onReplaceGroup={replace.replaceGroup}
          onReplaceMatch={replace.replaceMatch}
          onSelectResult={selectResult}
          onToggleGroup={toggleGroup}
        />
      ) : (
        <SearchBufferStatusState snapshot={snapshot} />
      )}
    </section>
  )
}

function SearchBufferStatusState({
  snapshot,
}: {
  snapshot: ReturnType<typeof useSearchBuffer>["snapshot"]
}) {
  if (!snapshot || snapshot.status === "idle") {
    return <SearchIdleState />
  }
  if (snapshot.status === "error") {
    return <SearchErrorState message={snapshot.error} />
  }

  return <SearchPendingOrEmpty snapshot={snapshot} />
}
