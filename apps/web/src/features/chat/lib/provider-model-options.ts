import type { ModelSelection, ProviderSnapshot } from '@workspace/contracts'

export type ProviderModelOption = {
  enabled: boolean
  key: string
  label: string
  modelSelection: ModelSelection
  providerLabel: string
  statusLabel: string
}

export function providerModelSelectionKey(modelSelection: ModelSelection) {
  return `${modelSelection.providerInstanceId}:${modelSelection.model}`
}

export function providerModelOptions(providers: readonly ProviderSnapshot[] | undefined) {
  if (!providers) return []

  return providers.flatMap(providerOptions)
}

function providerOptions(provider: ProviderSnapshot): ProviderModelOption[] {
  if (provider.models.length === 0) return []

  return provider.models.map((model) => ({
    enabled: providerModelOptionEnabled(provider),
    key: providerModelSelectionKey({
      model: model.slug,
      providerInstanceId: provider.providerInstanceId,
    }),
    label: model.shortName ?? model.name,
    modelSelection: {
      model: model.slug,
      providerInstanceId: provider.providerInstanceId,
    },
    providerLabel: provider.displayLabel,
    statusLabel: providerModelOptionStatusLabel(provider),
  }))
}

function providerModelOptionEnabled(provider: ProviderSnapshot) {
  if (!provider.enabled) return false
  if (!provider.installed) return false
  if (provider.availability === 'unavailable') return false

  return provider.status === 'ready' || provider.status === 'warning'
}

function providerModelOptionStatusLabel(provider: ProviderSnapshot) {
  if (provider.status === 'ready') return 'Ready'
  if (provider.status === 'warning') return provider.message ?? 'Warning'
  if (provider.status === 'disabled') return 'Disabled'

  return provider.message ?? 'Error'
}
