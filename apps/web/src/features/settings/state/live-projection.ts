import type { QueryClient } from '@tanstack/react-query'
import type { SettingsOperation, SettingsSnapshot, SettingsValues } from '@workspace/contracts'

import {
  useSettingsIntentStore,
  type ActiveSettingsIntent,
} from '@/features/settings/state/intent-store'
import { projectSettings } from '@/features/settings/utils/projection'
import { settingsKeys } from '@/features/settings/utils/query-keys'

type ColorTheme = SettingsValues['workbench.colorTheme']

export function readLiveSettingsProjection(queryClient: QueryClient, fallback?: SettingsSnapshot) {
  const confirmed = queryClient.getQueryData<SettingsSnapshot>(settingsKeys.document()) ?? fallback
  if (!confirmed) return undefined

  return projectSettings(confirmed, useSettingsIntentStore.getState().active)
}

export function readLiveColorTheme(queryClient: QueryClient, fallback?: ColorTheme) {
  const projection = readLiveSettingsProjection(queryClient)
  if (projection) return projection.values['workbench.colorTheme']

  return replayActiveColorTheme(useSettingsIntentStore.getState().active, fallback)
}

function replayActiveColorTheme(
  active: readonly ActiveSettingsIntent[],
  fallback?: ColorTheme,
): ColorTheme | undefined {
  let theme = fallback
  for (const entry of active.toSorted(
    (left, right) => left.clientSequence - right.clientSequence,
  )) {
    for (const operation of entry.request.operations) {
      theme = colorThemeAfterOperation(theme, operation)
    }
  }

  return theme
}

function colorThemeAfterOperation(
  current: ColorTheme | undefined,
  operation: SettingsOperation,
): ColorTheme | undefined {
  if (operation.kind === 'set' && operation.key === 'workbench.colorTheme') {
    return operation.value
  }
  if (operation.kind === 'reset' && operation.keys.includes('workbench.colorTheme'))
    return undefined

  return current
}
