import * as React from "react"

import { AppHeader } from "@/components/app-header"
import { EmptyWorkspace } from "@/components/empty-workspace"
import {
  FilePickerDialog,
  type PickedFsEntry,
} from "@/components/file-picker-dialog"
import { WorkspaceView } from "@/components/workspace/workspace-view"
import { useSelectedFile } from "@/hooks/use-selected-file"
import { useWorkspaceTree } from "@/hooks/use-workspace-tree"
import { selectedTreeEntry } from "@/lib/tree-model"
import type { TypeScriptLspDefinitionTarget } from "@editor/typescript-lsp"

export function App() {
  const [pickerOpen, setPickerOpen] = React.useState(false)
  const [rootFolder, setRootFolder] = React.useState<PickedFsEntry | null>(null)
  const [selectedFilePath, setSelectedFilePath] = React.useState<string | null>(
    null
  )
  const [definitionTarget, setDefinitionTarget] =
    React.useState<TypeScriptLspDefinitionTarget | null>(null)
  const { loadTreeDirectory, resetTreeLoad, retryTreeLoad, treeState } =
    useWorkspaceTree(rootFolder)
  const { fileState, resetFileLoad } = useSelectedFile(selectedFilePath)
  const selectedEntry = selectedFilePath
    ? selectedTreeEntry(treeState, rootFolder?.path ?? null, selectedFilePath)
    : null

  function handlePick(entry: PickedFsEntry) {
    setSelectedFilePath(null)
    setDefinitionTarget(null)
    resetFileLoad()
    resetTreeLoad()
    setRootFolder(entry)
  }

  const openDefinition = React.useCallback(
    (target: TypeScriptLspDefinitionTarget) => {
      setDefinitionTarget(target)
      setSelectedFilePath(target.path)
      return true
    },
    []
  )

  return (
    <main className="h-svh overflow-hidden bg-background text-foreground">
      <div className="flex h-full min-h-0 flex-col">
        <AppHeader
          rootFolder={rootFolder}
          onChooseFolder={() => setPickerOpen(true)}
        />

        {rootFolder ? (
          <WorkspaceView
            definitionTarget={definitionTarget}
            fileState={fileState}
            onOpenDefinition={openDefinition}
            rootFolder={rootFolder}
            selectedEntry={selectedEntry}
            selectedFilePath={selectedFilePath}
            setSelectedFilePath={setSelectedFilePath}
            treeState={treeState}
            onLoadDirectory={loadTreeDirectory}
            onRetryTree={retryTreeLoad}
          />
        ) : (
          <EmptyWorkspace onChooseFolder={() => setPickerOpen(true)} />
        )}
      </div>

      {pickerOpen && (
        <FilePickerDialog
          mode="folder"
          onOpenChange={setPickerOpen}
          onPick={handlePick}
          open={pickerOpen}
          value={rootFolder}
        />
      )}
    </main>
  )
}
