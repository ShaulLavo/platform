import type { QueryClient } from '@tanstack/react-query'
import {
  createEditorTextBuffer,
  type EditorPreparedDocument,
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

export type FileOpenIntentPreparation = {
  readonly buffer: EditorTextBuffer
  readonly preparedDocument: EditorPreparedDocument
  readonly startStages?: readonly (() => Promise<unknown> | null)[]
}

export type FileOpenIntentPreparer = {
  prepare(
    buffer: EditorTextBuffer,
    documentId: string,
    path: string,
    abortSignal: AbortSignal,
  ): FileOpenIntentPreparation
}

export type FileOpenIntentRuntime = {
  now(): number
  schedule<T>(task: () => T | Promise<T>): Promise<T>
}

export type FileOpenIntentBenchmarkResult = {
  readonly evictions: number
  readonly nonTargetIntents: number
  readonly preparedClaims: number
  readonly promotedBytes: number
  readonly targetIntents: number
  readonly wastedIntents: number
}

type FileOpenIntentBenchmarkScope = {
  evictions: number
  nonTargetIntents: number
  readonly path: string
  preparedClaims: number
  promotedBytes: number
  readonly sampleId: string
  targetIntents: number
  wastedIntents: number
  quarantined: boolean
}

type PreparedOpenRecord = {
  readonly claim: PreparedFileOpenClaim
  readonly createdAt: number
  readonly estimatedBytes: number
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
  private environmentTag = ''
  private lifecycleGeneration = 0
  private connectionGeneration = 0
  private connected = false
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
  ) {}

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

  setPreparationEnvironment(preparer: FileOpenIntentPreparer, tag: string): void {
    if (tag === this.environmentTag) return

    this.preparer = preparer
    this.environmentTag = tag
    this.clear()
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
      quarantined: false,
      sampleId,
      targetIntents: 0,
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
    if (this.claimIsCurrent(record.claim)) {
      if (this.activePath === canonical) this.activeAbortController = null
      this.noteBenchmarkClaim(canonical, record.estimatedBytes)
      return record.claim
    }

    record.claim.preparedDocument?.dispose()
    return null
  }

  invalidatePath(path: string): void {
    const canonical = canonicalPath(path)
    this.removeQueuedPath(canonical)
    if (this.activePath === canonical) this.activeAbortController?.abort()
    const record = this.records.get(canonical)
    if (!record) return

    record.claim.preparedDocument?.dispose()
    this.records.delete(canonical)
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
    for (const record of this.records.values()) record.claim.preparedDocument?.dispose()
    this.records.clear()
  }

  private runNext(): void {
    if (this.running) return

    const path = this.queuedPaths.pop()
    if (!path) return

    this.queuedPathSet.delete(path)
    this.running = true
    this.activePath = path
    const lifecycleGeneration = this.lifecycleGeneration
    const abortController = new AbortController()
    this.activeAbortController = abortController
    const operation = this.runtime
      .schedule(() => this.preparePath(path, lifecycleGeneration, abortController.signal))
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
    abortSignal: AbortSignal,
  ): Promise<void> {
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
        const preparation = this.storeLivePreparation(
          liveDocument,
          lifecycleGeneration,
          abortSignal,
        )
        if (preparation) {
          await this.runPreparationStages(
            liveDocument.path,
            preparation,
            lifecycleGeneration,
            abortSignal,
          )
        }
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
        const preparation = this.storeLivePreparation(
          supersedingLiveDocument,
          lifecycleGeneration,
          abortSignal,
        )
        if (preparation) {
          await this.runPreparationStages(
            supersedingLiveDocument.path,
            preparation,
            lifecycleGeneration,
            abortSignal,
          )
        }
        event.end({ outcome: preparation ? 'ready-live' : 'superseded-by-live' })
        return
      }

      const preparation = this.preparer.prepare(
        createCleanBuffer(file),
        file.path,
        file.path,
        abortSignal,
      )
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
      this.store(path, claim)
      await this.runPreparationStages(path, preparation, lifecycleGeneration, abortSignal)
      event.end({ outcome: 'ready-clean' })
    } catch (error) {
      event.error(error)
      event.end({ outcome: abortSignal.aborted ? 'aborted' : 'failed' })
    }
  }

  private storeLivePreparation(
    document: FileOpenIntentLiveDocument,
    lifecycleGeneration: number,
    abortSignal: AbortSignal,
  ): FileOpenIntentPreparation | null {
    if (abortSignal.aborted || !this.generationIsCurrent(lifecycleGeneration)) return null
    if (this.isActive(document.path) || this.isMounted(document.path)) return null
    if (document.buffer.getSnapshot().length * 2 > MAX_PREPARED_FILE_BYTES) return null
    const snapshot = document.buffer.getSnapshot()
    const prepared = this.preparer.prepare(document.buffer, document.id, document.path, abortSignal)
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
    this.store(document.path, claim)
    return prepared
  }

  private async runPreparationStages(
    path: string,
    preparation: FileOpenIntentPreparation,
    lifecycleGeneration: number,
    abortSignal: AbortSignal,
  ): Promise<void> {
    for (const start of preparation.startStages ?? []) {
      if (abortSignal.aborted || !this.generationIsCurrent(lifecycleGeneration)) return
      if (!this.recordOwnsPreparedDocument(path, preparation.preparedDocument)) return

      await this.runtime.schedule(async () => {
        if (abortSignal.aborted || !this.generationIsCurrent(lifecycleGeneration)) return
        if (!this.recordOwnsPreparedDocument(path, preparation.preparedDocument)) return

        await start()
      })
    }
  }

  private recordOwnsPreparedDocument(
    path: string,
    preparedDocument: EditorPreparedDocument,
  ): boolean {
    return this.records.get(path)?.claim.preparedDocument === preparedDocument
  }

  private store(path: string, claim: PreparedFileOpenClaim): void {
    const preparedDocument = claim.preparedDocument
    if (!preparedDocument) return

    const previous = this.records.get(path)
    previous?.claim.preparedDocument?.dispose()
    this.records.set(path, {
      claim,
      createdAt: this.runtime.now(),
      estimatedBytes: preparedDocument.estimatedBytes,
    })
    this.pruneBounds()
  }

  private recordIsCurrent(path: string): boolean {
    const record = this.records.get(path)
    if (!record) return false
    if (this.claimIsCurrent(record.claim)) {
      this.records.delete(path)
      this.records.set(path, record)
      return true
    }

    record.claim.preparedDocument?.dispose()
    this.records.delete(path)
    return false
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
      if (record.createdAt >= oldestAllowed) continue

      record.claim.preparedDocument?.dispose()
      this.records.delete(path)
      this.noteBenchmarkEviction()
    }
  }

  private pruneBounds(): void {
    let totalBytes = 0
    for (const record of this.records.values()) totalBytes += record.estimatedBytes
    while (this.records.size > MAX_PREPARED_OPENS || totalBytes > MAX_PREPARED_BYTES) {
      const oldest = this.records.entries().next().value as [string, PreparedOpenRecord] | undefined
      if (!oldest) return

      oldest[1].claim.preparedDocument?.dispose()
      this.records.delete(oldest[0])
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

    record.claim.preparedDocument?.dispose()
    this.records.delete(path)
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

  private noteBenchmarkClaim(path: string, estimatedBytes: number): void {
    const scope = this.benchmarkScope
    if (!scope || path !== scope.path) return

    scope.preparedClaims += 1
    scope.promotedBytes += estimatedBytes
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
}
