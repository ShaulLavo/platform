import { Component, useCallback, useMemo, type ReactNode } from "react"
import type { EditorKeymapLayer } from "@editor/core"

import { useEditorCommands } from "@/features/editor/state/editor-commands"
import { openWorkspaceSearchMatch } from "@/features/search/open-search-match"
import { SearchHistoryInput } from "@/features/search/search-history-input"
import { SearchResultsView } from "@/features/search/search-results-view"
import { SearchSummary } from "@/features/search/search-summary"
import { SearchResultDocumentEditor } from "@/features/search/search-result-document-editor"
import { SearchResultEditorSurface } from "@/features/search/search-result-editor-surface"
import { searchResultDocument } from "@/features/search/search-result-document"
import type { SearchResultId } from "@/features/search/search-result-items"
import type { SearchResultOpenTarget } from "@/features/search/search-result-view-model"
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
        <SearchResultDocumentBoundary
          fallback={
            <SearchResultDocumentFallback
              canReplace={resultCanReplace}
              commands={commands}
              editorKeymapLayers={editorKeymapLayers}
              groups={groups}
              replaceGroup={replace.replaceGroup}
              replaceMatch={replace.replaceMatch}
              replaceText={replaceText}
              replaceVisible={replaceVisible}
              resultsQuery={resultsQuery}
              snapshot={snapshot}
              onOpenTarget={handleOpenTarget}
              onSelectResult={selectResult}
            />
          }
          resetKey={`${snapshot.id}:structured:${snapshot.runId}`}
        >
          <SearchResultEditorSurface
            activeResultId={snapshot.activeResultId}
            canReplace={resultCanReplace}
            deferredPluginMode="immediate"
            groups={groups}
            keymapLayers={editorKeymapLayers}
            pendingResultIds={snapshot.pendingResultIds}
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
        </SearchResultDocumentBoundary>
      ) : (
        <SearchBufferResultList
          canReplace={resultCanReplace}
          commands={commands}
          groups={groups}
          replaceGroup={replace.replaceGroup}
          replaceMatch={replace.replaceMatch}
          replaceText={replaceText}
          replaceVisible={replaceVisible}
          resultsQuery={resultsQuery}
          snapshot={snapshot}
        />
      )}
    </section>
  )
}

function SearchResultDocumentFallback({
  canReplace,
  commands,
  editorKeymapLayers,
  groups,
  replaceGroup,
  replaceMatch,
  replaceText,
  replaceVisible,
  resultsQuery,
  snapshot,
  onOpenTarget,
  onSelectResult,
}: {
  canReplace?: boolean
  commands: Pick<
    ReturnType<typeof useEditorCommands>,
    "openDefinition" | "selectFile"
  >
  editorKeymapLayers: readonly EditorKeymapLayer[]
  groups: ReturnType<typeof useSearchBuffer>["groups"]
  replaceGroup: ReturnType<typeof useWorkspaceSearchReplace>["replaceGroup"]
  replaceMatch: ReturnType<typeof useWorkspaceSearchReplace>["replaceMatch"]
  replaceText: string
  replaceVisible: boolean
  resultsQuery: string
  snapshot: NonNullable<ReturnType<typeof useSearchBuffer>["snapshot"]>
  onOpenTarget: (target: SearchResultOpenTarget) => void
  onSelectResult: (id: SearchResultId | null) => void
}) {
  const searchDocument = useMemo(
    () => searchResultDocument(groups, resultsQuery),
    [groups, resultsQuery]
  )

  return (
    <SearchResultDocumentBoundary
      fallback={
        <SearchBufferResultList
          canReplace={canReplace}
          commands={commands}
          groups={groups}
          replaceGroup={replaceGroup}
          replaceMatch={replaceMatch}
          replaceText={replaceText}
          replaceVisible={replaceVisible}
          resultsQuery={resultsQuery}
          snapshot={snapshot}
        />
      }
      resetKey={`${snapshot.id}:${searchDocument.text.length}:${snapshot.runId}`}
    >
      <SearchResultDocumentEditor
        activeResultId={snapshot.activeResultId}
        document={searchDocument}
        documentId={snapshot.id}
        keymapLayers={editorKeymapLayers}
        onOpenTarget={onOpenTarget}
        onSelectResult={onSelectResult}
      />
    </SearchResultDocumentBoundary>
  )
}

function SearchBufferResultList({
  canReplace,
  commands,
  groups,
  replaceGroup,
  replaceMatch,
  replaceText,
  replaceVisible,
  resultsQuery,
  snapshot,
}: {
  canReplace?: boolean
  commands: Pick<
    ReturnType<typeof useEditorCommands>,
    "openDefinition" | "selectFile"
  >
  groups: ReturnType<typeof useSearchBuffer>["groups"]
  replaceGroup: ReturnType<typeof useWorkspaceSearchReplace>["replaceGroup"]
  replaceMatch: ReturnType<typeof useWorkspaceSearchReplace>["replaceMatch"]
  replaceText: string
  replaceVisible: boolean
  resultsQuery: string
  snapshot: ReturnType<typeof useSearchBuffer>["snapshot"]
}) {
  return (
    <SearchResultsView
      className="bg-muted/10"
      canReplace={canReplace}
      groups={groups}
      query={resultsQuery}
      replaceText={replaceText}
      replaceVisible={replaceVisible}
      snapshot={snapshot}
      onOpenFile={(path) => commands.selectFile(path)}
      onOpenMatch={(match) =>
        openWorkspaceSearchMatch(match, resultsQuery, commands)
      }
      onReplaceGroup={replaceGroup}
      onReplaceMatch={replaceMatch}
    />
  )
}

class SearchResultDocumentBoundary extends Component<
  {
    children: ReactNode
    fallback: ReactNode
    resetKey: string
  },
  { failed: boolean; resetKey: string }
> {
  state = {
    failed: false,
    resetKey: this.props.resetKey,
  }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  static getDerivedStateFromProps(
    props: { resetKey: string },
    state: { failed: boolean; resetKey: string }
  ) {
    if (props.resetKey === state.resetKey) return null

    return {
      failed: false,
      resetKey: props.resetKey,
    }
  }

  render() {
    if (this.state.failed) return this.props.fallback

    return this.props.children
  }
}
