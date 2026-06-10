import { useMemo } from 'react'
import {
  useHotkeys,
  type UseHotkeyDefinition,
  type UseHotkeyOptions,
} from '@tanstack/react-hotkeys'

import {
  SHELL_PROOF_HOTKEY_BINDINGS,
  shellProofHotkeyMeta,
  shellProofHotkeyOperation,
} from '@/features/shell-proof/utils/keymap'
import type { LayoutOperation, WorkspaceLayout } from '@workspace/tiling/utils/layout-types'

const SHELL_PROOF_HOTKEY_OPTIONS = {
  conflictBehavior: 'replace',
  eventType: 'keydown',
} satisfies UseHotkeyOptions

const SHELL_PROOF_HOTKEY_DEFINITION_OPTIONS = {
  preventDefault: true,
  stopPropagation: true,
} satisfies UseHotkeyOptions

export function ShellProofKeymapController({
  onDispatchLayoutOperation,
  onResetLayout,
}: {
  readonly onDispatchLayoutOperation: (
    createOperation: (layout: WorkspaceLayout) => LayoutOperation | null,
  ) => void
  readonly onResetLayout: () => void
}) {
  const definitions = useMemo<UseHotkeyDefinition[]>(
    () =>
      SHELL_PROOF_HOTKEY_BINDINGS.map((binding) => ({
        callback: () => {
          if (binding.kind === 'reset-layout') {
            onResetLayout()
            return
          }

          onDispatchLayoutOperation((layout) => shellProofHotkeyOperation(layout, binding))
        },
        hotkey: binding.hotkey,
        options: {
          ...SHELL_PROOF_HOTKEY_DEFINITION_OPTIONS,
          meta: shellProofHotkeyMeta(binding),
        },
      })),
    [onDispatchLayoutOperation, onResetLayout],
  )

  useHotkeys(definitions, SHELL_PROOF_HOTKEY_OPTIONS)

  return null
}
