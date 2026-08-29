import { QueryClient } from '@tanstack/react-query'
import { describe, expect, it, vi } from 'vitest'

import {
  createEditorBufferSession,
  createEditorTextBuffer,
  type EditorPreparedDocument,
} from '@singapor/core'
import type { FileResult } from '@/lib/file-system-types'
import { fileSnapshotQueryOptions } from '@/lib/file-snapshot-query-cache'
import {
  FileOpenIntentService,
  type FileOpenIntentLiveDocument,
  type FileOpenIntentRuntime,
} from '@/lib/file-open-intent/state/service'

describe('file open intent service', () => {
  it('prepares and claims one exact fetched revision once', async () => {
    const queryClient = new QueryClient()
    const file = fileResult('/repo/a.ts')
    queryClient.setQueryData(fileSnapshotQueryOptions(file.path).queryKey, file)
    const preparedDocument = preparedDocumentLease()
    const prepare = vi.fn((buffer) => ({ buffer, preparedDocument }))
    const service = new FileOpenIntentService(
      queryClient,
      { prepare },
      () => null,
      () => false,
      () => false,
      () => undefined,
    )
    service.setRoot('/repo')

    service.prepare('/repo/a.ts')
    expect(prepare).not.toHaveBeenCalled()
    await vi.waitFor(() => expect(prepare).toHaveBeenCalledTimes(1))
    const claim = service.claimReadyClean('/repo/a.ts')

    expect(claim).toMatchObject({
      file,
      fileVersion: file.version,
      kind: 'clean',
      path: file.path,
      preparedDocument,
    })
    expect(claim?.buffer.getSnapshot()).toBe(claim?.snapshot)
    expect(service.claimReadyClean('/repo/a.ts')).toBeNull()
  })

  it('rejects paths outside the current root before scheduling work', async () => {
    const queryClient = new QueryClient()
    const prepare = vi.fn()
    const service = new FileOpenIntentService(
      queryClient,
      { prepare },
      () => null,
      () => false,
      () => false,
      () => undefined,
    )
    service.setRoot('/repo')

    service.prepare('/repo-other/a.ts')
    await Promise.resolve()

    expect(prepare).not.toHaveBeenCalled()
  })

  it('disposes stale live preparation but still claims the authoritative buffer', async () => {
    const queryClient = new QueryClient()
    const buffer = createEditorTextBuffer('alpha\n')
    const preparedDocument = preparedDocumentLease()
    let liveDocument: FileOpenIntentLiveDocument | null = {
      buffer,
      id: '/repo/a.ts',
      localRevision: 1,
      path: '/repo/a.ts',
    }
    const prepare = vi.fn((preparedBuffer) => ({
      buffer: preparedBuffer,
      preparedDocument,
    }))
    const service = new FileOpenIntentService(
      queryClient,
      { prepare },
      () => liveDocument,
      () => false,
      () => false,
      () => undefined,
    )
    service.setRoot('/repo')
    service.prepare('/repo/a.ts')
    await vi.waitFor(() => expect(prepare).toHaveBeenCalledTimes(1))

    createEditorBufferSession(buffer).applyText('x')
    liveDocument = { ...liveDocument, localRevision: 2 }

    expect(service.claimLive('/repo/a.ts')).toMatchObject({
      buffer,
      documentId: '/repo/a.ts',
      kind: 'live',
      localRevision: 2,
      preparedDocument: null,
    })
    expect(preparedDocument.dispose).toHaveBeenCalledTimes(1)
  })

  it('preserves prepared work across a disconnect/reconnect microtask replay', async () => {
    const queryClient = new QueryClient()
    const file = fileResult('/repo/a.ts')
    queryClient.setQueryData(fileSnapshotQueryOptions(file.path).queryKey, file)
    const preparedDocument = preparedDocumentLease()
    const prepare = vi.fn((buffer) => ({ buffer, preparedDocument }))
    const service = new FileOpenIntentService(
      queryClient,
      { prepare },
      () => null,
      () => false,
      () => false,
      () => undefined,
    )
    service.setRoot('/repo')
    service.connect()
    service.prepare(file.path)
    await vi.waitFor(() => expect(prepare).toHaveBeenCalledOnce())

    service.scheduleDisconnect()
    service.connect()
    await Promise.resolve()

    expect(service.claimReadyClean(file.path)?.preparedDocument).toBe(preparedDocument)
    expect(preparedDocument.dispose).not.toHaveBeenCalled()
  })

  it('runs the most recent queued intent before older queued work', async () => {
    const queryClient = new QueryClient()
    const first = deferred<FileResult>()
    const paths = ['/repo/a.ts', '/repo/b.ts', '/repo/c.ts'] as const
    void queryClient.fetchQuery({
      ...fileSnapshotQueryOptions(paths[0]),
      queryFn: () => first.promise,
    })
    for (const path of paths.slice(1)) {
      queryClient.setQueryData(fileSnapshotQueryOptions(path).queryKey, fileResult(path))
    }
    const order: string[] = []
    const service = new FileOpenIntentService(
      queryClient,
      {
        prepare: (buffer, _documentId, path) => {
          order.push(path)
          return { buffer, preparedDocument: preparedDocumentLease() }
        },
      },
      () => null,
      () => false,
      () => false,
      () => undefined,
    )
    service.setRoot('/repo')

    service.prepare(paths[0])
    service.prepare(paths[1])
    service.prepare(paths[2])
    first.resolve(fileResult(paths[0]))
    await vi.waitFor(() => expect(order).toHaveLength(3))

    expect(order).toEqual([paths[0], paths[2], paths[1]])
  })

  it('lets activation claim document data before queued provider stages start', async () => {
    const queryClient = new QueryClient()
    const file = fileResult('/repo/a.ts')
    queryClient.setQueryData(fileSnapshotQueryOptions(file.path).queryKey, file)
    const runtime = manualRuntime()
    const startHighlighter = vi.fn(async () => 'ready')
    const startStructural = vi.fn(async () => 'ready')
    const service = new FileOpenIntentService(
      queryClient,
      {
        prepare: (buffer) => ({
          buffer,
          preparedDocument: preparedDocumentLease(),
          startStages: [startHighlighter, startStructural],
        }),
      },
      () => null,
      () => false,
      () => false,
      () => undefined,
      runtime,
    )
    service.setRoot('/repo')

    service.prepare(file.path)
    expect(runtime.queued()).toBe(1)
    runtime.startNext()
    await vi.waitFor(() => expect(runtime.queued()).toBe(1))

    expect(service.claimReadyClean(file.path)).not.toBeNull()
    runtime.startNext()
    await runtime.settled()

    expect(startHighlighter).not.toHaveBeenCalled()
    expect(startStructural).not.toHaveBeenCalled()
  })

  it('relinquishes service cancellation after a prepared claim', async () => {
    const queryClient = new QueryClient()
    const file = fileResult('/repo/a.ts')
    const stage = deferred<string>()
    let preparationSignal: AbortSignal | null = null
    queryClient.setQueryData(fileSnapshotQueryOptions(file.path).queryKey, file)
    const service = new FileOpenIntentService(
      queryClient,
      {
        prepare: (buffer, _documentId, _path, abortSignal) => {
          preparationSignal = abortSignal
          return {
            buffer,
            preparedDocument: preparedDocumentLease(),
            startStages: [() => stage.promise],
          }
        },
      },
      () => null,
      () => false,
      () => false,
      () => undefined,
    )
    service.setRoot('/repo')

    service.prepare(file.path)
    await vi.waitFor(() => expect(preparationSignal).not.toBeNull())
    expect(service.claimReadyClean(file.path)).not.toBeNull()

    service.clear()
    const claimedSignal = preparationSignal as AbortSignal | null
    if (!claimedSignal) throw new RangeError('missing preparation signal')
    expect(claimedSignal.aborted).toBe(false)
    stage.resolve('ready')
  })

  it('does not admit an old completion after root to null to root', async () => {
    const queryClient = new QueryClient()
    const file = fileResult('/repo/a.ts')
    const pending = deferred<FileResult>()
    void queryClient.fetchQuery({
      ...fileSnapshotQueryOptions(file.path),
      queryFn: () => pending.promise,
    })
    const prepare = vi.fn((buffer) => ({
      buffer,
      preparedDocument: preparedDocumentLease(),
    }))
    const service = new FileOpenIntentService(
      queryClient,
      { prepare },
      () => null,
      () => false,
      () => false,
      () => undefined,
    )
    service.setRoot('/repo')
    service.prepare(file.path)

    service.setRoot(null)
    service.setRoot('/repo')
    pending.resolve(file)
    await vi.waitFor(() =>
      expect(queryClient.getQueryData(fileSnapshotQueryOptions(file.path).queryKey)).toEqual(file),
    )

    expect(prepare).not.toHaveBeenCalled()
    expect(service.claimReadyClean(file.path)).toBeNull()
  })

  it('treats an equivalent root replay as a no-op', async () => {
    const queryClient = new QueryClient()
    const file = fileResult('/repo/a.ts')
    queryClient.setQueryData(fileSnapshotQueryOptions(file.path).queryKey, file)
    const preparedDocument = preparedDocumentLease()
    const prepare = vi.fn((buffer) => ({ buffer, preparedDocument }))
    const service = new FileOpenIntentService(
      queryClient,
      { prepare },
      () => null,
      () => false,
      () => false,
      () => undefined,
    )
    service.setRoot('/repo')
    service.prepare(file.path)
    await vi.waitFor(() => expect(prepare).toHaveBeenCalledOnce())

    service.setRoot('/repo/./')

    expect(service.claimReadyClean(file.path)?.preparedDocument).toBe(preparedDocument)
    expect(preparedDocument.dispose).not.toHaveBeenCalled()
  })

  it('does no query or preparation work for an actually mounted path', async () => {
    const queryClient = new QueryClient()
    const prepare = vi.fn()
    const prefetchRelated = vi.fn()
    const service = new FileOpenIntentService(
      queryClient,
      { prepare },
      () => null,
      () => false,
      () => true,
      prefetchRelated,
    )
    service.setRoot('/repo')

    service.prepare('/repo/a.ts')
    await Promise.resolve()

    expect(prefetchRelated).not.toHaveBeenCalled()
    expect(prepare).not.toHaveBeenCalled()
    expect(queryClient.getQueryCache().getAll()).toHaveLength(0)
  })

  it('does no intent work for the active file', async () => {
    const queryClient = new QueryClient()
    const prepare = vi.fn()
    const service = new FileOpenIntentService(
      queryClient,
      { prepare },
      () => null,
      (path) => path === '/repo/a.ts',
      () => false,
      () => undefined,
    )
    service.setRoot('/repo')

    service.prepare('/repo/a.ts')
    await Promise.resolve()

    expect(prepare).not.toHaveBeenCalled()
    expect(queryClient.getQueryCache().getAll()).toHaveLength(0)
  })

  it('scopes, quarantines, drains, and releases benchmark intent work', async () => {
    const queryClient = new QueryClient()
    const file = fileResult('/repo/a.ts')
    queryClient.setQueryData(fileSnapshotQueryOptions(file.path).queryKey, file)
    const service = new FileOpenIntentService(
      queryClient,
      {
        prepare: (buffer) => ({ buffer, preparedDocument: preparedDocumentLease() }),
      },
      () => null,
      () => false,
      () => false,
      () => undefined,
    )
    service.setRoot('/repo')
    service.connect()
    service.beginBenchmarkSample('sample-1', file.path)

    service.prepare(file.path)
    await vi.waitFor(() => expect(service.claimReadyClean(file.path)).not.toBeNull())
    service.quarantineBenchmarkSample('sample-1')

    await expect(service.finishBenchmarkSample('sample-1')).resolves.toEqual({
      evictions: 0,
      nonTargetIntents: 0,
      preparedClaims: 1,
      promotedBytes: 1,
      targetIntents: 1,
      wastedIntents: 0,
    })
    service.releaseBenchmarkSample('sample-1')
    expect(() => service.quarantineBenchmarkSample('sample-1')).toThrow(
      'Unknown editor-open benchmark sample',
    )
  })
})

function fileResult(path: string): FileResult {
  return {
    content: 'alpha\n',
    mtimeMs: 1,
    path,
    size: 6,
    version: 'v1',
  }
}

function preparedDocumentLease(): EditorPreparedDocument {
  return {
    dispose: vi.fn(),
    estimatedBytes: 1,
    startStage: vi.fn(() => null),
    take: vi.fn(() => null),
  }
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise
  })
  return { promise, resolve }
}

function manualRuntime(): FileOpenIntentRuntime & {
  queued(): number
  startNext(): void
  settled(): Promise<void>
} {
  const tasks: Array<() => void> = []
  const operations = new Set<Promise<unknown>>()
  return {
    now: () => Date.now(),
    queued: () => tasks.length,
    schedule: <T>(task: () => T | Promise<T>) =>
      new Promise<T>((resolve, reject) => {
        tasks.push(() => {
          const operation = Promise.resolve().then(task)
          operations.add(operation)
          void operation.finally(() => operations.delete(operation))
          operation.then(resolve, reject)
        })
      }),
    settled: async () => {
      while (operations.size > 0) await Promise.allSettled(operations)
    },
    startNext: () => tasks.shift()?.(),
  }
}
