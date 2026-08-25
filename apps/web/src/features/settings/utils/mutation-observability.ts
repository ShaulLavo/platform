import { modelRefKey, type SettingId, type SettingsOperation } from '@workspace/contracts'

import type { ActiveSettingsIntent } from '@/features/settings/state/intent-store'

export function settingsMutationLogContext(entry: ActiveSettingsIntent) {
  const metadata = operationMetadata(entry.request.operations)

  return {
    affectedIds: metadata.affectedIds,
    clientSequence: entry.clientSequence,
    initiator: entry.initiator,
    mutationId: entry.request.mutationId,
    operationKinds: entry.request.operations.map((operation) => operation.kind),
    settingIds: metadata.settingIds,
    target: entry.request.target,
  }
}

function operationMetadata(operations: readonly SettingsOperation[]) {
  const settingIds: SettingId[] = []
  const affectedIds: string[] = []
  for (const operation of operations) appendOperationMetadata(operation, settingIds, affectedIds)

  return { affectedIds, settingIds }
}

function appendOperationMetadata(
  operation: SettingsOperation,
  settingIds: SettingId[],
  affectedIds: string[],
) {
  if (operation.kind === 'set') return appendUnique(settingIds, operation.key)
  if (operation.kind === 'reset') {
    for (const key of operation.keys) appendUnique(settingIds, key)
    return
  }
  if (operation.kind === 'keybinding.set' || operation.kind === 'keybinding.remove') {
    appendUnique(settingIds, 'keybindings.overrides')
    appendUnique(affectedIds, operation.command)
    return
  }
  if (operation.kind === 'model.setHidden') {
    appendUnique(settingIds, 'models.hidden')
    appendUnique(affectedIds, modelRefKey(operation.ref))
    return
  }
  if (operation.kind === 'model.setOrder') {
    appendUnique(settingIds, 'models.order')
    for (const ref of operation.order) appendUnique(affectedIds, modelRefKey(ref))
    return
  }

  appendUnique(settingIds, 'providers.instances')
  appendUnique(affectedIds, operation.providerInstanceId)
}

function appendUnique<T>(target: T[], value: T) {
  if (!target.includes(value)) target.push(value)
}
