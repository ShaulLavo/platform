import { Component, useMemo, type ReactNode } from "react"
import type { EditorKeyBinding } from "@editor/core"

import { useEditorCommands } from "@/features/editor/state/editor-commands"
import { openWorkspaceSearchMatch } from "@/features/search/open-search-match"
import { SearchHistoryInput } from "@/features/search/search-history-input"
import { SearchResultsView } from "@/features/search/search-results-view"
import { SearchSummary } from "@/features/search/search-summary"
import { SearchResultDocumentEditor } from "@/features/search/search-result-document-editor"
import {
  searchResultDocument,
  type SearchResultOpenTarget,
} from "@/features/search/search-result-document"
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
  editorKeyBindings,
  rootPath,
}: {
  editorKeyBindings: readonly EditorKeyBinding[]
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
  const replace = useWorkspaceSearchReplace(rootPath)
  const commands = useEditorCommands()
  const searchDocument = useMemo(
    () => searchResultDocument(groups, resultsQuery),
    [groups, resultsQuery]
  )

  function handleOpenTarget(target: SearchResultOpenTarget) {
    if (!target.match) {
      commands.selectFile(target.path)
      return
    }

    openWorkspaceSearchMatch(target.match, resultsQuery, commands)
  }

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
      {groups.length > 0 && snapshot ? (
        <SearchResultDocumentBoundary
          fallback={
            <SearchBufferResultList
              canReplace={replace.canReplace}
              commands={commands}
              groups={groups}
              replaceGroup={replace.replaceGroup}
              replaceMatch={replace.replaceMatch}
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
            keymapBindings={editorKeyBindings}
            onOpenTarget={handleOpenTarget}
            onSelectResult={selectResult}
          />
        </SearchResultDocumentBoundary>
      ) : (
        <SearchBufferResultList
          canReplace={replace.canReplace}
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
