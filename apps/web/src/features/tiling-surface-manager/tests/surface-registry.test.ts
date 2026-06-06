import { describe, expect, it } from 'vitest'

import { snapshotDiffDocumentId } from '@/features/git/diff-document'
import type { SnapshotDiffDocumentInput } from '@/features/git/diff-document'

import {
  diffSurfaceId,
  fileEditorSurfaceId,
  searchPreviewSurfaceId,
  searchResultsSurfaceId,
  terminalSurfaceId,
} from '@/features/tiling-surface-manager/utils/layout-ids'
import {
  SURFACE_SERIALIZED_VERSION,
  type SurfaceType,
} from '@/features/tiling-surface-manager/utils/layout-types'
import {
  canFloatSurface,
  canSplitSurface,
  canUnmountSurfaceWhenHidden,
  createRegisteredSurface,
  createSurfaceRegistry,
  defaultSurfaceRecipeSlot,
  defaultSurfaceRegistry,
  restoreRegisteredSurface,
  serializeRegisteredSurface,
  supportsSurfacePreview,
  surfaceClosePolicy,
  validSurfacePlacements,
  type SurfaceDescriptor,
} from '@/features/tiling-surface-manager/utils/surface-registry'

const rootPath = '/repo'

describe('tiling surface registry', () => {
  it('rejects duplicate surface types', () => {
    expect(() =>
      createSurfaceRegistry([testDescriptor('file-editor'), testDescriptor('file-editor')]),
    ).toThrow('Duplicate surface descriptor: file-editor')
  })

  it('creates stable IDs from resource and session keys', () => {
    const diffDocumentId = snapshotDiffDocumentId(snapshotDiff('/repo/src/app.ts'))
    const file = createRegisteredSurface(defaultSurfaceRegistry, {
      path: '/repo/src/app.ts',
      type: 'file-editor',
    })
    const diff = createRegisteredSurface(defaultSurfaceRegistry, {
      diffDocumentId,
      type: 'diff',
    })
    const terminal = createRegisteredSurface(defaultSurfaceRegistry, {
      sessionId: 'terminal-1',
      type: 'terminal',
    })
    const search = createRegisteredSurface(defaultSurfaceRegistry, { type: 'search-results' })

    expect(file?.id).toBe(fileEditorSurfaceId('/repo/src/app.ts'))
    expect(diff?.id).toBe(diffSurfaceId(diffDocumentId))
    expect(terminal?.id).toBe(terminalSurfaceId('terminal-1'))
    expect(search?.id).toBe(searchResultsSurfaceId())
  })

  it('keeps dirty-file and terminal close semantics', () => {
    const file = mustCreateSurface({
      path: '/repo/src/app.ts',
      type: 'file-editor',
    })
    const terminal = mustCreateSurface({
      sessionId: 'terminal-1',
      type: 'terminal',
    })

    expect(surfaceClosePolicy(defaultSurfaceRegistry, file, { isDirtyFile: () => false })).toEqual({
      type: 'close',
    })
    expect(surfaceClosePolicy(defaultSurfaceRegistry, file, { isDirtyFile: () => true })).toEqual({
      path: '/repo/src/app.ts',
      type: 'confirm-dirty-file',
    })
    expect(surfaceClosePolicy(defaultSurfaceRegistry, terminal)).toEqual({
      sessionId: 'terminal-1',
      type: 'dispose-running-surface',
    })
  })

  it('exposes capability checks from registered descriptors', () => {
    const file = mustCreateSurface({
      path: '/repo/src/app.ts',
      type: 'file-editor',
    })
    const search = mustCreateSurface({ type: 'search-results' })
    const terminal = mustCreateSurface({
      sessionId: 'terminal-1',
      type: 'terminal',
    })

    expect(canFloatSurface(defaultSurfaceRegistry, file)).toBe(false)
    expect(canSplitSurface(defaultSurfaceRegistry, file)).toBe(true)
    expect(supportsSurfacePreview(defaultSurfaceRegistry, file)).toBe(true)
    expect(canSplitSurface(defaultSurfaceRegistry, search)).toBe(false)
    expect(canUnmountSurfaceWhenHidden(defaultSurfaceRegistry, search)).toBe(true)
    expect(canUnmountSurfaceWhenHidden(defaultSurfaceRegistry, terminal)).toBe(false)
    expect(defaultSurfaceRecipeSlot(defaultSurfaceRegistry, search)).toBe('primary-side')
    expect(validSurfacePlacements(defaultSurfaceRegistry, file)).toContain('window-edge')
  })

  it('restores valid serialized surfaces and drops invalid workspace resources', () => {
    const diffDocumentId = snapshotDiffDocumentId(snapshotDiff('/repo/src/app.ts'))
    const file = mustCreateSurface({
      path: '/repo/src/app.ts',
      type: 'file-editor',
    })
    const diff = mustCreateSurface({
      diffDocumentId,
      type: 'diff',
    })
    const search = mustCreateSurface({
      serializedState: { query: 'needle' },
      type: 'search-results',
    })
    const serializedFile = serializeRegisteredSurface(defaultSurfaceRegistry, file)
    const serializedDiff = serializeRegisteredSurface(defaultSurfaceRegistry, diff)
    const serializedSearch = serializeRegisteredSurface(defaultSurfaceRegistry, search)

    expect(restoreRegisteredSurface(defaultSurfaceRegistry, serializedFile, { rootPath })?.id).toBe(
      file.id,
    )
    expect(restoreRegisteredSurface(defaultSurfaceRegistry, serializedDiff, { rootPath })?.id).toBe(
      diff.id,
    )
    expect(
      restoreRegisteredSurface(defaultSurfaceRegistry, serializedSearch, { rootPath })
        ?.serializedState,
    ).toEqual({ query: 'needle' })
    expect(
      restoreRegisteredSurface(
        defaultSurfaceRegistry,
        {
          lifecycle: 'durable',
          resourceKey: '/outside/src/app.ts',
          type: 'file-editor',
          version: 1,
        },
        { rootPath },
      ),
    ).toBeNull()
    expect(
      restoreRegisteredSurface(
        defaultSurfaceRegistry,
        {
          lifecycle: 'durable',
          resourceKey: 'not-a-diff-document-id',
          type: 'diff',
          version: 1,
        },
        { rootPath },
      ),
    ).toBeNull()
    expect(
      restoreRegisteredSurface(defaultSurfaceRegistry, serializedSearch, { rootPath: null }),
    ).toBeNull()
  })

  it('rejects search previews without a valid owner and context', () => {
    const owner = mustCreateSurface({ type: 'search-results' })
    const ownerContextKey = 'result:/repo/src/app.ts:1'
    const previewInput = {
      ownerContextKey,
      ownerSurfaceId: owner.id,
      resourceKey: '/repo/src/app.ts',
      type: 'search-preview' as const,
    }

    expect(
      createRegisteredSurface(defaultSurfaceRegistry, previewInput, {
        rootPath,
      }),
    ).toBeNull()
    expect(
      createRegisteredSurface(defaultSurfaceRegistry, {
        ...previewInput,
        ownerContextKey: '',
      }),
    ).toBeNull()

    const preview = createRegisteredSurface(defaultSurfaceRegistry, previewInput, {
      rootPath,
      surfacesById: { [owner.id]: owner },
    })
    expect(preview?.id).toBe(searchPreviewSurfaceId(owner.id, ownerContextKey))

    const serialized = {
      lifecycle: 'transient',
      ownerContextKey,
      ownerSurfaceId: owner.id,
      resourceKey: '/repo/src/app.ts',
      type: 'search-preview',
      version: SURFACE_SERIALIZED_VERSION,
    } as const
    expect(restoreRegisteredSurface(defaultSurfaceRegistry, serialized, { rootPath })).toBeNull()
    expect(
      restoreRegisteredSurface(defaultSurfaceRegistry, serialized, {
        rootPath,
        surfacesById: { [owner.id]: owner },
      })?.id,
    ).toBe(preview?.id)
  })
})

function mustCreateSurface(input: Parameters<typeof createRegisteredSurface>[1]) {
  const surface = createRegisteredSurface(defaultSurfaceRegistry, input)
  if (!surface) throw new Error(`Failed to create ${input.type} surface`)

  return surface
}

function testDescriptor(type: SurfaceType): SurfaceDescriptor {
  return {
    capabilities: (surface) => surface.capabilities,
    cardinality: 'multi',
    closePolicy: () => ({ type: 'close' }),
    create: () => null,
    defaultRecipeSlot: (surface) => surface.capabilities.defaultRecipeSlot,
    restore: () => null,
    serialize: () => null,
    type,
    validPlacements: (surface) => surface.capabilities.validPlacements,
  }
}

function snapshotDiff(path: string): SnapshotDiffDocumentInput {
  return {
    hunks: [],
    newObjectId: 'abcdef1234567890',
    patch: '',
    path,
    staged: false,
  }
}
