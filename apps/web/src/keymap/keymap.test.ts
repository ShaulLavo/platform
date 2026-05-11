import { describe, expect, it } from "bun:test"

import { activePlatformKeyBindings } from "./active-bindings"
import { commandHotkeyMeta, platformCommandSpec } from "./command-registry"
import { defaultPlatformKeyBindings } from "./default-bindings"
import { editorKeyBindingFromPlatform } from "./editor-keymap"
import { appKeyBindingsForPane } from "./use-app-keymap"
import type { PlatformCommandId, PlatformKeyBinding } from "./types"

describe("activePlatformKeyBindings", () => {
  it("filters bindings by focused pane", () => {
    const bindings = [
      binding("Mod+1", "workspace.focusFileTree", "file-tree"),
      binding("Mod+2", "workspace.focusEditor", "editor"),
      binding("Mod+P", "workspace.openFilePicker", "any"),
    ]

    expect(commands(activePlatformKeyBindings(bindings, "editor"))).toEqual([
      "workspace.focusEditor",
      "workspace.openFilePicker",
    ])
  })

  it("prefers focused-pane bindings over global bindings for the same keys", () => {
    const bindings = [
      binding("Mod+P", "workspace.openFilePicker", "any"),
      binding("Mod+P", "workspace.focusEditor", "editor"),
    ]

    expect(commands(activePlatformKeyBindings(bindings, "editor"))).toEqual([
      "workspace.focusEditor",
    ])
  })
})

describe("appKeyBindingsForPane", () => {
  it("excludes editor command bindings from app registrations", () => {
    const bindings = [
      binding("Mod+F", "editor.find", "editor"),
      binding("Mod+P", "workspace.openFilePicker", "any"),
    ]

    expect(commands(appKeyBindingsForPane(bindings, "editor"))).toEqual([
      "workspace.openFilePicker",
    ])
  })
})

describe("editorKeyBindingFromPlatform", () => {
  it("strips the editor command prefix", () => {
    const mapped = editorKeyBindingFromPlatform(
      binding("Mod+F", "editor.find", "editor")
    )

    expect(mapped).toMatchObject({
      command: "find",
      hotkey: "Mod+F",
    })
  })

  it("rejects non-editor commands", () => {
    expect(
      editorKeyBindingFromPlatform(
        binding("Mod+P", "workspace.openFilePicker", "any")
      )
    ).toBeNull()
  })
})

describe("command registry", () => {
  it("exposes workspace command metadata for hotkey registrations", () => {
    expect(commandHotkeyMeta("workspace.openFilePicker")).toEqual({
      description: "Open the workspace file picker.",
      name: "Open file picker",
    })
  })

  it("exposes the command palette opener", () => {
    expect(platformCommandSpec("workspace.showCommandPalette")).toMatchObject({
      category: "Workspace",
      title: "Show command palette",
    })
    expect(platformCommandSpec("workspace.showQuickAccess")).toMatchObject({
      category: "Workspace",
      title: "Quick Open",
    })
  })

  it("exposes editor command metadata", () => {
    expect(platformCommandSpec("editor.find")).toMatchObject({
      category: "Editor",
      title: "Find",
      vscodeCommandIds: ["actions.find"],
    })
  })

  it("exposes requested VS Code workspace command aliases", () => {
    for (const [command, vscodeCommandId] of requestedWorkspaceAliases) {
      expect(platformCommandSpec(command)).toMatchObject({
        category: "Workspace",
        vscodeCommandIds: [vscodeCommandId],
      })
    }
  })
})

describe("defaultPlatformKeyBindings", () => {
  it("uses VS Code command aliases for supported defaults", () => {
    expect(defaultPlatformKeyBindings("linux")).toContainEqual(
      expect.objectContaining({
        command: "workspace.showCommandPalette",
        keys: "Mod+Shift+P",
        vscodeCommandId: "workbench.action.showCommands",
      })
    )
    expect(defaultPlatformKeyBindings("linux")).toContainEqual(
      expect.objectContaining({
        command: "workspace.showQuickAccess",
        keys: "Mod+P",
        vscodeCommandId: "workbench.action.quickOpen",
      })
    )
  })

  it("uses VS Code platform-specific replace shortcuts", () => {
    expect(defaultPlatformKeyBindings("mac")).toContainEqual(
      expect.objectContaining({
        command: "editor.findReplace",
        keys: "Mod+Alt+F",
      })
    )
    expect(defaultPlatformKeyBindings("linux")).toContainEqual(
      expect.objectContaining({
        command: "editor.findReplace",
        keys: "Mod+H",
      })
    )
  })

  it("uses editor-scoped group focus bindings without removing global focus bindings", () => {
    const bindings = defaultPlatformKeyBindings("linux")

    expect(commands(appKeyBindingsForPane(bindings, "global"))).toContain(
      "workspace.focusFileTree"
    )
    expect(commands(appKeyBindingsForPane(bindings, "editor"))).toContain(
      "workspace.focusFirstEditorGroup"
    )
  })
})

const requestedWorkspaceAliases = [
  [
    "workspace.quickOpenPreviousEditor",
    "workbench.action.quickOpenPreviousEditor",
  ],
  ["workspace.quickOpenView", "workbench.action.quickOpenView"],
  ["workspace.gotoSymbol", "workbench.action.gotoSymbol"],
  ["workspace.showAllEditors", "workbench.action.showAllEditors"],
  ["workspace.saveFile", "workbench.action.files.save"],
  ["workspace.saveAllFiles", "workbench.action.files.saveAll"],
  ["workspace.revertFile", "workbench.action.files.revert"],
  ["workspace.reopenClosedEditor", "workbench.action.reopenClosedEditor"],
  [
    "workspace.toggleSidebarVisibility",
    "workbench.action.toggleSidebarVisibility",
  ],
  ["workspace.togglePanel", "workbench.action.togglePanel"],
  ["workspace.focusFirstEditorGroup", "workbench.action.focusFirstEditorGroup"],
  [
    "workspace.focusSecondEditorGroup",
    "workbench.action.focusSecondEditorGroup",
  ],
  ["workspace.focusThirdEditorGroup", "workbench.action.focusThirdEditorGroup"],
  ["workspace.splitEditor", "workbench.action.splitEditor"],
] as const satisfies readonly (readonly [PlatformCommandId, string])[]

function binding(
  keys: string,
  command: PlatformCommandId,
  pane: PlatformKeyBinding["pane"]
): PlatformKeyBinding {
  return {
    command,
    hotkey: keys as PlatformKeyBinding["hotkey"],
    keys,
    pane,
    source: "default",
  }
}

function commands(bindings: readonly PlatformKeyBinding[]) {
  return bindings.map((keyBinding) => keyBinding.command)
}
