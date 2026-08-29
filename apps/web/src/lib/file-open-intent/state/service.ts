import type { QueryClient } from '@tanstack/react-query'
import {
  createEditorTextBuffer,
  type EditorPreparedDocument,
  type EditorPreparedTagValue,
  type EditorTextBuffer,
} from '@singapor/core'

import type { FileResult } from '@/lib/file-system-types'
import {
  ensureFileSnapshotQuery,
  FILE_SNAPSHOT_STALE_MS,
  fileSnapshotQueryOptions,
} from '@/lib/file-snapshot-query-cache'
import type {
  PreparedCleanFileOpenClaim,
  PreparedFileOpenClaim,
  PreparedLiveFileOpenClaim,
} from '@/lib/file-open-intent/types'
import { createWideEventScope } from '@/lib/wide-event-scope'
import { createClientInvariantError } from '@/lib/structured-errors'

const MAX_PREPARED_OPENS = 8
const MAX_PREPARED_BYTES = 32 * 1024 * 1024
const PREPARED_OPEN_TTL_MS = 30_000
const MAX_PREPARED_FILE_BYTES = 1024 * 1024

export type FileOpenIntentLiveDocument = {
  readonly buffer: EditorTextBuffer
  readonly id: string
  readonly localRevision: number
  readonly path: string
}

export type FileOpenIntentPreparationFamily = 'highlighter' | 'structural'

export type FileOpenIntentPreparationStage = {
  readonly configurationTag: readonly EditorPreparedTagValue[]
  readonly family: FileOpenIntentPreparationFamily
  readonly provider: object
  start(): Promise<unknown> | null
}

export type FileOpenIntentPreparationConfiguration = {
  readonly documentConfigurationTag: readonly EditorPreparedTagValue[]
  readonly stages: readonly FileOpenIntentPreparationStage[]
}

export type FileOpenIntentPreparation = FileOpenIntentPreparationConfiguration & {
  readonly buffer: EditorTextBuffer
  readonly preparedDocument: EditorPreparedDocument
}

export type FileOpenIntentPreparer = {
  readonly environmentTag: string
  prepare(
    buffer: EditorTextBuffer,
    documentId: string,
    path: string,
    abortSignal: AbortSignal,
  ): FileOpenIntentPreparation
  reconfigure(
    preparedDocument: EditorPreparedDocument,
    buffer: EditorTextBuffer,
    documentId: string,
    path: string,
    abortSignal: AbortSignal,
  ): FileOpenIntentPreparationConfiguration
}

export type FileOpenIntentRuntime = {
  now(): number
  schedule<T>(task: () => T | Promise<T>): Promise<T>
  scheduleTimer(task: () => void, delayMs: number): () => void
}

export type FileOpenIntentBenchmarkResult = {
  readonly evictions: number
  readonly nonTargetIntents: number
  readonly preparedClaims: number
  readonly promotedBytes: number
  readonly highlighterRuntimeSessionIds: readonly string[]
  readonly structuralRuntimeSessionIds: readonly string[]
  readonly transferredHighlighterRuntimeSessionIds: readonly string[]
  readonly transferredStructuralRuntimeSessionIds: readonly string[]
  readonly targetIntents: number
  readonly wastedIntents: number
}

type FileOpenIntentBenchmarkScope = {
  evictions: number
  nonTargetIntents: number
  readonly path: string
  preparedClaims: number
  promotedBytes: number
  readonly highlighterRuntimeSessionIds: Set<string>
  readonly sampleId: string
  targetIntents: number
  readonly structuralRuntimeSessionIds: Set<string>
  readonly transferredHighlighterRuntimeSessionIds: Set<string>
  readonly transferredStructuralRuntimeSessionIds: Set<string>
  wastedIntents: number
  quarantined: boolean
}

type PreparedStageRecord = {
  readonly stage: FileOpenIntentPreparationStage
  progress: 'queued' | 'started' | 'settled'
}

type PreparedOpenRecord = {
  readonly abortController: AbortController
  readonly claim: PreparedFileOpenClaim
  readonly documentId: string
  documentConfigurationTag: readonly EditorPreparedTagValue[]
  readonly estimatedBytes: number
  lastActivityAt: number
  readonly preparedDocument: EditorPreparedDocument
  stages: Map<FileOpenIntentPreparationFamily, PreparedStageRecord>
}

export class FileOpenIntentService {
  private readonly records = new Map<string, PreparedOpenRecord>()
  private readonly queuedPaths: string[] = []
  private readonly queuedPathSet = new Set<string>()
  private activeAbortController: AbortController | null = null
  private activeOperation: Promise<void> | null = null
  private activePath: string | null = null
  private running = false
  private rootPath: string | null = null
  private environmentTag: string
  private lifecycleGeneration = 0
  private connectionGeneration = 0
  private connected = false
  private cancelExpiryTimer: (() => void) | null = null
  private benchmarkScope: FileOpenIntentBenchmarkScope | null = null
  private readonly relatedOperations = new Set<Promise<void>>()

  constructor(
    private readonly queryClient: QueryClient,
    private preparer: FileOpenIntentPreparer,
    private readonly getLiveDocument: (path: string) => FileOpenIntentLiveDocument | null,
    private readonly isActive: (path: string) => boolean,
    private readonly isMounted: (path: string) => boolean,
    private prefetchRelated: (rootPath: string, path: string) => Promise<unknown> | void,
    private readonly runtime: FileOpenIntentRuntime = defaultFileOpenIntentRuntime,
  ) {
    this.environmentTag = preparer.environmentTag
  }

  setRoot(rootPath: string | null): void {
    const canonicalRoot = rootPath ? canonicalPath(rootPath) : null
    if (canonicalRoot === this.rootPath) return

    this.rootPath = canonicalRoot
    this.clear()
  }

  connect(): void {
    this.connected = true
    this.connectionGeneration += 1
  }

  scheduleDisconnect(): void {
    if (!this.connected) return

    this.connected = false
    const generation = ++this.connectionGeneration
    queueMicrotask(() => {
      if (this.connected || generation !== this.connectionGeneration) return
      this.clear()
    })
  }

  disposeNow(): void {
    this.connected = false
    this.connectionGeneration += 1
    this.clear()
  }

  setPreparationEnvironment(preparer: FileOpenIntentPreparer): void {
    if (preparer.environmentTag === this.environmentTag) return

    this.preparer = preparer
    this.environmentTag = preparer.environmentTag
    for (const [path, record] of this.records) {
      if (this.records.get(path) !== record) continue
      this.reconcileRecord(path, record, preparer)
    }
    this.runNext()
  }

  setRelatedPrefetch(
    prefetchRelated: (rootPath: string, path: string) => Promise<unknown> | void,
  ): void {
    this.prefetchRelated = prefetchRelated
  }

  beginBenchmarkSample(sampleId: string, path: string): void {
    if (!this.connected) {
      throw createClientInvariantError('Editor-open benchmark sample requires a connected owner')
    }
    if (this.benchmarkScope) {
      throw createClientInvariantError('An editor-open benchmark sample is already active')
    }
    if (
      this.running ||
      this.activeOperation ||
      this.queuedPaths.length > 0 ||
      this.records.size > 0 ||
      this.relatedOperations.size > 0
    ) {
      throw createClientInvariantError(
        'Editor-open benchmark sample started before intent work settled',
      )
    }

    this.benchmarkScope = {
      evictions: 0,
      nonTargetIntents: 0,
      path: canonicalPath(path),
      preparedClaims: 0,
      promotedBytes: 0,
      highlighterRuntimeSessionIds: new Set(),
      quarantined: false,
      sampleId,
      targetIntents: 0,
      structuralRuntimeSessionIds: new Set(),
      transferredHighlighterRuntimeSessionIds: new Set(),
      transferredStructuralRuntimeSessionIds: new Set(),
      wastedIntents: 0,
    }
  }

  quarantineBenchmarkSample(sampleId: string): void {
    const scope = this.requireBenchmarkScope(sampleId)
    if (scope.quarantined) return

    scope.quarantined = true
    scope.wastedIntents = this.records.size + this.queuedPaths.length + (this.running ? 1 : 0)
    this.clear()
  }

  async finishBenchmarkSample(sampleId: string): Promise<FileOpenIntentBenchmarkResult> {
    const scope = this.requireBenchmarkScope(sampleId)
    if (!scope.quarantined) {
      throw createClientInvariantError('Editor-open benchmark sample must quarantine before finish')
    }

    await this.awaitIdle()
    if (
      this.queuedPaths.length > 0 ||
      this.running ||
      this.activeOperation ||
      this.records.size > 0 ||
      this.relatedOperations.size > 0
    ) {
      throw createClientInvariantError('Editor-open benchmark intent work did not quiesce')
    }

    return {
      evictions: scope.evictions,
      nonTargetIntents: scope.nonTargetIntents,
      preparedClaims: scope.preparedClaims,
      promotedBytes: scope.promotedBytes,
      highlighterRuntimeSessionIds: [...scope.highlighterRuntimeSessionIds],
      structuralRuntimeSessionIds: [...scope.structuralRuntimeSessionIds],
      transferredHighlighterRuntimeSessionIds: [...scope.transferredHighlighterRuntimeSessionIds],
      transferredStructuralRuntimeSessionIds: [...scope.transferredStructuralRuntimeSessionIds],
      targetIntents: scope.targetIntents,
      wastedIntents: scope.wastedIntents,
    }
  }

  releaseBenchmarkSample(sampleId: string): void {
    const scope = this.requireBenchmarkScope(sampleId)
    if (
      !scope.quarantined ||
      this.running ||
      this.activeOperation ||
      this.queuedPaths.length > 0 ||
      this.records.size > 0 ||
      this.relatedOperations.size > 0
    ) {
      throw createClientInvariantError('Editor-open benchmark sample released before quiescence')
    }

    this.benchmarkScope = null
  }

  prepare(path: string): void {
    const canonical = canonicalPath(path)
    if (this.benchmarkScope?.quarantined) return
    if (!this.pathBelongsToRoot(canonical)) return
    if (this.isActive(canonical)) return
    if (this.isMounted(canonical)) return

    this.pruneExpired()
    if (this.recordIsCurrent(canonical)) return
    if (this.activePath === canonical) return
    if (this.queuedPathSet.has(canonical)) {
      this.raiseQueuedPriority(canonical)
      return
    }

    this.queuedPathSet.add(canonical)
    this.queuedPaths.push(canonical)
    this.noteBenchmarkIntent(canonical)
    this.runNext()
  }

  claimLive(path: string): PreparedLiveFileOpenClaim | null {
    if (this.benchmarkScope?.quarantined) return null

    const canonical = canonicalPath(path)
    if (!this.pathBelongsToRoot(canonical)) return null

    const liveDocument = this.getLiveDocument(canonical)
    if (!liveDocument) return null

    const prepared = this.claimKind(canonical, 'live')
    if (prepared?.kind === 'live') return prepared

    this.removeStaleRecord(canonical)
    const snapshot = liveDocument.buffer.getSnapshot()
    return {
      buffer: liveDocument.buffer,
      documentId: liveDocument.id,
      kind: 'live',
      localRevision: liveDocument.localRevision,
      path: liveDocument.path,
      preparedDocument: null,
      snapshot,
    }
  }

  claimReadyClean(path: string): PreparedCleanFileOpenClaim | null {
    if (this.benchmarkScope?.quarantined) return null

    const claim = this.claimKind(path, 'clean')
    return claim?.kind === 'clean' ? claim : null
  }

  private claimKind(
    path: string,
    kind: PreparedFileOpenClaim['kind'],
  ): PreparedFileOpenClaim | null {
    const canonical = canonicalPath(path)
    this.pruneExpired()
    const record = this.records.get(canonical)
    if (!record) return null
    if (record.claim.kind !== kind) return null

    this.records.delete(canonical)
    this.scheduleExpiry()
    if (this.claimIsCurrent(record.claim)) {
      if (this.activePath === canonical) this.activeAbortController = null
      this.noteBenchmarkClaim(canonical, record.estimatedBytes, record.preparedDocument)
      return record.claim
    }

    this.disposeRecord(canonical, record)
    this.scheduleExpiry()
    return null
  }

  invalidatePath(path: string): void {
    const canonical = canonicalPath(path)
    this.removeQueuedPath(canonical)
    if (this.activePath === canonical) this.activeAbortController?.abort()
    const record = this.records.get(canonical)
    if (!record) return

    this.disposeRecord(canonical, record)
    this.scheduleExpiry()
  }

  invalidatePreparedPath(path: string): void {
    this.removeStaleRecord(canonicalPath(path))
  }

  clear(): void {
    this.lifecycleGeneration += 1
    this.activeAbortController?.abort()
    this.activeAbortController = null
    this.queuedPaths.length = 0
    this.queuedPathSet.clear()
    this.cancelExpiryTimer?.()
    this.cancelExpiryTimer = null
    for (const [path, record] of this.records) this.disposeRecord(path, record)
  }

  private runNext(): void {
    if (this.running) return

    const path = this.queuedPaths.pop()
    if (!path) return

    this.queuedPathSet.delete(path)
    this.running = true
    this.activePath = path
    const lifecycleGeneration = this.lifecycleGeneration
    const existingRecord = this.records.get(path)
    const abortController = existingRecord?.abortController ?? new AbortController()
    this.activeAbortController = abortController
    const operation = this.runtime
      .schedule(() =>
        existingRecord
          ? this.runPreparationStages(path, existingRecord, lifecycleGeneration)
          : this.preparePath(path, lifecycleGeneration, abortController),
      )
      .finally(() => {
        if (this.activeAbortController === abortController) this.activeAbortController = null
        if (this.activePath === path) this.activePath = null
        this.running = false
        if (this.activeOperation === operation) this.activeOperation = null
        this.runNext()
      })
    this.activeOperation = operation
  }

  private async preparePath(
    path: string,
    lifecycleGeneration: number,
    abortController: AbortController,
  ): Promise<void> {
    const abortSignal = abortController.signal
    const event = createWideEventScope({ action: 'editor.file_open_intent', area: 'editor' })
    try {
      if (abortSignal.aborted || !this.generationIsCurrent(lifecycleGeneration)) {
        event.end({ outcome: 'aborted' })
        return
      }
      if (this.isActive(path) || this.isMounted(path)) {
        event.end({ outcome: 'already-active' })
        return
      }

      this.startRelatedPrefetch(path)
      const liveDocument = this.getLiveDocument(path)
      if (liveDocument) {
        const record = this.storeLivePreparation(liveDocument, lifecycleGeneration, abortController)
        if (record) await this.runPreparationStages(liveDocument.path, record, lifecycleGeneration)
        event.end({ outcome: abortSignal.aborted ? 'aborted' : 'ready-live' })
        return
      }

      const file = await ensureFileSnapshotQuery(this.queryClient, path)
      const rejection = this.cleanPreparationRejection(path, file, lifecycleGeneration, abortSignal)
      if (rejection) {
        event.end({ outcome: rejection })
        return
      }
      const supersedingLiveDocument = this.getLiveDocument(path)
      if (supersedingLiveDocument) {
        const record = this.storeLivePreparation(
          supersedingLiveDocument,
          lifecycleGeneration,
          abortController,
        )
        if (record) {
          await this.runPreparationStages(supersedingLiveDocument.path, record, lifecycleGeneration)
        }
        event.end({ outcome: record ? 'ready-live' : 'superseded-by-live' })
        return
      }

      const preparation = this.preparer.prepare(
        createCleanBuffer(file),
        file.path,
        file.path,
        abortSignal,
      )
      this.noteBenchmarkRuntimeSessionIds(preparation.preparedDocument)
      if (!this.generationIsCurrent(lifecycleGeneration) || abortSignal.aborted) {
        preparation.preparedDocument.dispose()
        event.end({ outcome: 'aborted' })
        return
      }
      const claim: PreparedCleanFileOpenClaim = {
        buffer: preparation.buffer,
        file,
        fileVersion: file.version,
        kind: 'clean',
        path: file.path,
        preparedDocument: preparation.preparedDocument,
        snapshot: preparation.buffer.getSnapshot(),
      }
      const record = this.store(path, file.path, claim, preparation, abortController)
      await this.runPreparationStages(path, record, lifecycleGeneration)
      event.end({ outcome: 'ready-clean' })
    } catch (error) {
      event.error(error)
      event.end({ outcome: abortSignal.aborted ? 'aborted' : 'failed' })
    }
  }

  private storeLivePreparation(
    document: FileOpenIntentLiveDocument,
    lifecycleGeneration: number,
    abortController: AbortController,
  ): PreparedOpenRecord | null {
    const abortSignal = abortController.signal
    if (abortSignal.aborted || !this.generationIsCurrent(lifecycleGeneration)) return null
    if (this.isActive(document.path) || this.isMounted(document.path)) return null
    if (document.buffer.getSnapshot().length * 2 > MAX_PREPARED_FILE_BYTES) return null
    const snapshot = document.buffer.getSnapshot()
    const prepared = this.preparer.prepare(document.buffer, document.id, document.path, abortSignal)
    this.noteBenchmarkRuntimeSessionIds(prepared.preparedDocument)
    if (
      abortSignal.aborted ||
      !this.generationIsCurrent(lifecycleGeneration) ||
      document.buffer.getSnapshot() !== snapshot
    ) {
      prepared.preparedDocument.dispose()
      return null
    }
    const claim: PreparedLiveFileOpenClaim = {
      buffer: document.buffer,
      documentId: document.id,
      kind: 'live',
      localRevision: document.localRevision,
      path: document.path,
      preparedDocument: prepared.preparedDocument,
      snapshot,
    }
    return this.store(document.path, document.id, claim, prepared, abortController)
  }

  private async runPreparationStages(
    path: string,
    record: PreparedOpenRecord,
    lifecycleGeneration: number,
  ): Promise<void> {
    while (this.recordCanRun(path, record, lifecycleGeneration)) {
      const stageRecord = nextQueuedStage(record)
      if (!stageRecord) return

      stageRecord.progress = 'started'
      this.touchRecord(path, record)
      await this.runtime.schedule(async () => {
        if (!this.recordCanRun(path, record, lifecycleGeneration)) return

        const outcome = stageRecord.stage.start()
        this.noteBenchmarkRuntimeSessionIds(record.preparedDocument)
        await outcome
      })
      if (!this.recordCanRun(path, record, lifecycleGeneration)) return
      if (record.stages.get(stageRecord.stage.family) !== stageRecord) continue

      stageRecord.progress = 'settled'
      this.touchRecord(path, record)
    }
  }

  private recordCanRun(
    path: string,
    record: PreparedOpenRecord,
    lifecycleGeneration: number,
  ): boolean {
    if (record.abortController.signal.aborted) return false
    if (!this.generationIsCurrent(lifecycleGeneration)) return false
    return this.records.get(path) === record
  }

  private store(
    path: string,
    documentId: string,
    claim: PreparedFileOpenClaim,
    preparation: FileOpenIntentPreparation,
    abortController: AbortController,
  ): PreparedOpenRecord {
    const previous = this.records.get(path)
    if (previous) this.disposeRecord(path, previous)
    const record: PreparedOpenRecord = {
      abortController,
      claim,
      documentConfigurationTag: preparation.documentConfigurationTag,
      documentId,
      estimatedBytes: preparation.preparedDocument.estimatedBytes,
      lastActivityAt: this.runtime.now(),
      preparedDocument: preparation.preparedDocument,
      stages: stageRecords(preparation.stages),
    }
    this.records.set(path, record)
    this.noteBenchmarkRuntimeSessionIds(record.preparedDocument)
    this.pruneBounds()
    this.scheduleExpiry()
    return record
  }

  private recordIsCurrent(path: string): boolean {
    const record = this.records.get(path)
    if (!record) return false
    if (this.claimIsCurrent(record.claim)) {
      this.touchRecord(path, record)
      return true
    }

    this.disposeRecord(path, record)
    this.scheduleExpiry()
    return false
  }

  private reconcileRecord(
    path: string,
    record: PreparedOpenRecord,
    preparer: FileOpenIntentPreparer,
  ): void {
    const configuration = preparer.reconfigure(
      record.preparedDocument,
      record.claim.buffer,
      record.documentId,
      path,
      record.abortController.signal,
    )
    if (!sameTag(record.documentConfigurationTag, configuration.documentConfigurationTag)) {
      this.rebuildRecord(path, record)
      return
    }

    const nextStages = stageRecords(configuration.stages)
    for (const family of preparationFamilies) {
      const current = record.stages.get(family)
      const next = nextStages.get(family)
      if (sameStage(current?.stage, next?.stage)) continue
      if (!current || current.progress === 'queued') continue

      this.rebuildRecord(path, record)
      return
    }

    for (const family of preparationFamilies) {
      const current = record.stages.get(family)
      const next = nextStages.get(family)
      if (sameStage(current?.stage, next?.stage) && current) {
        nextStages.set(family, current)
      }
    }
    record.documentConfigurationTag = configuration.documentConfigurationTag
    record.stages = nextStages
    if (!nextQueuedStage(record)) return
    if (this.activePath === path) return

    this.enqueuePath(path)
  }

  private rebuildRecord(path: string, record: PreparedOpenRecord): void {
    this.disposeRecord(path, record)
    if (!this.pathBelongsToRoot(path)) return
    if (this.isActive(path) || this.isMounted(path)) return

    this.enqueuePath(path)
  }

  private enqueuePath(path: string): void {
    if (this.queuedPathSet.has(path)) {
      this.raiseQueuedPriority(path)
      return
    }

    this.queuedPathSet.add(path)
    this.queuedPaths.push(path)
  }

  private touchRecord(path: string, record: PreparedOpenRecord): void {
    if (this.records.get(path) !== record) return

    record.lastActivityAt = this.runtime.now()
    this.records.delete(path)
    this.records.set(path, record)
    this.scheduleExpiry()
  }

  private disposeRecord(path: string, record: PreparedOpenRecord): void {
    this.noteBenchmarkRuntimeSessionIds(record.preparedDocument)
    record.abortController.abort()
    record.preparedDocument.dispose()
    if (this.records.get(path) === record) this.records.delete(path)
  }

  private claimIsCurrent(claim: PreparedFileOpenClaim): boolean {
    if (!this.pathBelongsToRoot(claim.path)) return false
    if (claim.buffer.getSnapshot() !== claim.snapshot) return false
    const liveDocument = this.getLiveDocument(claim.path)
    if (claim.kind === 'clean') {
      if (liveDocument !== null || claim.buffer.isDirty()) return false
      return this.cleanClaimMatchesFreshQuery(claim)
    }
    if (!liveDocument) return false
    if (liveDocument.buffer !== claim.buffer) return false
    if (liveDocument.id !== claim.documentId) return false
    return liveDocument.localRevision === claim.localRevision
  }

  private pathBelongsToRoot(path: string): boolean {
    const rootPath = this.rootPath
    if (!rootPath) return false
    if (path === rootPath) return true

    return path.startsWith(`${rootPath}/`)
  }

  private pruneExpired(): void {
    const oldestAllowed = this.runtime.now() - PREPARED_OPEN_TTL_MS
    for (const [path, record] of this.records) {
      if (record.lastActivityAt > oldestAllowed) continue

      this.disposeRecord(path, record)
      this.noteBenchmarkEviction()
    }
    this.scheduleExpiry()
  }

  private scheduleExpiry(): void {
    this.cancelExpiryTimer?.()
    this.cancelExpiryTimer = null
    let expiresAt: number | null = null
    for (const record of this.records.values()) {
      const candidate = record.lastActivityAt + PREPARED_OPEN_TTL_MS
      if (expiresAt === null || candidate < expiresAt) expiresAt = candidate
    }
    if (expiresAt === null) return

    const delayMs = Math.max(0, expiresAt - this.runtime.now())
    this.cancelExpiryTimer = this.runtime.scheduleTimer(() => {
      this.cancelExpiryTimer = null
      this.pruneExpired()
    }, delayMs)
  }

  private pruneBounds(): void {
    let totalBytes = 0
    for (const record of this.records.values()) totalBytes += record.estimatedBytes
    while (this.records.size > MAX_PREPARED_OPENS || totalBytes > MAX_PREPARED_BYTES) {
      const oldest = this.records.entries().next().value as [string, PreparedOpenRecord] | undefined
      if (!oldest) return

      this.disposeRecord(oldest[0], oldest[1])
      this.noteBenchmarkEviction()
      totalBytes -= oldest[1].estimatedBytes
    }
  }

  private cleanPreparationRejection(
    path: string,
    file: FileResult,
    lifecycleGeneration: number,
    abortSignal: AbortSignal,
  ): string | null {
    if (abortSignal.aborted || !this.generationIsCurrent(lifecycleGeneration)) return 'aborted'
    if (file.path !== path) return 'path-mismatch'
    if (file.size > MAX_PREPARED_FILE_BYTES) return 'size-gated'
    if (!this.pathBelongsToRoot(path)) return 'root-mismatch'
    if (this.isActive(path) || this.isMounted(path)) return 'already-active'
    return null
  }

  private cleanClaimMatchesFreshQuery(claim: PreparedCleanFileOpenClaim): boolean {
    const queryKey = fileSnapshotQueryOptions(claim.path).queryKey
    const state = this.queryClient.getQueryState<FileResult>(queryKey)
    if (state?.status !== 'success' || !state.data) return false
    if (this.runtime.now() - state.dataUpdatedAt > FILE_SNAPSHOT_STALE_MS) return false

    return state.data.path === claim.path && state.data.version === claim.fileVersion
  }

  private generationIsCurrent(generation: number): boolean {
    return generation === this.lifecycleGeneration
  }

  private raiseQueuedPriority(path: string): void {
    this.removeQueuedPath(path)
    this.queuedPathSet.add(path)
    this.queuedPaths.push(path)
  }

  private removeQueuedPath(path: string): void {
    if (!this.queuedPathSet.delete(path)) return

    const index = this.queuedPaths.indexOf(path)
    if (index >= 0) this.queuedPaths.splice(index, 1)
  }

  private removeStaleRecord(path: string): void {
    const record = this.records.get(path)
    if (!record) return

    this.disposeRecord(path, record)
    this.scheduleExpiry()
  }

  private async awaitIdle(): Promise<void> {
    while (
      this.running ||
      this.activeOperation ||
      this.queuedPaths.length > 0 ||
      this.relatedOperations.size > 0
    ) {
      const operation = this.activeOperation
      if (operation) {
        await operation
        continue
      }
      const related = [...this.relatedOperations]
      if (related.length > 0) {
        await Promise.allSettled(related)
        continue
      }
      await Promise.resolve()
    }
  }

  private startRelatedPrefetch(path: string): void {
    const rootPath = this.rootPath
    if (!rootPath) return

    let result: Promise<unknown> | void
    try {
      result = this.prefetchRelated(rootPath, path)
    } catch {
      return
    }
    if (!result) return

    const operation = result.then(
      () => undefined,
      () => undefined,
    )
    this.relatedOperations.add(operation)
    void operation.finally(() => this.relatedOperations.delete(operation))
  }

  private noteBenchmarkIntent(path: string): void {
    const scope = this.benchmarkScope
    if (!scope) return
    if (path === scope.path) {
      scope.targetIntents += 1
      globalThis.performance?.mark('editor.file_open_intent.detected', {
        detail: { path },
      })
      return
    }
    scope.nonTargetIntents += 1
  }

  private noteBenchmarkClaim(
    path: string,
    estimatedBytes: number,
    preparedDocument: EditorPreparedDocument | null,
  ): void {
    const scope = this.benchmarkScope
    if (!scope) return

    this.noteBenchmarkRuntimeSessionIds(preparedDocument)
    if (path !== scope.path) return

    scope.preparedClaims += 1
    scope.promotedBytes += estimatedBytes
    const runtimeSessionIds = preparedDocument?.runtimeSessionIds()
    for (const id of runtimeSessionIds?.highlighter ?? []) {
      scope.transferredHighlighterRuntimeSessionIds.add(id)
    }
    for (const id of runtimeSessionIds?.structural ?? []) {
      scope.transferredStructuralRuntimeSessionIds.add(id)
    }
  }

  private noteBenchmarkRuntimeSessionIds(preparedDocument: EditorPreparedDocument | null): void {
    const scope = this.benchmarkScope
    if (!scope || !preparedDocument) return

    const runtimeSessionIds = preparedDocument.runtimeSessionIds()
    for (const id of runtimeSessionIds.highlighter) scope.highlighterRuntimeSessionIds.add(id)
    for (const id of runtimeSessionIds.structural) scope.structuralRuntimeSessionIds.add(id)
  }

  private noteBenchmarkEviction(): void {
    if (this.benchmarkScope) this.benchmarkScope.evictions += 1
  }

  private requireBenchmarkScope(sampleId: string): FileOpenIntentBenchmarkScope {
    const scope = this.benchmarkScope
    if (!scope || scope.sampleId !== sampleId) {
      throw createClientInvariantError('Unknown editor-open benchmark sample')
    }
    return scope
  }
}

const preparationFamilies: readonly FileOpenIntentPreparationFamily[] = [
  'highlighter',
  'structural',
]

function stageRecords(
  stages: readonly FileOpenIntentPreparationStage[],
): Map<FileOpenIntentPreparationFamily, PreparedStageRecord> {
  const records = new Map<FileOpenIntentPreparationFamily, PreparedStageRecord>()
  for (const stage of stages) {
    if (records.has(stage.family)) {
      throw createClientInvariantError(`Duplicate prepared ${stage.family} stage`)
    }
    records.set(stage.family, { progress: 'queued', stage })
  }
  return records
}

function nextQueuedStage(record: PreparedOpenRecord): PreparedStageRecord | null {
  for (const family of preparationFamilies) {
    const stage = record.stages.get(family)
    if (stage?.progress === 'queued') return stage
  }
  return null
}

function sameStage(
  left: FileOpenIntentPreparationStage | undefined,
  right: FileOpenIntentPreparationStage | undefined,
): boolean {
  if (!left || !right) return left === right
  if (left.family !== right.family) return false
  if (left.provider !== right.provider) return false
  return sameTag(left.configurationTag, right.configurationTag)
}

function sameTag(
  left: readonly EditorPreparedTagValue[],
  right: readonly EditorPreparedTagValue[],
): boolean {
  if (left.length !== right.length) return false
  return left.every((value, index) => Object.is(value, right[index]))
}

function createCleanBuffer(file: FileResult): EditorTextBuffer {
  markEditorOpenBenchmark('editor.file_open.buffer_built', file.path)
  const buffer = createEditorTextBuffer(file.content)
  buffer.markClean()
  return buffer
}

function markEditorOpenBenchmark(name: string, path: string): void {
  const traceGlobal = globalThis as typeof globalThis & { readonly __editorPerfTrace?: unknown }
  if (!traceGlobal.__editorPerfTrace) return

  globalThis.performance?.mark(name, { detail: { path } })
}

function canonicalPath(path: string): string {
  const absolute = path.startsWith('/')
  const segments: string[] = []
  for (const segment of path.replaceAll('\\', '/').split('/')) {
    if (!segment || segment === '.') continue
    if (segment === '..') {
      segments.pop()
      continue
    }
    segments.push(segment)
  }
  return `${absolute ? '/' : ''}${segments.join('/')}` || (absolute ? '/' : '.')
}

const defaultFileOpenIntentRuntime: FileOpenIntentRuntime = {
  now: () => Date.now(),
  schedule: <T>(task: () => T | Promise<T>): Promise<T> => {
    const taskScheduler = (
      globalThis as typeof globalThis & {
        readonly scheduler?: {
          postTask<TValue>(
            callback: () => TValue | Promise<TValue>,
            options: { readonly priority: 'background' },
          ): Promise<TValue>
        }
      }
    ).scheduler
    if (taskScheduler) return taskScheduler.postTask(task, { priority: 'background' })

    return new Promise<T>((resolve, reject) => {
      setTimeout(() => {
        Promise.resolve().then(task).then(resolve, reject)
      }, 0)
    })
  },
  scheduleTimer: (task, delayMs) => {
    const timer = setTimeout(task, delayMs)
    return () => clearTimeout(timer)
  },
}
