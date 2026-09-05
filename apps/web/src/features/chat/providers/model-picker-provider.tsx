import type { ModelSelection } from '@workspace/contracts'
import { useMemo, type ReactNode } from 'react'

import { reconcileModelEffort } from '@/features/chat/utils/model-effort'
import {
  ChatModelPickerContext,
  type ChatModelPicker,
} from '@/features/chat/providers/model-picker-context'
import {
  useChatInputDraftStore,
  type ChatInputDraftTarget,
} from '@/features/chat/state/chat-input-draft-store'

/**
 * Owns model selection for one composer: the draft's override wins over the
 * session's committed selection, and a locked session refuses writes outright.
 * Consumers read it through `useModelPicker`, so the selection never has to be
 * sessioned down through the composer's layout components.
 *
 * The reasoning level is part of that selection rather than state of its own —
 * it lives in `ModelSelection.options`, which the draft and the session
 * projection already persist, so it is sticky per session for free.
 */
export function ChatModelPickerProvider({
  children,
  draftTarget,
  locked,
  modelSelection,
  persistModelSelection,
}: {
  readonly children: ReactNode
  readonly draftTarget: ChatInputDraftTarget
  readonly locked: boolean
  readonly modelSelection: ModelSelection | null
  /** Durable home for the pick, so the next new session starts on it. */
  readonly persistModelSelection: (modelSelection: ModelSelection) => void
}) {
  const draftModelSelection = useChatInputDraftStore(
    (state) => state.getDraft(draftTarget).modelSelection,
  )
  const setModelSelection = useChatInputDraftStore((state) => state.setModelSelection)
  const activeModelSelection = draftModelSelection ?? modelSelection
  // Context value identity: a fresh object every render would rerender every
  // picker consumer, including the popover list while it is open.
  const value = useMemo<ChatModelPicker>(() => {
    function commit(nextModelSelection: ModelSelection) {
      // Write the draft override first so the trigger never flickers while the
      // project default round-trips through the projection.
      setModelSelection(draftTarget, nextModelSelection)
      persistModelSelection(nextModelSelection)
    }

    return {
      locked,
      modelSelection: activeModelSelection,
      selectModel: (option) => {
        if (locked) return

        commit(reconcileModelEffort(activeModelSelection, option.modelSelection, option))
      },
    }
  }, [activeModelSelection, draftTarget, locked, persistModelSelection, setModelSelection])

  return <ChatModelPickerContext value={value}>{children}</ChatModelPickerContext>
}
