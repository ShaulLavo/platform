import { EmptyWorkspace } from "@/components/empty-workspace"
import {
  FilePickerDialog,
  type PickedFsEntry,
} from "@/components/file-picker-dialog"
import { WorkspaceView } from "@/components/workspace/workspace-view"
import { useSelectedFile } from "@/hooks/use-selected-file"
import { useWorkspaceTree } from "@/hooks/use-workspace-tree"
import { selectedTreeEntry } from "@/lib/tree-model"
import {
  readWorkspaceCache,
  writeWorkspaceCache,
} from "@/lib/workspace-cache"
import type { TypeScriptLspDefinitionTarget } from "@editor/typescript-lsp"
import { useEffect, useState } from "react"

export function App() {
  const [cachedWorkspace] = useState(readWorkspaceCache)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [rootFolder, setRootFolder] = useState<PickedFsEntry | null>(
    cachedWorkspace.rootFolder
  )
  const [selectedFilePath, setSelectedFilePath] = useState<string | null>(
    cachedWorkspace.selectedFilePath
  )
  const [definitionTarget, setDefinitionTarget] =
    useState<TypeScriptLspDefinitionTarget | null>(null)
  const { loadTreeDirectory, resetTreeLoad, retryTreeLoad, treeState } =
    useWorkspaceTree(rootFolder)
  const { fileState, resetFileLoad } = useSelectedFile(selectedFilePath)
  const selectedEntry = selectedFilePath
    ? selectedTreeEntry(treeState, rootFolder?.path ?? null, selectedFilePath)
    : null

  useEffect(() => {
    writeWorkspaceCache({ rootFolder, selectedFilePath })
  }, [rootFolder, selectedFilePath])

  function handlePick(entry: PickedFsEntry) {
    setSelectedFilePath(null)
    setDefinitionTarget(null)
    resetFileLoad()
    resetTreeLoad()
    setRootFolder(entry)
  }

  function openDefinition(target: TypeScriptLspDefinitionTarget) {
    setDefinitionTarget(target)
    setSelectedFilePath(target.path)
    return true
  }

  return (
    <main className="h-svh overflow-hidden bg-background text-foreground">
      <div className="flex h-full min-h-0 flex-col">
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
