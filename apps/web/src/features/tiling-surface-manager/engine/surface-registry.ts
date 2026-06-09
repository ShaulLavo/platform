import { createClientInvariantError } from '@/lib/structured-errors'

import { diffDocumentLabel, parseDiffDocumentId } from '@/features/git/diff-document'
import { parseSearchBufferDocumentId } from '@/features/search/search-buffer-document'

import {
  createChatSurface,
  createDiagnosticsSurface,
  createDiffSurface,
  createFileEditorSurface,
  createFileNavigatorSurface,
  createGitChangesSurface,
  createLogsSurface,
  createPlaceholderSurface,
  createSearchPreviewSurface,
  createSearchResultsSurface,
  createTerminalSurface,
} from '@/features/tiling-surface-manager/engine/layout-builders'
import {
  SURFACE_SERIALIZED_VERSION,
  type Surface,
  type SurfaceCapabilities,
  type SurfaceCardinality,
  type SurfaceClosePolicy,
  type SurfaceId,
  type SurfaceLifecycle,
  type SurfacePlacementKind,
  type SurfaceType,
  type WorkspaceRecipeSlot,
} from '@/features/tiling-surface-manager/engine/layout-types'

export type SurfaceCreateContext = {
  readonly rootPath?: string | null
  readonly surfacesById?: Readonly<Record<string, Surface>>
}

export type SurfaceRestoreContext = {
  readonly rootPath: string | null
  readonly surfacesById?: Readonly<Record<string, Surface>>
}

export type SurfaceCloseContext = {
  readonly isDirtyFile?: (path: string) => boolean
}

type EditorSurfaceLifecycle = Extract<SurfaceLifecycle, 'durable' | 'transient'>

export type SurfaceCreateInput =
  | {
      readonly lifecycle?: EditorSurfaceLifecycle
      readonly path: string
      readonly serializedState?: unknown
      readonly title?: string
      readonly type: 'file-editor'
    }
  | {
      readonly diffDocumentId: string
      readonly lifecycle?: EditorSurfaceLifecycle
      readonly serializedState?: unknown
      readonly title?: string
      readonly type: 'diff'
    }
  | {
      readonly serializedState?: unknown
      readonly type: 'search-results'
    }
  | {
      readonly ownerContextKey: string
      readonly ownerSurfaceId: SurfaceId
      readonly resourceKey?: string
      readonly serializedState?: unknown
      readonly title?: string
      readonly type: 'search-preview'
    }
  | {
      readonly serializedState?: unknown
      readonly sessionId: string
      readonly title?: string
      readonly type: 'terminal'
    }
  | {
      readonly serializedState?: unknown
      readonly type: 'file-navigator'
    }
  | {
      readonly serializedState?: unknown
      readonly type: 'git-changes'
    }
  | {
      readonly serializedState?: unknown
      readonly type: 'logs'
    }
  | {
      readonly serializedState?: unknown
      readonly type: 'chat'
    }
  | {
      readonly serializedState?: unknown
      readonly type: 'diagnostics'
    }
  | {
      readonly contextKey: string
      readonly serializedState?: unknown
      readonly title: string
      readonly type: 'placeholder'
    }

export type SerializedSurface = {
  readonly lifecycle: SurfaceLifecycle
  readonly ownerContextKey?: string
  readonly ownerSurfaceId?: SurfaceId
  readonly resourceKey?: string
  readonly serializedState?: unknown
  readonly stateKey?: string
  readonly title?: string
  readonly type: SurfaceType
  readonly version: typeof SURFACE_SERIALIZED_VERSION
}

export type SurfaceDescriptor = {
  readonly capabilities: (surface: Surface) => SurfaceCapabilities
  readonly cardinality: SurfaceCardinality
  readonly closePolicy: (surface: Surface, context: SurfaceCloseContext) => SurfaceClosePolicy
  readonly create: (input: SurfaceCreateInput, context: SurfaceCreateContext) => Surface | null
  readonly defaultRecipeSlot: (surface: Surface) => WorkspaceRecipeSlot
  readonly restore: (data: unknown, context: SurfaceRestoreContext) => Surface | null
  readonly serialize: (surface: Surface) => SerializedSurface | null
  readonly type: SurfaceType
  readonly validPlacements: (surface: Surface) => readonly SurfacePlacementKind[]
}

export type SurfaceRegistry = ReadonlyMap<SurfaceType, SurfaceDescriptor>

export const defaultSurfaceDescriptors = [
  fileEditorDescriptor(),
  diffDescriptor(),
  searchResultsDescriptor(),
  searchPreviewDescriptor(),
  terminalDescriptor(),
  fileNavigatorDescriptor(),
  gitChangesDescriptor(),
  chatDescriptor(),
  logsDescriptor(),
  diagnosticsDescriptor(),
  placeholderDescriptor(),
] as const satisfies readonly SurfaceDescriptor[]

export const defaultSurfaceRegistry = createSurfaceRegistry(defaultSurfaceDescriptors)

export function createSurfaceRegistry(descriptors: readonly SurfaceDescriptor[]): SurfaceRegistry {
  const registry = new Map<SurfaceType, SurfaceDescriptor>()

  for (const descriptor of descriptors) {
    if (registry.has(descriptor.type)) {
      throw createClientInvariantError(`Duplicate surface descriptor: ${descriptor.type}`)
    }

    registry.set(descriptor.type, descriptor)
  }

  return registry
}

export function surfaceDescriptor(registry: SurfaceRegistry, type: SurfaceType) {
  return registry.get(type) ?? null
}

export function createRegisteredSurface(
  registry: SurfaceRegistry,
  input: SurfaceCreateInput,
  context: SurfaceCreateContext = {},
) {
  return registry.get(input.type)?.create(input, context) ?? null
}

export function restoreRegisteredSurface(
  registry: SurfaceRegistry,
  data: unknown,
  context: SurfaceRestoreContext,
) {
  const type = serializedSurfaceType(data)
  if (!type) return null

  return registry.get(type)?.restore(data, context) ?? null
}

export function serializeRegisteredSurface(registry: SurfaceRegistry, surface: Surface) {
  return registry.get(surface.type)?.serialize(surface) ?? null
}

export function surfaceClosePolicy(
  registry: SurfaceRegistry,
  surface: Surface,
  context: SurfaceCloseContext = {},
): SurfaceClosePolicy {
  const descriptor = registry.get(surface.type)
  if (!descriptor) {
    return { reason: `No surface descriptor registered for ${surface.type}`, type: 'block' }
  }

  return descriptor.closePolicy(surface, context)
}

export function canCloseSurface(
  registry: SurfaceRegistry,
  surface: Surface,
  context: SurfaceCloseContext = {},
) {
  const capabilities = registeredSurfaceCapabilities(registry, surface)
  if (!capabilities?.canClose) return false

  return surfaceClosePolicy(registry, surface, context).type !== 'block'
}

export function canSplitSurface(registry: SurfaceRegistry, surface: Surface) {
  return registeredSurfaceCapabilities(registry, surface)?.canSplit ?? false
}

export function canCollapseSurface(registry: SurfaceRegistry, surface: Surface) {
  return registeredSurfaceCapabilities(registry, surface)?.canCollapse ?? false
}

export function canFloatSurface(registry: SurfaceRegistry, surface: Surface) {
  return registeredSurfaceCapabilities(registry, surface)?.canFloat ?? false
}

export function supportsSurfacePreview(registry: SurfaceRegistry, surface: Surface) {
  return registeredSurfaceCapabilities(registry, surface)?.supportsPreview ?? false
}

export function canUnmountSurfaceWhenNotExpanded(registry: SurfaceRegistry, surface: Surface) {
  return registeredSurfaceCapabilities(registry, surface)?.canUnmountWhenNotExpanded ?? false
}

export function validSurfacePlacements(registry: SurfaceRegistry, surface: Surface) {
  return registry.get(surface.type)?.validPlacements(surface) ?? []
}

export function defaultSurfaceRecipeSlot(registry: SurfaceRegistry, surface: Surface) {
  return registry.get(surface.type)?.defaultRecipeSlot(surface) ?? null
}

function fileEditorDescriptor(): SurfaceDescriptor {
  return descriptor({
    cardinality: 'multi',
    closePolicy: fileEditorClosePolicy,
    create: createFileEditorFromInput,
    restore: restoreFileEditorSurface,
    type: 'file-editor',
  })
}

function diffDescriptor(): SurfaceDescriptor {
  return descriptor({
    cardinality: 'multi',
    create: createDiffFromInput,
    restore: restoreDiffSurface,
    type: 'diff',
  })
}

function searchResultsDescriptor(): SurfaceDescriptor {
  return descriptor({
    cardinality: 'singleton',
    create: createSearchResultsFromInput,
    restore: restoreSearchResultsSurface,
    type: 'search-results',
  })
}

function searchPreviewDescriptor(): SurfaceDescriptor {
  return descriptor({
    cardinality: 'singleton-per-context',
    create: createSearchPreviewFromInput,
    restore: restoreSearchPreviewSurface,
    type: 'search-preview',
  })
}

function terminalDescriptor(): SurfaceDescriptor {
  return descriptor({
    cardinality: 'multi',
    closePolicy: terminalClosePolicy,
    create: createTerminalFromInput,
    restore: restoreTerminalSurface,
    type: 'terminal',
  })
}

function fileNavigatorDescriptor(): SurfaceDescriptor {
  return descriptor({
    cardinality: 'singleton',
    create: (input, context) =>
      createWorkspaceSingletonSurface(input, context, 'file-navigator', createFileNavigatorSurface),
    restore: (data, context) =>
      restoreWorkspaceSingletonSurface(data, context, 'file-navigator', createFileNavigatorSurface),
    type: 'file-navigator',
  })
}

function gitChangesDescriptor(): SurfaceDescriptor {
  return descriptor({
    cardinality: 'singleton',
    create: (input, context) =>
      createWorkspaceSingletonSurface(input, context, 'git-changes', createGitChangesSurface),
    restore: (data, context) =>
      restoreWorkspaceSingletonSurface(data, context, 'git-changes', createGitChangesSurface),
    type: 'git-changes',
  })
}

function logsDescriptor(): SurfaceDescriptor {
  return descriptor({
    cardinality: 'singleton',
    create: (input, context) =>
      createWorkspaceSingletonSurface(input, context, 'logs', createLogsSurface),
    restore: (data, context) =>
      restoreWorkspaceSingletonSurface(data, context, 'logs', createLogsSurface),
    type: 'logs',
  })
}

function chatDescriptor(): SurfaceDescriptor {
  return descriptor({
    cardinality: 'singleton',
    create: (input, context) =>
      createWorkspaceSingletonSurface(input, context, 'chat', createChatSurface),
    restore: (data, context) =>
      restoreWorkspaceSingletonSurface(data, context, 'chat', createChatSurface),
    type: 'chat',
  })
}

function diagnosticsDescriptor(): SurfaceDescriptor {
  return descriptor({
    cardinality: 'singleton',
    create: (input, context) =>
      createWorkspaceSingletonSurface(input, context, 'diagnostics', createDiagnosticsSurface),
    restore: (data, context) =>
      restoreWorkspaceSingletonSurface(data, context, 'diagnostics', createDiagnosticsSurface),
    type: 'diagnostics',
  })
}

function placeholderDescriptor(): SurfaceDescriptor {
  return descriptor({
    cardinality: 'multi',
    create: createPlaceholderFromInput,
    restore: restorePlaceholderSurface,
    type: 'placeholder',
  })
}

function descriptor({
  cardinality,
  closePolicy = staticClosePolicy,
  create,
  restore,
  serialize = serializeRestorableSurface,
  type,
}: {
  readonly cardinality: SurfaceCardinality
  readonly closePolicy?: SurfaceDescriptor['closePolicy']
  readonly create: SurfaceDescriptor['create']
  readonly restore: SurfaceDescriptor['restore']
  readonly serialize?: SurfaceDescriptor['serialize']
  readonly type: SurfaceType
}): SurfaceDescriptor {
  return {
    capabilities: (surface) => surface.capabilities,
    cardinality,
    closePolicy,
    create,
    defaultRecipeSlot: (surface) => surface.capabilities.defaultRecipeSlot,
    restore,
    serialize,
    type,
    validPlacements: (surface) => surface.capabilities.validPlacements,
  }
}

function createFileEditorFromInput(input: SurfaceCreateInput, context: SurfaceCreateContext) {
  if (input.type !== 'file-editor') return null
  if (!input.path) return null
  if (!pathAllowedForCreate(input.path, context)) return null

  return withSerializedState(
    createFileEditorSurface({
      lifecycle: input.lifecycle,
      path: input.path,
      title: input.title,
    }),
    input.serializedState,
  )
}

function createDiffFromInput(input: SurfaceCreateInput, context: SurfaceCreateContext) {
  if (input.type !== 'diff') return null

  const diff = parseDiffDocumentId(input.diffDocumentId)
  if (!diff) return null
  if (!pathAllowedForCreate(diff.path, context)) return null

  return withSerializedState(
    createDiffSurface({
      diffDocumentId: input.diffDocumentId,
      lifecycle: input.lifecycle,
      title: input.title ?? diffDocumentLabel(input.diffDocumentId),
    }),
    input.serializedState,
  )
}

function createSearchResultsFromInput(input: SurfaceCreateInput, context: SurfaceCreateContext) {
  if (input.type !== 'search-results') return null
  if (!workspaceAllowedForCreate(context)) return null

  return withSerializedState(createSearchResultsSurface(), input.serializedState)
}

function createSearchPreviewFromInput(input: SurfaceCreateInput, context: SurfaceCreateContext) {
  if (input.type !== 'search-preview') return null
  if (!input.ownerContextKey) return null
  if (!hasKnownOwner(input.ownerSurfaceId, context)) return null
  if (!resourceAllowedForCreate(input.resourceKey, context)) return null

  return withSerializedState(
    createSearchPreviewSurface({
      ownerContextKey: input.ownerContextKey,
      ownerSurfaceId: input.ownerSurfaceId,
      resourceKey: input.resourceKey,
      title: input.title,
    }),
    input.serializedState,
  )
}

function createTerminalFromInput(input: SurfaceCreateInput, context: SurfaceCreateContext) {
  if (input.type !== 'terminal') return null
  if (!input.sessionId) return null
  if (!workspaceAllowedForCreate(context)) return null

  return withSerializedState(
    createTerminalSurface({
      sessionId: input.sessionId,
      title: input.title,
    }),
    input.serializedState,
  )
}

function createPlaceholderFromInput(input: SurfaceCreateInput) {
  if (input.type !== 'placeholder') return null
  if (!input.contextKey) return null
  if (!input.title) return null

  return withSerializedState(
    createPlaceholderSurface({
      contextKey: input.contextKey,
      title: input.title,
    }),
    input.serializedState,
  )
}

function createWorkspaceSingletonSurface(
  input: SurfaceCreateInput,
  context: SurfaceCreateContext,
  type: SurfaceType,
  build: () => Surface,
) {
  if (input.type !== type) return null
  if (!workspaceAllowedForCreate(context)) return null

  return withSerializedState(build(), input.serializedState)
}

function restoreFileEditorSurface(data: unknown, context: SurfaceRestoreContext) {
  const serialized = serializedSurfaceFor(data, 'file-editor')
  if (!serialized) return null
  if (!serialized.resourceKey) return null
  if (!isEditorSurfaceLifecycle(serialized.lifecycle)) return null
  if (!editorResourceInWorkspace(serialized.resourceKey, context.rootPath)) return null

  return withSerializedState(
    createFileEditorSurface({
      lifecycle: serialized.lifecycle,
      path: serialized.resourceKey,
      title: serialized.title,
    }),
    serialized.serializedState,
  )
}

function restoreDiffSurface(data: unknown, context: SurfaceRestoreContext) {
  const serialized = serializedSurfaceFor(data, 'diff')
  if (!serialized) return null
  if (!serialized.resourceKey) return null
  if (!isEditorSurfaceLifecycle(serialized.lifecycle)) return null

  const diff = parseDiffDocumentId(serialized.resourceKey)
  if (!diff) return null
  if (!isPathInWorkspace(diff.path, context.rootPath)) return null

  return withSerializedState(
    createDiffSurface({
      diffDocumentId: serialized.resourceKey,
      lifecycle: serialized.lifecycle,
      title: serialized.title ?? diffDocumentLabel(serialized.resourceKey),
    }),
    serialized.serializedState,
  )
}

function restoreSearchResultsSurface(data: unknown, context: SurfaceRestoreContext) {
  return restoreWorkspaceSingletonSurface(
    data,
    context,
    'search-results',
    createSearchResultsSurface,
  )
}

function restoreSearchPreviewSurface(data: unknown, context: SurfaceRestoreContext) {
  const serialized = serializedSurfaceFor(data, 'search-preview')
  if (!serialized) return null
  if (serialized.lifecycle !== 'transient') return null
  if (!serialized.ownerContextKey) return null
  if (!serialized.ownerSurfaceId) return null
  if (!hasKnownOwner(serialized.ownerSurfaceId, context)) return null
  if (!resourceAllowedForRestore(serialized.resourceKey, context)) return null

  return withSerializedState(
    createSearchPreviewSurface({
      ownerContextKey: serialized.ownerContextKey,
      ownerSurfaceId: serialized.ownerSurfaceId,
      resourceKey: serialized.resourceKey,
      title: serialized.title,
    }),
    serialized.serializedState,
  )
}

function restoreTerminalSurface(data: unknown, context: SurfaceRestoreContext) {
  const serialized = serializedSurfaceFor(data, 'terminal')
  if (!serialized) return null
  if (serialized.lifecycle !== 'running') return null
  if (!serialized.resourceKey) return null
  if (!hasWorkspaceRoot(context.rootPath)) return null

  return withSerializedState(
    createTerminalSurface({
      sessionId: serialized.resourceKey,
      title: serialized.title,
    }),
    serialized.serializedState,
  )
}

function restorePlaceholderSurface(data: unknown) {
  const serialized = serializedSurfaceFor(data, 'placeholder')
  if (!serialized) return null
  if (serialized.lifecycle !== 'placeholder') return null

  const contextKey = serialized.stateKey ?? serialized.resourceKey
  if (!contextKey) return null

  return withSerializedState(
    createPlaceholderSurface({
      contextKey,
      title: serialized.title ?? 'Placeholder',
    }),
    serialized.serializedState,
  )
}

function restoreWorkspaceSingletonSurface(
  data: unknown,
  context: SurfaceRestoreContext,
  type: SurfaceType,
  build: () => Surface,
) {
  const serialized = serializedSurfaceFor(data, type)
  if (!serialized) return null
  if (serialized.lifecycle !== 'durable') return null
  if (!hasWorkspaceRoot(context.rootPath)) return null

  return withSerializedState(build(), serialized.serializedState)
}

function serializeSurface(surface: Surface): SerializedSurface {
  return {
    lifecycle: surface.lifecycle,
    type: surface.type,
    version: SURFACE_SERIALIZED_VERSION,
    ...(surface.ownerContextKey ? { ownerContextKey: surface.ownerContextKey } : {}),
    ...(surface.ownerSurfaceId ? { ownerSurfaceId: surface.ownerSurfaceId } : {}),
    ...(surface.resourceKey ? { resourceKey: surface.resourceKey } : {}),
    ...(surface.serializedState === undefined ? {} : { serializedState: surface.serializedState }),
    ...(surface.stateKey ? { stateKey: surface.stateKey } : {}),
    ...(surface.title ? { title: surface.title } : {}),
  }
}

function serializeRestorableSurface(surface: Surface): SerializedSurface | null {
  if (surface.lifecycle === 'transient') return null

  return serializeSurface(surface)
}

function fileEditorClosePolicy(surface: Surface, context: SurfaceCloseContext): SurfaceClosePolicy {
  if (surface.type !== 'file-editor') return { type: 'close' }
  if (!surface.resourceKey) {
    return { reason: 'File editor surface is missing a path', type: 'block' }
  }
  if (!context.isDirtyFile?.(surface.resourceKey)) return { type: 'close' }

  return { path: surface.resourceKey, type: 'confirm-dirty-file' }
}

function terminalClosePolicy(surface: Surface): SurfaceClosePolicy {
  if (surface.type !== 'terminal') return { type: 'close' }
  if (!surface.resourceKey) {
    return { reason: 'Terminal surface is missing a session id', type: 'block' }
  }

  return { sessionId: surface.resourceKey, type: 'dispose-running-surface' }
}

function staticClosePolicy(surface: Surface): SurfaceClosePolicy {
  return surface.closePolicy
}

function registeredSurfaceCapabilities(registry: SurfaceRegistry, surface: Surface) {
  return registry.get(surface.type)?.capabilities(surface) ?? null
}

function withSerializedState(surface: Surface, serializedState: unknown) {
  if (serializedState === undefined) return surface

  return {
    ...surface,
    serializedState,
  }
}

function serializedSurfaceType(data: unknown) {
  if (!isSerializedSurface(data)) return null

  return data.type
}

function serializedSurfaceFor(data: unknown, type: SurfaceType): SerializedSurface | null {
  if (!isSerializedSurface(data)) return null
  if (data.type !== type) return null

  return data
}

function isSerializedSurface(value: unknown): value is SerializedSurface {
  if (!isRecord(value)) return false
  if (value.version !== SURFACE_SERIALIZED_VERSION) return false
  if (!isSurfaceType(value.type)) return false
  if (!isSurfaceLifecycle(value.lifecycle)) return false
  if (!optionalString(value.ownerContextKey)) return false
  if (!optionalString(value.ownerSurfaceId)) return false
  if (!optionalString(value.resourceKey)) return false
  if (!optionalString(value.stateKey)) return false
  if (!optionalString(value.title)) return false

  return true
}

function isSurfaceType(value: unknown): value is SurfaceType {
  return (
    value === 'chat' ||
    value === 'diagnostics' ||
    value === 'diff' ||
    value === 'file-editor' ||
    value === 'file-navigator' ||
    value === 'git-changes' ||
    value === 'logs' ||
    value === 'placeholder' ||
    value === 'search-preview' ||
    value === 'search-results' ||
    value === 'terminal'
  )
}

function isSurfaceLifecycle(value: unknown): value is SurfaceLifecycle {
  return (
    value === 'durable' || value === 'placeholder' || value === 'running' || value === 'transient'
  )
}

function isEditorSurfaceLifecycle(value: SurfaceLifecycle): value is EditorSurfaceLifecycle {
  return value === 'durable' || value === 'transient'
}

function pathAllowedForCreate(path: string, context: SurfaceCreateContext) {
  if (context.rootPath === undefined) return true

  return isPathInWorkspace(path, context.rootPath)
}

function resourceAllowedForCreate(resourceKey: string | undefined, context: SurfaceCreateContext) {
  if (context.rootPath === undefined) return true

  return resourceAllowedForRoot(resourceKey, context.rootPath)
}

function resourceAllowedForRestore(
  resourceKey: string | undefined,
  context: SurfaceRestoreContext,
) {
  return resourceAllowedForRoot(resourceKey, context.rootPath)
}

function resourceAllowedForRoot(resourceKey: string | undefined, rootPath: string | null) {
  if (!resourceKey) return true

  const path = pathFromWorkspaceResource(resourceKey)
  if (!path) return true

  return isPathInWorkspace(path, rootPath)
}

function pathFromWorkspaceResource(resourceKey: string) {
  const diff = parseDiffDocumentId(resourceKey)
  if (diff) return diff.path
  const searchBuffer = parseSearchBufferDocumentId(resourceKey)
  if (searchBuffer) return searchBuffer.rootPath
  if (resourceKey.startsWith('/')) return resourceKey

  return null
}

function editorResourceInWorkspace(resourceKey: string, rootPath: string | null) {
  if (parseSearchBufferDocumentId(resourceKey)) return false

  return isPathInWorkspace(resourceKey, rootPath)
}

function workspaceAllowedForCreate(context: SurfaceCreateContext) {
  return context.rootPath !== null
}

function hasWorkspaceRoot(rootPath: string | null) {
  return Boolean(rootPath)
}

function isPathInWorkspace(path: string, rootPath: string | null) {
  if (!rootPath) return false
  if (path === rootPath) return true

  return path.startsWith(`${rootPath}/`)
}

function hasKnownOwner(ownerSurfaceId: SurfaceId, context: SurfaceCreateContext) {
  return Boolean(context.surfacesById?.[ownerSurfaceId])
}

function optionalString(value: unknown) {
  return value === undefined || typeof value === 'string'
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
