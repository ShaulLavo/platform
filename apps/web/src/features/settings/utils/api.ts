import {
  errorNumberField,
  errorStringField,
  type SettingsMutationRequest,
  type SettingsMutationResult,
  type SettingsRawWriteRequest,
  type SettingsRawWriteResult,
  type SettingsSnapshot,
} from '@workspace/contracts'

import { getClient, type Client } from '@/lib/client'
import { observeClientOperation } from '@/lib/client-logging'
import { toClientError } from '@/lib/client-error-taxonomy'
import { unwrapEdenResponse } from '@/lib/eden-events'
import { createClientInvariantError } from '@/lib/structured-errors'

export async function fetchSettings(
  signal?: AbortSignal,
  client: Client = getClient(),
): Promise<SettingsSnapshot> {
  return observeClientOperation(
    { action: 'settings.read', area: 'settings', signal },
    async () => {
      const response = await client.settings.get({ fetch: { signal } })

      return unwrapEdenResponse(response, {
        requireData: true,
        emptyMessage: 'settings server returned an empty response',
      })
    },
    summarizeSettings,
  )
}

export async function saveSettings(
  request: SettingsMutationRequest,
  client: Client = getClient(),
): Promise<SettingsMutationResult> {
  const response = await client.settings.write.post(request)

  return unwrapEdenResponse(response, {
    requireData: true,
    emptyMessage: 'settings server returned an empty response',
  })
}

/** Whole-document compare-and-swap for the raw JSON editor. */
export async function saveSettingsText(
  request: SettingsRawWriteRequest,
  client: Client = getClient(),
): Promise<SettingsRawWriteResult> {
  return observeClientOperation(
    {
      action: 'settings.write-raw',
      area: 'settings',
      target: request.target,
      writeId: request.writeId,
    },
    () => postRawWithRetry(request, client),
    summarizeRawWriteResult,
    rawWriteFailureOutcome,
  )
}

async function postRawWithRetry(request: SettingsRawWriteRequest, client: Client) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await client.settings.raw.post(request)
      return unwrapEdenResponse(response, {
        requireData: true,
        emptyMessage: 'settings server returned an empty response',
      })
    } catch (error) {
      if (!shouldRetryRawTransport(error) || attempt === 2) throw error

      await new Promise<void>((resolve) => globalThis.setTimeout(resolve, 100 * 2 ** attempt))
    }
  }

  throw createClientInvariantError('Raw settings retry ended without a result')
}

function shouldRetryRawTransport(error: unknown) {
  if (errorStringField(error, 'code') === 'settings.RAW_REVISION_STALE') return false
  if (toClientError(error).category === 'connectivity') return true

  const status = errorNumberField(error, 'status') ?? errorNumberField(error, 'statusCode')
  return status !== undefined && status >= 500
}

function summarizeRawWriteResult(result: SettingsRawWriteResult) {
  return {
    appliedEpoch: result.appliedVersion.epoch,
    appliedSequence: result.appliedVersion.sequence,
    changedSettingIds: result.changedSettingIds,
    duplicate: result.duplicate,
    outcome: result.duplicate ? 'duplicate-ack' : 'applied',
    snapshotEpoch: result.snapshot.serverVersion.epoch,
    snapshotSequence: result.snapshot.serverVersion.sequence,
  }
}

function rawWriteFailureOutcome(error: unknown) {
  const code = errorStringField(error, 'code')
  if (code === 'settings.RAW_REVISION_STALE') return 'raw-conflict'
  if (code === 'settings.WRITE_CONTENDED') return 'contended'

  const status = errorNumberField(error, 'status') ?? errorNumberField(error, 'statusCode')
  if (status !== undefined && status >= 400 && status < 500) return 'rejected'

  return 'transport-failed'
}

function summarizeSettings(snapshot: SettingsSnapshot) {
  return {
    diagnosticCount: snapshot.diagnostics.length,
    hiddenModelCount: snapshot.values['models.hidden'].length,
    keybindingOverrideCount: Object.keys(snapshot.values['keybindings.overrides']).length,
    providerInstanceCount: snapshot.values['providers.instances'].length,
    settingsEpoch: snapshot.serverVersion.epoch,
    settingsSequence: snapshot.serverVersion.sequence,
  }
}
