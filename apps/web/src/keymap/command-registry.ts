import type { EditorCommandId } from "@editor/core"

import type {
  EditorPlatformCommandId,
  PlatformCommandId,
  WorkspaceCommandId,
} from "./types"

export type CommandSpec<Id extends PlatformCommandId = PlatformCommandId> = {
  readonly id: Id
  readonly title: string
  readonly category: string
  readonly description?: string
  readonly argsSchema?: unknown
}

export const workspaceCommandSpecs = [
  workspaceCommand(
    "workspace.openFilePicker",
    "Open file picker",
    "Open the workspace file picker."
  ),
  workspaceCommand(
    "workspace.focusEditor",
    "Focus editor",
    "Move keyboard focus to the editor."
  ),
  workspaceCommand(
    "workspace.focusFileTree",
    "Focus file tree",
    "Move keyboard focus to the file tree."
  ),
  workspaceCommand(
    "workspace.focusGit",
    "Focus Git",
    "Move keyboard focus to the Git panel."
  ),
  workspaceCommand(
    "workspace.closeCurrentTab",
    "Close current tab",
    "Close the selected editor tab."
  ),
  workspaceCommand(
    "workspace.toggleDiffViewMode",
    "Toggle diff view mode",
    "Switch the active diff viewer between split and unified modes."
  ),
] satisfies readonly CommandSpec<WorkspaceCommandId>[]

export const editorCommandSpecs = [
  editorCommand("undo", "Undo"),
  editorCommand("redo", "Redo"),
  editorCommand("find", "Find"),
  editorCommand("findReplace", "Find and replace"),
  editorCommand("findNext", "Find next"),
  editorCommand("findPrevious", "Find previous"),
  editorCommand("goToDefinition", "Go to definition"),
  editorCommand("closeFind", "Close find"),
  editorCommand("toggleFindCaseSensitive", "Toggle case sensitive find"),
  editorCommand("toggleFindWholeWord", "Toggle whole word find"),
  editorCommand("toggleFindRegex", "Toggle regex find"),
  editorCommand("toggleFindInSelection", "Toggle find in selection"),
  editorCommand("togglePreserveCase", "Toggle preserve case"),
  editorCommand("replaceOne", "Replace"),
  editorCommand("replaceAll", "Replace all"),
  editorCommand("selectAllMatches", "Select all matches"),
  editorCommand("selectAll", "Select all"),
  editorCommand("addNextOccurrence", "Add next occurrence"),
  editorCommand("clearSecondarySelections", "Clear secondary selections"),
  editorCommand("deleteBackward", "Delete backward"),
  editorCommand("deleteForward", "Delete forward"),
  editorCommand("indentSelection", "Indent selection"),
  editorCommand("outdentSelection", "Outdent selection"),
  editorCommand("cursorLeft", "Move cursor left"),
  editorCommand("cursorRight", "Move cursor right"),
  editorCommand("cursorUp", "Move cursor up"),
  editorCommand("cursorDown", "Move cursor down"),
  editorCommand("selectLeft", "Select left"),
  editorCommand("selectRight", "Select right"),
  editorCommand("selectUp", "Select up"),
  editorCommand("selectDown", "Select down"),
  editorCommand("cursorWordLeft", "Move cursor word left"),
  editorCommand("cursorWordRight", "Move cursor word right"),
  editorCommand("selectWordLeft", "Select word left"),
  editorCommand("selectWordRight", "Select word right"),
  editorCommand("cursorLineStart", "Move cursor to line start"),
  editorCommand("cursorLineEnd", "Move cursor to line end"),
  editorCommand("selectLineStart", "Select to line start"),
  editorCommand("selectLineEnd", "Select to line end"),
  editorCommand("cursorPageUp", "Move cursor page up"),
  editorCommand("cursorPageDown", "Move cursor page down"),
  editorCommand("selectPageUp", "Select page up"),
  editorCommand("selectPageDown", "Select page down"),
  editorCommand("cursorDocumentStart", "Move cursor to document start"),
  editorCommand("cursorDocumentEnd", "Move cursor to document end"),
  editorCommand("selectDocumentStart", "Select to document start"),
  editorCommand("selectDocumentEnd", "Select to document end"),
] satisfies readonly CommandSpec<EditorPlatformCommandId>[]

export const platformCommandSpecs = [
  ...workspaceCommandSpecs,
  ...editorCommandSpecs,
] satisfies readonly CommandSpec[]

export function platformCommandSpec(
  command: PlatformCommandId
): CommandSpec | null {
  return platformCommandSpecById.get(command) ?? null
}

export function commandHotkeyMeta(command: PlatformCommandId) {
  const spec = platformCommandSpec(command)
  if (!spec) return undefined
  if (!spec.description) return { name: spec.title }

  return {
    description: spec.description,
    name: spec.title,
  }
}

const platformCommandSpecById = new Map(
  platformCommandSpecs.map((spec) => [spec.id, spec])
)

function workspaceCommand(
  id: WorkspaceCommandId,
  title: string,
  description: string
): CommandSpec<WorkspaceCommandId> {
  return { category: "Workspace", description, id, title }
}

function editorCommand(
  id: EditorCommandId,
  title: string
): CommandSpec<EditorPlatformCommandId> {
  return { category: "Editor", id: `editor.${id}`, title }
}
