import type { ModelSelection } from '@workspace/contracts'
import { createContext } from 'react'

import type { ProviderModelOption } from '@/features/chat/utils/provider-model-options'

export type ChatModelPicker = {
  /** True while the thread pins its provider and model, so the picker is read-only. */
  readonly locked: boolean
  /** The selection the composer will send with the next turn, or null when no provider offers one. */
  readonly modelSelection: ModelSelection | null
  /** Takes the picker row, not a bare selection, so the level can be reconciled against the new model. */
  readonly selectModel: (option: ProviderModelOption) => void
}

export const ChatModelPickerContext = createContext<ChatModelPicker | null>(null)
