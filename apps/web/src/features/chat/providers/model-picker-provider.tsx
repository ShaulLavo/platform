import type { ModelSelection } from '@workspace/contracts'
import { useMemo, type ReactNode } from 'react'

import { reconcileModelEffort, withModelEffort } from '@/features/chat/lib/model-effort'
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
 * thread's committed selection, and a locked thread refuses writes outright.
 * Consumers read it through `useModelPicker`, so the selection never has to be
 * threaded down through the composer's layout components.
 *
 * The reasoning level is part of that selection rather than state of its own —
 * it lives in `ModelSelection.options`, which the draft and the thread
 * projection already persist, so it is sticky per thread for free.
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
      selectEffort: (effort: string | null) => {
        if (locked) return
        // Nothing is selected, so there is no model the level could belong to.
        if (!activeModelSelection) return

        commit(withModelEffort(activeModelSelection, effort))
      },
      selectModel: (option) => {
        if (locked) return

        commit(reconcileModelEffort(activeModelSelection, option.modelSelection, option))
      },
    }
  }, [activeModelSelection, draftTarget, locked, persistModelSelection, setModelSelection])

  return <ChatModelPickerContext value={value}>{children}</ChatModelPickerContext>
}
