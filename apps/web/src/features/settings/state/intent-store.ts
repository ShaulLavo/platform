import {
  settingsMutationResourceKeys,
  settingsMutationResourcesIntersect,
  type SettingsMutationRequest,
  type SettingsMutationResourceKey,
  type SettingsOperation,
  type SettingsWriteTarget,
} from '@workspace/contracts'
import { create } from 'zustand'
import type { QueryClient } from '@tanstack/react-query'

import { clientInstanceId } from '@/lib/instance-id'

const transportStartedAtByMutationId = new Map<string, number>()

export type SettingsIntentSettlement = 'acknowledged' | 'discarded' | 'failed'

export type SettingsIntentHandle = {
  readonly kind: 'submitted'
  readonly mutationId: string
  readonly settled: Promise<SettingsIntentSettlement>
}

export type SettingsNoop = { readonly kind: 'noop' }
export type SettingsSubmission = SettingsIntentHandle | SettingsNoop

export type ActiveSettingsIntent = {
  readonly owner: QueryClient
  readonly clientSequence: number
  readonly enqueuedAt: number
  readonly initiator?: string
  readonly request: SettingsMutationRequest
  readonly resources: readonly TargetedResourceKey[]
  readonly settled: Promise<SettingsIntentSettlement>
  readonly status: 'acknowledged' | 'pending'
  readonly transportSettled: boolean
}

export type FailedSettingsIntent = {
  readonly owner: QueryClient
  readonly clientSequence: number
  readonly error: unknown
  readonly initiator?: string
  readonly request: SettingsMutationRequest
  readonly resources: readonly TargetedResourceKey[]
  readonly superseded: boolean
}

type MutableActiveSettingsIntent = ActiveSettingsIntent & {
  readonly resolveSettlement: (settlement: SettingsIntentSettlement) => void
}

export type TargetedResourceKey = `${SettingsWriteTarget}/${SettingsMutationResourceKey}`

type SubmitSettingsIntentResult = {
  readonly entry: ActiveSettingsIntent
  readonly supersededMutationIds: readonly string[]
}

type SettingsIntentState = {
  readonly active: readonly MutableActiveSettingsIntent[]
  readonly failed: readonly FailedSettingsIntent[]
  readonly nextClientSequence: number
  acknowledge: (mutationId: string) => ActiveSettingsIntent | null
  discard: (mutationId: string) => boolean
  discardFailed: (mutationId: string) => boolean
  fail: (mutationId: string, error: unknown) => FailedSettingsIntent | null
  retry: (mutationId: string) => ActiveSettingsIntent | null
  settleTransport: (mutationId: string) => void
  submit: (
    owner: QueryClient,
    target: SettingsWriteTarget,
    operations: readonly SettingsOperation[],
    initiator?: string,
    beforePublish?: (entry: ActiveSettingsIntent) => void,
  ) => SubmitSettingsIntentResult
}

export const useSettingsIntentStore = create<SettingsIntentState>()((set, get) => ({
  active: [],
  failed: [],
  nextClientSequence: 0,
  acknowledge: (mutationId) => {
    const entry = activeIntent(mutationId, get().active)
    if (!entry) return null
    if (entry.status === 'acknowledged') return entry

    set((state) => ({
      active: acknowledgeActiveIntent(state.active, mutationId, entry.transportSettled),
    }))
    entry.resolveSettlement('acknowledged')

    return { ...entry, status: 'acknowledged' }
  },
  discard: (mutationId) => {
    const entry = activeIntent(mutationId, get().active)
    if (!entry) return false

    set((state) => ({
      active: state.active.filter((candidate) => candidate.request.mutationId !== mutationId),
    }))
    entry.resolveSettlement('discarded')
    transportStartedAtByMutationId.delete(mutationId)
    return true
  },
  discardFailed: (mutationId) => {
    const failed = get().failed
    if (!failed.some((entry) => entry.request.mutationId === mutationId)) return false

    set({ failed: failed.filter((entry) => entry.request.mutationId !== mutationId) })
    return true
  },
  fail: (mutationId, error) => {
    const active = get().active
    const entry = activeIntent(mutationId, active)
    if (!entry) return null
    if (entry.status === 'acknowledged') return null

    const failed: FailedSettingsIntent = {
      owner: entry.owner,
      clientSequence: entry.clientSequence,
      error,
      initiator: entry.initiator,
      request: entry.request,
      resources: entry.resources,
      superseded: active.some(
        (candidate) =>
          candidate.owner === entry.owner &&
          candidate.clientSequence > entry.clientSequence &&
          targetedResourcesIntersect(candidate.resources, entry.resources),
      ),
    }
    set((state) => ({
      active: state.active.filter((candidate) => candidate.request.mutationId !== mutationId),
      failed: [...state.failed, failed],
    }))
    entry.resolveSettlement('failed')

    return failed
  },
  retry: (mutationId) => {
    const failed = get().failed.find((entry) => entry.request.mutationId === mutationId)
    if (!failed || failed.superseded) return null

    const nextSequence = get().nextClientSequence + 1
    const entry = activeEntry(failed.owner, failed.request, nextSequence, failed.initiator)
    set((state) => ({
      active: [...state.active, entry],
      failed: state.failed.filter((candidate) => candidate.request.mutationId !== mutationId),
      nextClientSequence: nextSequence,
    }))

    return entry
  },
  settleTransport: (mutationId) => {
    set((state) => ({
      active: state.active.flatMap((entry) => {
        if (entry.request.mutationId !== mutationId) return [entry]
        if (entry.status === 'acknowledged') return []

        return [{ ...entry, transportSettled: true }]
      }),
    }))
    transportStartedAtByMutationId.delete(mutationId)
  },
  submit: (owner, target, operations, initiator, beforePublish) => {
    const state = get()
    const nextSequence = state.nextClientSequence + 1
    const request: SettingsMutationRequest = {
      mutationId: settingsMutationId(nextSequence),
      operations,
      target,
    }
    const entry = activeEntry(owner, request, nextSequence, initiator)
    const supersededMutationIds = supersededFailures(owner, entry.resources, state.failed)
    beforePublish?.(entry)

    set({
      active: [...state.active, entry],
      failed: state.failed.map((failed) => {
        if (!supersededMutationIds.includes(failed.request.mutationId)) return failed

        return { ...failed, superseded: true }
      }),
      nextClientSequence: nextSequence,
    })

    return { entry, supersededMutationIds }
  },
}))

export function submitSettingsIntent(
  owner: QueryClient,
  target: SettingsWriteTarget,
  operations: readonly SettingsOperation[],
  initiator?: string,
  beforePublish?: (entry: ActiveSettingsIntent) => void,
): SubmitSettingsIntentResult {
  return useSettingsIntentStore
    .getState()
    .submit(owner, target, operations, initiator, beforePublish)
}

export function activeSettingsIntentsFor(owner: QueryClient): readonly ActiveSettingsIntent[] {
  return useSettingsIntentStore.getState().active.filter((entry) => entry.owner === owner)
}

export function acknowledgeSettingsIntent(mutationId: string): ActiveSettingsIntent | null {
  return useSettingsIntentStore.getState().acknowledge(mutationId)
}

export function failSettingsIntent(
  mutationId: string,
  error: unknown,
): FailedSettingsIntent | null {
  return useSettingsIntentStore.getState().fail(mutationId, error)
}

export function discardFailedSettingsIntent(mutationId: string): boolean {
  return useSettingsIntentStore.getState().discardFailed(mutationId)
}

export function retrySettingsIntent(mutationId: string): ActiveSettingsIntent | null {
  return useSettingsIntentStore.getState().retry(mutationId)
}

export function settleSettingsIntentTransport(mutationId: string) {
  useSettingsIntentStore.getState().settleTransport(mutationId)
}

export function settingsIntentStatus(
  mutationId: string,
): ActiveSettingsIntent['status'] | 'failed' | null {
  const state = useSettingsIntentStore.getState()
  const active = activeIntent(mutationId, state.active)
  if (active) return active.status

  return state.failed.some((entry) => entry.request.mutationId === mutationId) ? 'failed' : null
}

export function markSettingsIntentTransportStarted(mutationId: string, startedAt: number) {
  const known = transportStartedAtByMutationId.get(mutationId)
  if (known !== undefined) return known

  transportStartedAtByMutationId.set(mutationId, startedAt)
  return startedAt
}

export function settingsIntentTransportStartedAt(mutationId: string) {
  return transportStartedAtByMutationId.get(mutationId)
}

export function resetSettingsIntentStore() {
  const state = useSettingsIntentStore.getState()
  for (const entry of state.active) entry.resolveSettlement('discarded')

  useSettingsIntentStore.setState({ active: [], failed: [], nextClientSequence: 0 })
  transportStartedAtByMutationId.clear()
}

function acknowledgeActiveIntent(
  active: readonly MutableActiveSettingsIntent[],
  mutationId: string,
  transportSettled: boolean,
) {
  if (transportSettled) {
    return active.filter((entry) => entry.request.mutationId !== mutationId)
  }

  return active.map((entry) => {
    if (entry.request.mutationId !== mutationId) return entry

    return { ...entry, status: 'acknowledged' as const }
  })
}

function activeEntry(
  owner: QueryClient,
  request: SettingsMutationRequest,
  clientSequence: number,
  initiator?: string,
): MutableActiveSettingsIntent {
  let resolveSettlement: (settlement: SettingsIntentSettlement) => void = () => undefined
  const settled = new Promise<SettingsIntentSettlement>((resolve) => {
    resolveSettlement = resolve
  })

  return {
    owner,
    clientSequence,
    enqueuedAt: now(),
    initiator,
    request,
    resolveSettlement,
    resources: targetedResources(request.target, request.operations),
    settled,
    status: 'pending',
    transportSettled: false,
  }
}

function targetedResources(
  target: SettingsWriteTarget,
  operations: readonly SettingsOperation[],
): readonly TargetedResourceKey[] {
  return settingsMutationResourceKeys(operations).map(
    (resource): TargetedResourceKey => `${target}/${resource}`,
  )
}

function supersededFailures(
  owner: QueryClient,
  resources: readonly TargetedResourceKey[],
  failed: readonly FailedSettingsIntent[],
): string[] {
  const superseded: string[] = []
  for (const entry of failed) {
    if (entry.owner !== owner) continue
    if (entry.superseded) continue
    if (!targetedResourcesIntersect(resources, entry.resources)) continue
    superseded.push(entry.request.mutationId)
  }

  return superseded
}

function targetedResourcesIntersect(
  left: readonly TargetedResourceKey[],
  right: readonly TargetedResourceKey[],
): boolean {
  for (const leftResource of left) {
    if (right.some((rightResource) => targetedResourceIntersects(leftResource, rightResource))) {
      return true
    }
  }

  return false
}

function targetedResourceIntersects(left: TargetedResourceKey, right: TargetedResourceKey) {
  const leftTarget = left.slice(0, left.indexOf('/'))
  const rightTarget = right.slice(0, right.indexOf('/'))
  if (leftTarget !== rightTarget) return false

  return settingsMutationResourcesIntersect(resourcePart(left), resourcePart(right))
}

function resourcePart(resource: TargetedResourceKey): SettingsMutationResourceKey {
  return resource.slice(resource.indexOf('/') + 1) as SettingsMutationResourceKey
}

function activeIntent(
  mutationId: string,
  active: readonly MutableActiveSettingsIntent[],
): MutableActiveSettingsIntent | null {
  return active.find((entry) => entry.request.mutationId === mutationId) ?? null
}

function settingsMutationId(sequence: number) {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID()

  return `${clientInstanceId()}:settings:${sequence}`
}

function now() {
  return typeof performance === 'undefined' ? Date.now() : performance.now()
}
