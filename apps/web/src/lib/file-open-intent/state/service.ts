import type { QueryClient } from '@tanstack/react-query'
import {
  createEditorTextBuffer,
  type EditorInitialPaintEvent,
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
import type { WideEventScope } from '@workspace/observability/scope'
import { createClientInvariantError } from '@/lib/structured-errors'

const MAX_PREPARED_OPENS = 8
const MAX_PREPARED_BYTES = 32 * 1024 * 1024
const PREPARED_OPEN_TTL_MS = 30_000
const MAX_PREPARED_FILE_BYTES = 1024 * 1024
const PROMOTION_PAINT_TIMEOUT_MS = 10_000

export type FileOpenIntentLiveDocument = {
  readonly buffer: EditorTextBuffer
  readonly id: string
  readonly localRevision: number
  readonly path: string
}

export type FileOpenIntentPreparationFamily = 'highlighter' | 'structural'

export type FileOpenIntent = {
  readonly knownSize?: number
  readonly path: string
  readonly rootPath: string
  readonly source: 'file-tree' | 'tab'
  readonly tabId?: string
}

export type FileOpenIntentEnvironmentIdentity = {
  readonly configurationTag: readonly EditorPreparedTagValue[]
  readonly highlighterProvider: object | null
  readonly structuralProvider: object | null
}

export type FileOpenIntentPreparationStage = {
  readonly configurationTag: readonly EditorPreparedTagValue[]
  readonly family: FileOpenIntentPreparationFamily
  readonly provider: object
  readonly range?: 'full' | { readonly endIndex: number; readonly startIndex: number }
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
  readonly environment: FileOpenIntentEnvironmentIdentity
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

export type FileOpenIntentEventFactory = (base: {
  readonly action: string
  readonly area: string
  readonly [key: string]: unknown
}) => WideEventScope

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

type FileOpenIntentOperation = {
  readonly detectedAt: number
  readonly event: WideEventScope
  hasTab: boolean
  knownSize: number | null
  readonly path: string
  pendingEnd: Record<string, unknown> | null
  postActivationBaseline: PostActivationWorkSnapshot | null
  promotionAt: number | null
  promotionPaintTimeout: (() => void) | null
  relatedSettled: boolean
  readonly rootPath: string
}

type PostActivationWorkCounters = {
  readonly bufferBuilds: number
  readonly fileReads: number
  readonly highlighterSessionCreations: number
  readonly lineIndexScans: number
  readonly structuralSessionCreations: number
  readonly workerOpenRequests: number
  readonly workerParseRequests: number
  readonly workerQueryRequests: number
  readonly workerRefreshRequests: number
}

type PostActivationWorkSnapshot = PostActivationWorkCounters & {
  readonly diagnosticsObserved: boolean
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
  private environment: FileOpenIntentEnvironmentIdentity
  private environmentGeneration = 0
  private lifecycleGeneration = 0
  private connectionGeneration = 0
  private connected = false
  private cancelExpiryTimer: (() => void) | null = null
  private benchmarkScope: FileOpenIntentBenchmarkScope | null = null
  private readonly relatedOperations = new Set<Promise<void>>()
  private readonly intentOperations = new Map<string, FileOpenIntentOperation>()
  private readonly promotedIntentOperations = new Map<string, FileOpenIntentOperation>()

  constructor(
    private readonly queryClient: QueryClient,
    private preparer: FileOpenIntentPreparer,
    private readonly getLiveDocument: (path: string) => FileOpenIntentLiveDocument | null,
    private readonly isActive: (path: string) => boolean,
    private readonly isMounted: (path: string) => boolean,
    private prefetchRelated: (rootPath: string, path: string) => Promise<unknown> | void,
    private readonly runtime: FileOpenIntentRuntime = defaultFileOpenIntentRuntime,
    private readonly createEvent: FileOpenIntentEventFactory = createWideEventScope,
  ) {
    this.environment = preparer.environment
  }

  setRoot(rootPath: string | null): void {
    const canonicalRoot = rootPath ? canonicalPath(rootPath) : null
    if (canonicalRoot === this.rootPath) return

    this.rootPath = canonicalRoot
    this.clear('root-changed')
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
      this.clear('owner-disconnected')
    })
  }

  disposeNow(): void {
    this.connected = false
    this.connectionGeneration += 1
    this.clear('owner-disposed')
  }

  setPreparationEnvironment(preparer: FileOpenIntentPreparer): void {
    if (sameEnvironment(preparer.environment, this.environment)) return

    this.preparer = preparer
    this.environment = preparer.environment
    this.environmentGeneration += 1
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
      this.relatedOperations.size > 0 ||
      this.intentOperations.size > 0 ||
      this.promotedIntentOperations.size > 0
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
      this.relatedOperations.size > 0 ||
      this.intentOperations.size > 0 ||
      this.promotedIntentOperations.size > 0
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
      this.relatedOperations.size > 0 ||
      this.intentOperations.size > 0 ||
      this.promotedIntentOperations.size > 0
    ) {
      throw createClientInvariantError('Editor-open benchmark sample released before quiescence')
    }

    this.benchmarkScope = null
  }

  prepare(intent: FileOpenIntent): void {
    const canonicalRoot = canonicalPath(intent.rootPath)
    const canonical = canonicalPath(intent.path)
    if (this.benchmarkScope?.quarantined) return
    if (canonicalRoot !== this.rootPath) return
    if (!this.pathBelongsToRoot(canonical)) return
    if (intent.knownSize !== undefined && intent.knownSize > MAX_PREPARED_FILE_BYTES) {
      this.finishImmediateIntent(intent, canonicalRoot, canonical, 'rejected', {
        reason: 'size-gated',
      })
      return
    }

    const existingOperation = this.intentOperations.get(canonical)
    if (existingOperation) {
      this.noteDuplicateIntent(existingOperation, intent)
      this.noteBenchmarkIntent(canonical)
    }
    if (this.isActive(canonical)) {
      if (!existingOperation) {
        this.finishImmediateIntent(intent, canonicalRoot, canonical, 'already-active')
      }
      return
    }
    if (this.isMounted(canonical)) {
      if (!existingOperation) {
        this.finishImmediateIntent(intent, canonicalRoot, canonical, 'already-mounted')
      }
      return
    }

    this.pruneExpired()
    if (this.recordIsCurrent(canonical)) return
    if (this.activePath === canonical) return
    if (this.queuedPathSet.has(canonical)) {
      this.raiseQueuedPriority(canonical)
      return
    }

    this.queuedPathSet.add(canonical)
    this.queuedPaths.push(canonical)
    this.intentOperations.set(
      canonical,
      this.createIntentOperation(intent, canonicalRoot, canonical),
    )
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

  recordInitialPaint(path: string, paint: EditorInitialPaintEvent): void {
    const canonical = canonicalPath(path)
    const operation = this.promotedIntentOperations.get(canonical)
    if (!operation || operation.promotionAt === null) return

    const timingField = paint.phase === 'text' ? 'textPaintMs' : 'highlightPaintMs'
    operation.event.set({
      postActivation: {
        ...postActivationWorkSince(operation.postActivationBaseline, canonical),
        [timingField]: this.runtime.now() - operation.promotionAt,
      },
    })
    if (paint.phase === 'text') return

    this.finishPromotion(canonical, paint.status)
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
      this.promoteIntent(canonical, {
        promotion: {
          kind: record.claim.kind,
          stages: preparationStageProgress(record),
        },
      })
      return record.claim
    }

    this.disposeRecord(canonical, record)
    this.finishIntent(canonical, 'stale', { reason: 'claim-validation' })
    this.scheduleExpiry()
    return null
  }

  invalidatePath(path: string): void {
    const canonical = canonicalPath(path)
    const queued = this.removeQueuedPath(canonical)
    if (this.activePath === canonical) this.activeAbortController?.abort()
    const record = this.records.get(canonical)
    if (!record) {
      if (queued) this.finishIntent(canonical, 'invalidated', { reason: 'document-changed' })
      return
    }

    this.disposeRecord(canonical, record)
    this.finishIntent(canonical, 'invalidated', { reason: 'document-changed' })
    this.scheduleExpiry()
  }

  invalidatePreparedPath(path: string): void {
    this.removeStaleRecord(canonicalPath(path))
  }

  clear(reason = 'service-cleared'): void {
    this.lifecycleGeneration += 1
    this.activeAbortController?.abort()
    this.activeAbortController = null
    this.queuedPaths.length = 0
    this.queuedPathSet.clear()
    this.cancelExpiryTimer?.()
    this.cancelExpiryTimer = null
    for (const [path, record] of this.records) this.disposeRecord(path, record)
    for (const path of this.intentOperations.keys()) {
      this.finishIntent(path, 'aborted', { reason })
    }
    for (const path of this.promotedIntentOperations.keys()) {
      this.finishPromotion(path, 'abandoned', { reason })
    }
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
          ? this.runExistingPreparation(path, existingRecord, lifecycleGeneration)
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

  private async runExistingPreparation(
    path: string,
    record: PreparedOpenRecord,
    lifecycleGeneration: number,
  ): Promise<void> {
    try {
      await this.runPreparationStages(path, record, lifecycleGeneration)
      this.intentOperations.get(path)?.event.set({ preparation: { status: 'ready' } })
    } catch (error) {
      this.intentOperations.get(path)?.event.error(error)
      if (this.records.get(path) === record) this.disposeRecord(path, record)
      this.finishIntent(path, 'failed', { reason: 'preparation-error' })
    }
  }

  private async preparePath(
    path: string,
    lifecycleGeneration: number,
    abortController: AbortController,
  ): Promise<void> {
    const abortSignal = abortController.signal
    const operation = this.intentOperations.get(path)
    if (!operation) return

    const event = operation.event
    try {
      if (abortSignal.aborted || !this.generationIsCurrent(lifecycleGeneration)) {
        this.finishIntent(path, 'aborted', { reason: 'generation-changed' })
        return
      }
      if (this.isActive(path) || this.isMounted(path)) {
        this.finishIntent(path, 'already-active')
        return
      }

      this.startRelatedPrefetch(path, operation)
      const liveDocument = this.getLiveDocument(path)
      if (liveDocument) {
        event.set({ sourceState: 'live' })
        const record = this.storeLivePreparation(liveDocument, lifecycleGeneration, abortController)
        if (record) await this.runPreparationStages(liveDocument.path, record, lifecycleGeneration)
        if (record) {
          event.set({ preparation: { status: 'ready-live' } })
          return
        }

        this.finishIntent(path, abortSignal.aborted ? 'aborted' : 'superseded')
        return
      }

      const queryStartedAt = this.runtime.now()
      const queryState = this.queryClient.getQueryState<FileResult>(
        fileSnapshotQueryOptions(path).queryKey,
      )
      event.set({
        query: {
          cacheHit: freshFileQueryState(queryState, queryStartedAt),
          joined: queryState?.fetchStatus === 'fetching',
        },
      })
      const file = await ensureFileSnapshotQuery(this.queryClient, path)
      event.set({
        fileSize: file.size,
        query: {
          durationMs: this.runtime.now() - queryStartedAt,
          status: 'success',
        },
        sourceState: 'clean',
      })
      const rejection = this.cleanPreparationRejection(path, file, lifecycleGeneration, abortSignal)
      if (rejection) {
        this.finishIntent(path, 'rejected', { reason: rejection })
        return
      }
      const supersedingLiveDocument = this.getLiveDocument(path)
      if (supersedingLiveDocument) {
        event.set({ sourceState: 'live' })
        const record = this.storeLivePreparation(
          supersedingLiveDocument,
          lifecycleGeneration,
          abortController,
        )
        if (record) {
          await this.runPreparationStages(supersedingLiveDocument.path, record, lifecycleGeneration)
        }
        if (record) {
          event.set({ preparation: { status: 'ready-live' } })
          return
        }

        this.finishIntent(path, 'superseded', { reason: 'live-document-changed' })
        return
      }

      const bufferStartedAt = this.runtime.now()
      const buffer = createCleanBuffer(file)
      event.set({ stages: { buffer: { durationMs: this.runtime.now() - bufferStartedAt } } })
      const documentStartedAt = this.runtime.now()
      const preparation = this.preparer.prepare(buffer, file.path, file.path, abortSignal)
      event.set({
        stages: {
          line: {
            durationMs: this.runtime.now() - documentStartedAt,
            scope: 'document-data',
          },
        },
      })
      this.noteBenchmarkRuntimeSessionIds(preparation.preparedDocument)
      if (!this.generationIsCurrent(lifecycleGeneration) || abortSignal.aborted) {
        preparation.preparedDocument.dispose()
        this.finishIntent(path, 'aborted', { reason: 'generation-changed' })
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
      event.set({ preparation: { status: 'ready-clean' } })
    } catch (error) {
      event.error(error)
      const record = this.records.get(path)
      if (record) this.disposeRecord(path, record)
      this.finishIntent(path, abortSignal.aborted ? 'aborted' : 'failed', {
        reason: abortSignal.aborted ? 'aborted' : 'preparation-error',
      })
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
    const startedAt = this.runtime.now()
    const prepared = this.preparer.prepare(document.buffer, document.id, document.path, abortSignal)
    this.intentOperations.get(document.path)?.event.set({
      stages: {
        line: { durationMs: this.runtime.now() - startedAt, scope: 'document-data' },
      },
    })
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
      const startedAt = this.runtime.now()
      this.intentOperations.get(path)?.event.set({
        preparation: {
          providerConfiguration: {
            [stageRecord.stage.family]: {
              configurationTag: stageRecord.stage.configurationTag,
              generation: this.environmentGeneration,
            },
          },
          ranges: { [stageRecord.stage.family]: stageRecord.stage.range ?? null },
        },
      })
      await this.runtime.schedule(async () => {
        if (!this.recordCanRun(path, record, lifecycleGeneration)) return

        const outcome = stageRecord.stage.start()
        this.noteBenchmarkRuntimeSessionIds(record.preparedDocument)
        await outcome
      })
      if (!this.recordCanRun(path, record, lifecycleGeneration)) return
      if (record.stages.get(stageRecord.stage.family) !== stageRecord) continue

      stageRecord.progress = 'settled'
      this.intentOperations.get(path)?.event.set({
        stages: {
          [stageRecord.stage.family]: {
            durationMs: this.runtime.now() - startedAt,
            status: 'ready',
          },
        },
      })
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
    this.intentOperations.get(path)?.event.set({
      preparation: {
        documentConfigurationTag: preparation.documentConfigurationTag,
        estimatedBytes: record.estimatedBytes,
      },
    })
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
    this.finishIntent(path, 'stale', { reason: 'source-state-changed' })
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
    this.intentOperations.get(path)?.event.increment('preparation.rebuildCount')
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
      this.finishIntent(path, 'evicted', { reason: 'idle-ttl' })
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
      this.finishIntent(oldest[0], 'evicted', { reason: 'memory-budget' })
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

  private removeQueuedPath(path: string): boolean {
    if (!this.queuedPathSet.delete(path)) return false

    const index = this.queuedPaths.indexOf(path)
    if (index >= 0) this.queuedPaths.splice(index, 1)
    return true
  }

  private removeStaleRecord(path: string): void {
    const record = this.records.get(path)
    if (!record) return

    this.disposeRecord(path, record)
    this.finishIntent(path, 'invalidated', { reason: 'query-changed' })
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

  private createIntentOperation(
    intent: FileOpenIntent,
    rootPath: string,
    path: string,
  ): FileOpenIntentOperation {
    const detectedAt = this.runtime.now()
    const hasTab = intent.tabId !== undefined
    return {
      detectedAt,
      event: this.createEvent({
        action: 'editor.file_open_intent',
        area: 'editor',
        dedupeCount: 0,
        preparationEnvironment: {
          configurationTag: this.environment.configurationTag,
          generation: this.environmentGeneration,
          providers: {
            highlighter: this.environment.highlighterProvider !== null,
            structural: this.environment.structuralProvider !== null,
          },
        },
        hasTab,
        knownSize: intent.knownSize ?? null,
        path,
        pathClassification: path === rootPath ? 'root' : 'descendant',
        rootGeneration: this.lifecycleGeneration,
        rootPath,
        intentSource: intent.source,
        intentSources: [intent.source],
      }),
      hasTab,
      knownSize: intent.knownSize ?? null,
      path,
      pendingEnd: null,
      postActivationBaseline: null,
      promotionAt: null,
      promotionPaintTimeout: null,
      relatedSettled: true,
      rootPath,
    }
  }

  private noteDuplicateIntent(operation: FileOpenIntentOperation, intent: FileOpenIntent): void {
    operation.event.increment('dedupeCount')
    operation.event.set({ intentSources: [intent.source] })
    if (intent.tabId !== undefined && !operation.hasTab) {
      operation.hasTab = true
      operation.event.set({ hasTab: true })
    }
    if (intent.knownSize === undefined || operation.knownSize === intent.knownSize) return

    operation.knownSize = intent.knownSize
    operation.event.set({ knownSize: intent.knownSize })
  }

  private finishImmediateIntent(
    intent: FileOpenIntent,
    rootPath: string,
    path: string,
    outcome: string,
    context: Record<string, unknown> = {},
  ): void {
    const operation = this.createIntentOperation(intent, rootPath, path)
    this.finishOperation(operation, { ...context, leadMs: 0, outcome })
    this.noteBenchmarkIntent(path)
  }

  private promoteIntent(path: string, context: Record<string, unknown>): void {
    const operation = this.intentOperations.get(path)
    if (!operation) return

    this.intentOperations.delete(path)
    const previous = this.promotedIntentOperations.get(path)
    if (previous) this.finishPromotion(path, 'superseded')
    operation.postActivationBaseline = postActivationWorkSnapshot(path)
    operation.promotionAt = this.runtime.now()
    operation.event.set({
      ...context,
      leadMs: operation.promotionAt - operation.detectedAt,
      outcome: 'promoted',
    })
    operation.promotionPaintTimeout = this.runtime.scheduleTimer(
      () => this.finishPromotion(path, 'timeout', { reason: 'initial-paint-timeout' }),
      PROMOTION_PAINT_TIMEOUT_MS,
    )
    this.promotedIntentOperations.set(path, operation)
  }

  private finishPromotion(
    path: string,
    paintOutcome: string,
    context: Record<string, unknown> = {},
  ): void {
    const operation = this.promotedIntentOperations.get(path)
    if (!operation) return

    this.promotedIntentOperations.delete(path)
    operation.promotionPaintTimeout?.()
    operation.promotionPaintTimeout = null
    const counters = postActivationWorkSince(operation.postActivationBaseline, path)
    const outcome = paintOutcome === 'abandoned' ? 'aborted' : 'promoted'
    operation.event.set({
      postActivation: counters,
      promotion: { paintOutcome },
    })
    this.finishOperation(operation, { ...context, outcome })
  }

  private finishIntent(path: string, outcome: string, context: Record<string, unknown> = {}): void {
    const operation = this.intentOperations.get(path)
    if (!operation) return

    this.intentOperations.delete(path)
    this.finishOperation(operation, {
      ...context,
      leadMs: this.runtime.now() - operation.detectedAt,
      outcome,
    })
  }

  private finishOperation(
    operation: FileOpenIntentOperation,
    context: Record<string, unknown>,
  ): void {
    if (!operation.relatedSettled) {
      operation.pendingEnd = context
      return
    }

    operation.event.end(context)
  }

  private startRelatedPrefetch(path: string, intentOperation: FileOpenIntentOperation): void {
    const rootPath = this.rootPath
    if (!rootPath) return

    const startedAt = this.runtime.now()
    let result: Promise<unknown> | void
    try {
      result = this.prefetchRelated(rootPath, path)
    } catch {
      intentOperation.event.set({ stages: { lsp: { status: 'failed' } } })
      return
    }
    if (!result) {
      intentOperation.event.set({
        stages: { lsp: { durationMs: this.runtime.now() - startedAt, status: 'skipped' } },
      })
      return
    }

    intentOperation.relatedSettled = false
    const relatedOperation = result.then(
      () => {
        intentOperation.event.set({
          stages: { lsp: { durationMs: this.runtime.now() - startedAt, status: 'ready' } },
        })
      },
      () => {
        intentOperation.event.set({
          stages: { lsp: { durationMs: this.runtime.now() - startedAt, status: 'failed' } },
        })
      },
    )
    this.relatedOperations.add(relatedOperation)
    void relatedOperation.finally(() => {
      this.relatedOperations.delete(relatedOperation)
      this.settleRelatedIntent(intentOperation)
    })
  }

  private settleRelatedIntent(operation: FileOpenIntentOperation): void {
    operation.relatedSettled = true
    const context = operation.pendingEnd
    if (!context) return

    operation.pendingEnd = null
    operation.event.end(context)
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

function sameEnvironment(
  left: FileOpenIntentEnvironmentIdentity,
  right: FileOpenIntentEnvironmentIdentity,
): boolean {
  if (left.highlighterProvider !== right.highlighterProvider) return false
  if (left.structuralProvider !== right.structuralProvider) return false
  return sameTag(left.configurationTag, right.configurationTag)
}

function preparationStageProgress(record: PreparedOpenRecord) {
  return Object.fromEntries(
    preparationFamilies.map((family) => [family, record.stages.get(family)?.progress ?? 'absent']),
  )
}

function freshFileQueryState(
  state:
    | {
        readonly data?: FileResult
        readonly dataUpdatedAt: number
        readonly status: string
      }
    | undefined,
  now: number,
): boolean {
  if (state?.status !== 'success' || !state.data) return false
  return now - state.dataUpdatedAt <= FILE_SNAPSHOT_STALE_MS
}

function postActivationWorkSince(
  baseline: PostActivationWorkSnapshot | null,
  path: string,
): PostActivationWorkSnapshot {
  const current = postActivationWorkSnapshot(path)
  if (!baseline) return current

  return {
    bufferBuilds: counterDelta(current.bufferBuilds, baseline.bufferBuilds),
    diagnosticsObserved: current.diagnosticsObserved && baseline.diagnosticsObserved,
    fileReads: counterDelta(current.fileReads, baseline.fileReads),
    highlighterSessionCreations: counterDelta(
      current.highlighterSessionCreations,
      baseline.highlighterSessionCreations,
    ),
    lineIndexScans: counterDelta(current.lineIndexScans, baseline.lineIndexScans),
    structuralSessionCreations: counterDelta(
      current.structuralSessionCreations,
      baseline.structuralSessionCreations,
    ),
    workerOpenRequests: counterDelta(current.workerOpenRequests, baseline.workerOpenRequests),
    workerParseRequests: counterDelta(current.workerParseRequests, baseline.workerParseRequests),
    workerQueryRequests: counterDelta(current.workerQueryRequests, baseline.workerQueryRequests),
    workerRefreshRequests: counterDelta(
      current.workerRefreshRequests,
      baseline.workerRefreshRequests,
    ),
  }
}

function postActivationWorkSnapshot(path: string): PostActivationWorkSnapshot {
  const diagnostics = editorTraceDiagnostics()
  return {
    bufferBuilds: pathPerformanceMarkCount('editor.file_open.buffer_built', path),
    diagnosticsObserved: diagnostics.observed,
    fileReads: pathPerformanceMarkCount('editor.file_open.file_read', path),
    highlighterSessionCreations: diagnosticCount(
      diagnostics.entries,
      'editor.syntax.session_created',
      'highlighter',
    ),
    lineIndexScans: diagnosticCount(diagnostics.entries, 'editor.line_starts.scan'),
    structuralSessionCreations: diagnosticCount(
      diagnostics.entries,
      'editor.syntax.session_created',
      'structural',
    ),
    workerOpenRequests: workerPerformanceMarkCount('open'),
    workerParseRequests: workerPerformanceMarkCount('parse'),
    workerQueryRequests: workerPerformanceMarkCount('queryRange'),
    workerRefreshRequests: workerPerformanceMarkCount('edit'),
  }
}

function counterDelta(current: number, baseline: number): number {
  return Math.max(0, current - baseline)
}

function pathPerformanceMarkCount(name: string, path: string): number {
  return performanceMarks(name).filter((entry) => entry.detail?.path === path).length
}

function workerPerformanceMarkCount(type: string): number {
  return performanceMarks('editor.worker.request').filter(
    (entry) =>
      entry.detail?.type === type &&
      entry.detail.type !== 'idleFence' &&
      entry.detail.type !== 'runtimeBarrier',
  ).length
}

function performanceMarks(name: string): readonly PerformanceMark[] {
  const entries = globalThis.performance?.getEntriesByName(name, 'mark') ?? []
  return entries.filter((entry): entry is PerformanceMark => entry.entryType === 'mark')
}

type TraceDiagnosticEntry = {
  readonly detail?: Readonly<Record<string, unknown>>
  readonly name: string
}

function editorTraceDiagnostics(): {
  readonly entries: readonly TraceDiagnosticEntry[]
  readonly observed: boolean
} {
  const trace = (
    globalThis as typeof globalThis & {
      readonly __editorPerfTrace?: { readonly report?: () => unknown }
    }
  ).__editorPerfTrace
  if (!trace?.report) return { entries: [], observed: false }

  try {
    return { entries: traceDiagnosticEntries(trace.report()), observed: true }
  } catch {
    return { entries: [], observed: false }
  }
}

function traceDiagnosticEntries(report: unknown): readonly TraceDiagnosticEntry[] {
  if (!isRecord(report) || !Array.isArray(report.traceEvents)) return []

  const entries: TraceDiagnosticEntry[] = []
  for (const event of report.traceEvents) {
    if (!isRecord(event) || event.kind !== 'diagnostic') continue
    if (!isRecord(event.diagnostic) || typeof event.diagnostic.name !== 'string') continue

    entries.push({
      detail: isRecord(event.diagnostic.detail) ? event.diagnostic.detail : undefined,
      name: event.diagnostic.name,
    })
  }
  return entries
}

function diagnosticCount(
  entries: readonly TraceDiagnosticEntry[],
  name: string,
  family?: string,
): number {
  return entries.filter(
    (entry) => entry.name === name && (!family || entry.detail?.family === family),
  ).length
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
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
