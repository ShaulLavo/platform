import { messageIdSchema, type MessageId, type ThreadId, type TurnId } from '@workspace/contracts'
import * as v from 'valibot'

const ASSISTANT_MESSAGE_IDS_BY_TURN_CAPACITY = 10_000
const BUFFERED_ASSISTANT_TEXT_BY_MESSAGE_ID_CAPACITY = 20_000
const BUFFERED_PROPOSED_PLAN_BY_ID_CAPACITY = 10_000
export const PROVIDER_RUNTIME_BUFFER_TTL_MS = 120 * 60 * 1000
export const MAX_BUFFERED_ASSISTANT_CHARS = 24_000

type CacheEntry<Value> = {
  expiresAt: number
  value: Value
}

type AssistantSegmentState = {
  activeMessageId: MessageId | null
  baseKey: string
  nextSegmentIndex: number
}

type ProposedPlanBuffer = {
  createdAt: string
  text: string
}

export class BoundedTtlCache<Key, Value> {
  private readonly capacity: number
  private readonly entries = new Map<Key, CacheEntry<Value>>()
  private readonly now: () => number
  private readonly ttlMs: number

  constructor(options: { capacity: number; now?: () => number; ttlMs: number }) {
    this.capacity = options.capacity
    this.now = options.now ?? Date.now
    this.ttlMs = options.ttlMs
  }

  get(key: Key) {
    // Expiry is lazy per key; sweeping the whole cache made every streaming read O(n).
    const entry = this.entries.get(key)
    if (!entry) return undefined
    if (!this.isExpired(entry)) return entry.value

    this.entries.delete(key)
    return undefined
  }

  set(key: Key, value: Value) {
    this.entries.delete(key)
    this.entries.set(key, { expiresAt: this.now() + this.ttlMs, value })
    this.trimToCapacity()
  }

  delete(key: Key) {
    this.entries.delete(key)
  }

  has(key: Key) {
    return this.get(key) !== undefined
  }

  keys() {
    this.purgeExpired()
    return Array.from(this.entries.keys())
  }

  private purgeExpired() {
    for (const [key, entry] of this.entries) {
      if (!this.isExpired(entry)) continue
      this.entries.delete(key)
    }
  }

  private trimToCapacity() {
    while (this.entries.size > this.capacity) {
      const key = this.entries.keys().next().value
      if (key === undefined) return
      this.entries.delete(key)
    }
  }

  private isExpired(entry: CacheEntry<Value>) {
    return entry.expiresAt <= this.now()
  }
}

export class ProviderRuntimeBuffers {
  private readonly assistantMessageIdsByTurn: BoundedTtlCache<string, Set<MessageId>>
  private readonly assistantSegmentStateByTurn: BoundedTtlCache<string, AssistantSegmentState>
  private readonly bufferedAssistantTextByMessageId: BoundedTtlCache<MessageId, string>
  private readonly bufferedProposedPlanById: BoundedTtlCache<string, ProposedPlanBuffer>

  constructor(options: { now?: () => number } = {}) {
    const cacheOptions = { now: options.now, ttlMs: PROVIDER_RUNTIME_BUFFER_TTL_MS }
    this.assistantMessageIdsByTurn = new BoundedTtlCache({
      ...cacheOptions,
      capacity: ASSISTANT_MESSAGE_IDS_BY_TURN_CAPACITY,
    })
    this.assistantSegmentStateByTurn = new BoundedTtlCache({
      ...cacheOptions,
      capacity: ASSISTANT_MESSAGE_IDS_BY_TURN_CAPACITY,
    })
    this.bufferedAssistantTextByMessageId = new BoundedTtlCache({
      ...cacheOptions,
      capacity: BUFFERED_ASSISTANT_TEXT_BY_MESSAGE_ID_CAPACITY,
    })
    this.bufferedProposedPlanById = new BoundedTtlCache({
      ...cacheOptions,
      capacity: BUFFERED_PROPOSED_PLAN_BY_ID_CAPACITY,
    })
  }

  rememberAssistantMessageId(threadId: ThreadId, turnId: TurnId, messageId: MessageId) {
    const key = turnCacheKey(threadId, turnId)
    const messageIds = this.assistantMessageIdsByTurn.get(key) ?? new Set<MessageId>()
    messageIds.add(messageId)
    this.assistantMessageIdsByTurn.set(key, messageIds)
  }

  forgetAssistantMessageId(threadId: ThreadId, turnId: TurnId, messageId: MessageId) {
    const key = turnCacheKey(threadId, turnId)
    const messageIds = this.assistantMessageIdsByTurn.get(key)
    if (!messageIds) return

    messageIds.delete(messageId)
    if (messageIds.size === 0) {
      this.assistantMessageIdsByTurn.delete(key)
      return
    }

    this.assistantMessageIdsByTurn.set(key, messageIds)
  }

  assistantMessageIdsForTurn(threadId: ThreadId, turnId: TurnId) {
    return new Set(this.assistantMessageIdsByTurn.get(turnCacheKey(threadId, turnId)) ?? [])
  }

  clearAssistantMessageIdsForTurn(threadId: ThreadId, turnId: TurnId) {
    this.assistantMessageIdsByTurn.delete(turnCacheKey(threadId, turnId))
  }

  activeAssistantMessageIdForTurn(threadId: ThreadId, turnId: TurnId) {
    return this.assistantSegmentStateByTurn.get(turnCacheKey(threadId, turnId))?.activeMessageId
  }

  getOrCreateAssistantMessageId(input: {
    baseKey: string
    threadId: ThreadId
    turnId: TurnId | undefined
  }) {
    if (!input.turnId) return assistantSegmentMessageId(input.baseKey, 0)

    const activeMessageId = this.activeAssistantMessageIdForTurn(input.threadId, input.turnId)
    if (activeMessageId) return activeMessageId

    return this.startAssistantSegmentForTurn(input.threadId, input.turnId, input.baseKey)
  }

  markActiveAssistantSegmentComplete(threadId: ThreadId, turnId: TurnId) {
    const key = turnCacheKey(threadId, turnId)
    const state = this.assistantSegmentStateByTurn.get(key)
    if (!state) return

    this.assistantSegmentStateByTurn.set(key, { ...state, activeMessageId: null })
  }

  clearAssistantSegmentStateForTurn(threadId: ThreadId, turnId: TurnId) {
    this.assistantSegmentStateByTurn.delete(turnCacheKey(threadId, turnId))
  }

  appendBufferedAssistantText(messageId: MessageId, delta: string) {
    const nextText = `${this.bufferedAssistantTextByMessageId.get(messageId) ?? ''}${delta}`
    if (nextText.length <= MAX_BUFFERED_ASSISTANT_CHARS) {
      this.bufferedAssistantTextByMessageId.set(messageId, nextText)
      return ''
    }

    this.bufferedAssistantTextByMessageId.delete(messageId)
    return nextText
  }

  takeBufferedAssistantText(messageId: MessageId) {
    const text = this.bufferedAssistantTextByMessageId.get(messageId) ?? ''
    this.bufferedAssistantTextByMessageId.delete(messageId)
    return text
  }

  clearBufferedAssistantText(messageId: MessageId) {
    this.bufferedAssistantTextByMessageId.delete(messageId)
  }

  appendBufferedProposedPlan(planId: string, delta: string, createdAt: string) {
    const existing = this.bufferedProposedPlanById.get(planId)
    this.bufferedProposedPlanById.set(planId, {
      createdAt: existing?.createdAt || createdAt,
      text: `${existing?.text ?? ''}${delta}`,
    })
  }

  takeBufferedProposedPlan(planId: string) {
    const buffer = this.bufferedProposedPlanById.get(planId)
    this.bufferedProposedPlanById.delete(planId)
    return buffer
  }

  clearBufferedProposedPlan(planId: string) {
    this.bufferedProposedPlanById.delete(planId)
  }

  clearTurnStateForSession(threadId: ThreadId) {
    const turnPrefix = `${threadId}:`
    for (const key of this.assistantMessageIdsByTurn.keys()) {
      this.clearTurnMessageKey(key, turnPrefix)
    }
    for (const key of this.assistantSegmentStateByTurn.keys()) {
      if (key.startsWith(turnPrefix)) this.assistantSegmentStateByTurn.delete(key)
    }
    for (const key of this.bufferedProposedPlanById.keys()) {
      if (key.startsWith(proposedPlanPrefix(threadId))) this.bufferedProposedPlanById.delete(key)
    }
  }

  private startAssistantSegmentForTurn(threadId: ThreadId, turnId: TurnId, baseKey: string) {
    const key = turnCacheKey(threadId, turnId)
    const existing = this.assistantSegmentStateByTurn.get(key)
    const state = nextAssistantSegmentState(existing, baseKey)
    this.assistantSegmentStateByTurn.set(key, state)
    return state.activeMessageId as MessageId
  }

  private clearTurnMessageKey(key: string, prefix: string) {
    if (!key.startsWith(prefix)) return

    const messageIds = this.assistantMessageIdsByTurn.get(key) ?? new Set<MessageId>()
    for (const messageId of messageIds) {
      this.clearBufferedAssistantText(messageId)
    }
    this.assistantMessageIdsByTurn.delete(key)
  }
}

function nextAssistantSegmentState(
  existing: AssistantSegmentState | undefined,
  baseKey: string,
): AssistantSegmentState {
  if (!existing) return firstAssistantSegmentState(baseKey)

  const segmentIndex = existing.baseKey === baseKey ? existing.nextSegmentIndex : 0
  return {
    activeMessageId: assistantSegmentMessageId(baseKey, segmentIndex),
    baseKey,
    nextSegmentIndex: existing.baseKey === baseKey ? existing.nextSegmentIndex + 1 : 1,
  }
}

function firstAssistantSegmentState(baseKey: string): AssistantSegmentState {
  return {
    activeMessageId: assistantSegmentMessageId(baseKey, 0),
    baseKey,
    nextSegmentIndex: 1,
  }
}

function assistantSegmentMessageId(baseKey: string, segmentIndex: number) {
  const suffix = segmentIndex === 0 ? '' : `:segment:${segmentIndex}`
  return v.parse(messageIdSchema, `assistant:${baseKey}${suffix}`)
}

function turnCacheKey(threadId: ThreadId, turnId: TurnId) {
  return `${threadId}:${turnId}`
}

function proposedPlanPrefix(threadId: ThreadId) {
  return `plan:${threadId}:`
}
