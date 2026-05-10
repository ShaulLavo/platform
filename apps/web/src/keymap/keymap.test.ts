import { describe, expect, it } from "bun:test"

import { activePlatformKeyBindings } from "./active-bindings"
import { commandHotkeyMeta, platformCommandSpec } from "./command-registry"
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

  it("exposes editor command metadata", () => {
    expect(platformCommandSpec("editor.find")).toMatchObject({
      category: "Editor",
      title: "Find",
    })
  })
})

function binding(
  keys: string,
  command: PlatformCommandId,
  pane: PlatformKeyBinding["pane"]
): PlatformKeyBinding {
  return {
    command,
    hotkey: keys,
    keys,
    pane,
    source: "default",
  }
}

function commands(bindings: readonly PlatformKeyBinding[]) {
  return bindings.map((keyBinding) => keyBinding.command)
}
