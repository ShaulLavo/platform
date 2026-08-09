import { use } from 'react'

import { ChatModelPickerContext } from '@/features/chat/providers/model-picker-context'
import { clientErrors } from '@/lib/structured-errors'

export function useModelPicker() {
  const picker = use(ChatModelPickerContext)
  if (!picker) {
    throw clientErrors.CONTEXT_MISSING({
      message: 'useModelPicker must be used within ChatModelPickerContext',
    })
  }

  return picker
}
