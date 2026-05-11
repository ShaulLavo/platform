import {
  detectPlatform,
  normalizeRegisterableHotkey,
  type RegisterableHotkey,
} from "@tanstack/react-hotkeys"

import { commandHotkeyMeta } from "./command-registry"
import type {
  EditorPlatformCommandId,
  PlatformCommandId,
  PlatformKeyBinding,
  WorkspaceCommandId,
} from "./types"

type PlatformName = ReturnType<typeof detectPlatform>

type DefaultBindingSpec = {
  readonly command: PlatformCommandId
  readonly hotkey: RegisterableHotkey
  readonly pane?: PlatformKeyBinding["pane"]
  readonly platforms?: readonly PlatformName[]
  readonly preventDefault?: boolean
  readonly stopPropagation?: boolean
  readonly vscodeCommandId?: string
}

export function defaultPlatformKeyBindings(
  platform: PlatformName = detectPlatform()
): readonly PlatformKeyBinding[] {
  return defaultBindingSpecs.flatMap((spec) =>
    bindingForPlatform(spec, platform)
  )
}

function bindingForPlatform(
  spec: DefaultBindingSpec,
  platform: PlatformName
): readonly PlatformKeyBinding[] {
  if (!specMatchesPlatform(spec, platform)) return []

  return [
    {
      command: spec.command,
      hotkey: spec.hotkey,
      keys: normalizeRegisterableHotkey(spec.hotkey, platform),
      meta: commandHotkeyMeta(spec.command),
      pane: spec.pane ?? "any",
      preventDefault: spec.preventDefault,
      source: "default",
      stopPropagation: spec.stopPropagation,
      vscodeCommandId: spec.vscodeCommandId,
    },
  ]
}

function specMatchesPlatform(spec: DefaultBindingSpec, platform: PlatformName) {
  if (!spec.platforms) return true

  return spec.platforms.includes(platform)
}

function workspaceBinding(
  hotkey: RegisterableHotkey,
  command: WorkspaceCommandId,
  options: Omit<DefaultBindingSpec, "command" | "hotkey" | "pane"> = {}
): DefaultBindingSpec {
  return { command, hotkey, pane: "any", ...options }
}

function editorBinding(
  hotkey: RegisterableHotkey,
  command: EditorPlatformCommandId,
  vscodeCommandId: string,
  options: Omit<
    DefaultBindingSpec,
    "command" | "hotkey" | "pane" | "vscodeCommandId"
  > = {}
): DefaultBindingSpec {
  return { command, hotkey, pane: "editor", vscodeCommandId, ...options }
}

const defaultBindingSpecs = [
  workspaceBinding("Mod+Shift+P", "workspace.showCommandPalette", {
    preventDefault: true,
    stopPropagation: true,
    vscodeCommandId: "workbench.action.showCommands",
  }),
  workspaceBinding("F1", "workspace.showCommandPalette", {
    preventDefault: true,
    stopPropagation: true,
    vscodeCommandId: "workbench.action.showCommands",
  }),
  workspaceBinding("Mod+P", "workspace.showQuickAccess", {
    preventDefault: true,
    stopPropagation: true,
    vscodeCommandId: "workbench.action.quickOpen",
  }),
  workspaceBinding("Mod+1", "workspace.focusFileTree"),
  workspaceBinding("Mod+2", "workspace.focusEditor"),
  workspaceBinding("Mod+3", "workspace.focusGit"),
  workspaceBinding("Mod+W", "workspace.closeCurrentTab", {
    vscodeCommandId: "workbench.action.closeActiveEditor",
  }),
  workspaceBinding("Mod+Shift+D", "workspace.toggleDiffViewMode"),

  editorBinding("Mod+Z", "editor.undo", "undo"),
  editorBinding("Mod+Shift+Z", "editor.redo", "redo"),
  editorBinding("Control+Y", "editor.redo", "redo", {
    platforms: ["windows", "linux"],
  }),
  editorBinding("Mod+A", "editor.selectAll", "editor.action.selectAll"),

  editorBinding("Mod+F", "editor.find", "actions.find"),
  editorBinding(
    "Mod+H",
    "editor.findReplace",
    "editor.action.startFindReplaceAction",
    { platforms: ["windows", "linux"] }
  ),
  editorBinding(
    "Mod+Alt+F",
    "editor.findReplace",
    "editor.action.startFindReplaceAction",
    { platforms: ["mac"] }
  ),
  editorBinding("F3", "editor.findNext", "editor.action.nextMatchFindAction"),
  editorBinding(
    "Mod+G",
    "editor.findNext",
    "editor.action.nextMatchFindAction",
    {
      platforms: ["mac"],
    }
  ),
  editorBinding(
    "Shift+F3",
    "editor.findPrevious",
    "editor.action.previousMatchFindAction"
  ),
  editorBinding(
    "Mod+Shift+G",
    "editor.findPrevious",
    "editor.action.previousMatchFindAction",
    { platforms: ["mac"] }
  ),
  editorBinding("Escape", "editor.closeFind", "closeFindWidget"),
  editorBinding("Shift+Escape", "editor.closeFind", "closeFindWidget"),
  editorBinding(
    "Alt+C",
    "editor.toggleFindCaseSensitive",
    "toggleFindCaseSensitive",
    { platforms: ["windows", "linux"] }
  ),
  editorBinding(
    "Mod+Alt+C",
    "editor.toggleFindCaseSensitive",
    "toggleFindCaseSensitive",
    { platforms: ["mac"] }
  ),
  editorBinding("Alt+W", "editor.toggleFindWholeWord", "toggleFindWholeWord", {
    platforms: ["windows", "linux"],
  }),
  editorBinding(
    "Mod+Alt+W",
    "editor.toggleFindWholeWord",
    "toggleFindWholeWord",
    { platforms: ["mac"] }
  ),
  editorBinding("Alt+R", "editor.toggleFindRegex", "toggleFindRegex", {
    platforms: ["windows", "linux"],
  }),
  editorBinding("Mod+Alt+R", "editor.toggleFindRegex", "toggleFindRegex", {
    platforms: ["mac"],
  }),
  editorBinding("Alt+L", "editor.toggleFindInSelection", "toggleSearchScope", {
    platforms: ["windows", "linux"],
  }),
  editorBinding(
    "Mod+Alt+L",
    "editor.toggleFindInSelection",
    "toggleSearchScope",
    { platforms: ["mac"] }
  ),
  editorBinding("Alt+P", "editor.togglePreserveCase", "togglePreserveCase", {
    platforms: ["windows", "linux"],
  }),
  editorBinding(
    "Mod+Alt+P",
    "editor.togglePreserveCase",
    "togglePreserveCase",
    {
      platforms: ["mac"],
    }
  ),
  editorBinding("Mod+Shift+1", "editor.replaceOne", "editor.action.replaceOne"),
  editorBinding(
    "Mod+Alt+Enter",
    "editor.replaceAll",
    "editor.action.replaceAll"
  ),
  editorBinding(
    "Alt+Enter",
    "editor.selectAllMatches",
    "editor.action.selectAllMatches"
  ),
  editorBinding(
    "Mod+D",
    "editor.addNextOccurrence",
    "editor.action.addSelectionToNextFindMatch"
  ),

  editorBinding("Backspace", "editor.deleteBackward", "deleteLeft"),
  editorBinding("Shift+Backspace", "editor.deleteBackward", "deleteLeft"),
  editorBinding("Control+H", "editor.deleteBackward", "deleteLeft", {
    platforms: ["mac"],
  }),
  editorBinding("Delete", "editor.deleteForward", "deleteRight"),
  editorBinding("Control+D", "editor.deleteForward", "deleteRight", {
    platforms: ["mac"],
  }),
  editorBinding("Tab", "editor.indentSelection", "tab"),
  editorBinding("Shift+Tab", "editor.outdentSelection", "outdent"),

  editorBinding("ArrowLeft", "editor.cursorLeft", "cursorLeft"),
  editorBinding("Control+B", "editor.cursorLeft", "cursorLeft", {
    platforms: ["mac"],
  }),
  editorBinding("ArrowRight", "editor.cursorRight", "cursorRight"),
  editorBinding("Control+F", "editor.cursorRight", "cursorRight", {
    platforms: ["mac"],
  }),
  editorBinding("ArrowUp", "editor.cursorUp", "cursorUp"),
  editorBinding("Control+P", "editor.cursorUp", "cursorUp", {
    platforms: ["mac"],
  }),
  editorBinding("ArrowDown", "editor.cursorDown", "cursorDown"),
  editorBinding("Control+N", "editor.cursorDown", "cursorDown", {
    platforms: ["mac"],
  }),
  editorBinding("Shift+ArrowLeft", "editor.selectLeft", "cursorLeftSelect"),
  editorBinding("Shift+ArrowRight", "editor.selectRight", "cursorRightSelect"),
  editorBinding("Shift+ArrowUp", "editor.selectUp", "cursorUpSelect"),
  editorBinding("Shift+ArrowDown", "editor.selectDown", "cursorDownSelect"),
  editorBinding("PageUp", "editor.cursorPageUp", "cursorPageUp"),
  editorBinding("PageDown", "editor.cursorPageDown", "cursorPageDown"),
  editorBinding("Shift+PageUp", "editor.selectPageUp", "cursorPageUpSelect"),
  editorBinding(
    "Shift+PageDown",
    "editor.selectPageDown",
    "cursorPageDownSelect"
  ),

  editorBinding("Alt+ArrowLeft", "editor.cursorWordLeft", "cursorWordLeft", {
    platforms: ["mac"],
  }),
  editorBinding(
    "Control+ArrowLeft",
    "editor.cursorWordLeft",
    "cursorWordLeft",
    {
      platforms: ["windows", "linux"],
    }
  ),
  editorBinding(
    "Alt+ArrowRight",
    "editor.cursorWordRight",
    "cursorWordEndRight",
    {
      platforms: ["mac"],
    }
  ),
  editorBinding(
    "Control+ArrowRight",
    "editor.cursorWordRight",
    "cursorWordEndRight",
    { platforms: ["windows", "linux"] }
  ),
  editorBinding(
    "Alt+Shift+ArrowLeft",
    "editor.selectWordLeft",
    "cursorWordLeftSelect",
    { platforms: ["mac"] }
  ),
  editorBinding(
    "Control+Shift+ArrowLeft",
    "editor.selectWordLeft",
    "cursorWordLeftSelect",
    { platforms: ["windows", "linux"] }
  ),
  editorBinding(
    "Alt+Shift+ArrowRight",
    "editor.selectWordRight",
    "cursorWordEndRightSelect",
    { platforms: ["mac"] }
  ),
  editorBinding(
    "Control+Shift+ArrowRight",
    "editor.selectWordRight",
    "cursorWordEndRightSelect",
    { platforms: ["windows", "linux"] }
  ),

  editorBinding("Home", "editor.cursorLineStart", "cursorHome"),
  editorBinding("End", "editor.cursorLineEnd", "cursorEnd"),
  editorBinding("Shift+Home", "editor.selectLineStart", "cursorHomeSelect"),
  editorBinding("Shift+End", "editor.selectLineEnd", "cursorEndSelect"),
  editorBinding("Mod+ArrowLeft", "editor.cursorLineStart", "cursorHome", {
    platforms: ["mac"],
  }),
  editorBinding("Mod+ArrowRight", "editor.cursorLineEnd", "cursorEnd", {
    platforms: ["mac"],
  }),
  editorBinding(
    "Mod+Shift+ArrowLeft",
    "editor.selectLineStart",
    "cursorHomeSelect",
    { platforms: ["mac"] }
  ),
  editorBinding(
    "Mod+Shift+ArrowRight",
    "editor.selectLineEnd",
    "cursorEndSelect",
    { platforms: ["mac"] }
  ),
  editorBinding("Control+A", "editor.cursorLineStart", "cursorLineStart", {
    platforms: ["mac"],
  }),
  editorBinding("Control+E", "editor.cursorLineEnd", "cursorLineEnd", {
    platforms: ["mac"],
  }),
  editorBinding(
    "Control+Shift+A",
    "editor.selectLineStart",
    "cursorLineStartSelect",
    { platforms: ["mac"] }
  ),
  editorBinding(
    "Control+Shift+E",
    "editor.selectLineEnd",
    "cursorLineEndSelect",
    { platforms: ["mac"] }
  ),

  editorBinding("Mod+ArrowUp", "editor.cursorDocumentStart", "cursorTop", {
    platforms: ["mac"],
  }),
  editorBinding("Mod+ArrowDown", "editor.cursorDocumentEnd", "cursorBottom", {
    platforms: ["mac"],
  }),
  editorBinding("Control+Home", "editor.cursorDocumentStart", "cursorTop", {
    platforms: ["windows", "linux"],
  }),
  editorBinding("Control+End", "editor.cursorDocumentEnd", "cursorBottom", {
    platforms: ["windows", "linux"],
  }),
  editorBinding(
    "Mod+Shift+ArrowUp",
    "editor.selectDocumentStart",
    "cursorTopSelect",
    { platforms: ["mac"] }
  ),
  editorBinding(
    "Mod+Shift+ArrowDown",
    "editor.selectDocumentEnd",
    "cursorBottomSelect",
    { platforms: ["mac"] }
  ),
  editorBinding(
    "Control+Shift+Home",
    "editor.selectDocumentStart",
    "cursorTopSelect",
    { platforms: ["windows", "linux"] }
  ),
  editorBinding(
    "Control+Shift+End",
    "editor.selectDocumentEnd",
    "cursorBottomSelect",
    { platforms: ["windows", "linux"] }
  ),
  editorBinding(
    "F12",
    "editor.goToDefinition",
    "editor.action.revealDefinition"
  ),
] satisfies readonly DefaultBindingSpec[]
