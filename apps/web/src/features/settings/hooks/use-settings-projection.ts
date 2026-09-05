import { useSettingsIntentStore } from '@/features/settings/state/intent-store'
import { useQueryClient } from '@tanstack/react-query'
import { projectSettings, type SettingsProjection } from '@/features/settings/utils/projection'

import { useSettingsDocument } from '@/features/settings/hooks/use-settings-document'

export type { SettingsProjection } from '@/features/settings/utils/projection'

/** Effective settings after replaying local semantic intent over confirmed state. */
export function useSettingsProjection(): SettingsProjection | undefined {
  const document = useSettingsDocument()
  const queryClient = useQueryClient()
  const active = useSettingsIntentStore((state) => state.active)
  if (!document.data) return undefined

  return projectSettings(
    document.data,
    active.filter((entry) => entry.owner === queryClient),
  )
}
