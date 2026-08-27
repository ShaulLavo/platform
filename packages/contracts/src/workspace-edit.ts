export type WorkspaceResourcePrecondition =
  | { readonly kind: 'missing' }
  | {
      readonly kind: 'snapshot'
      readonly mtimeMs: number
      readonly version: string
    }
  | {
      readonly afterOperation: number
      readonly kind: 'transaction'
    }

export type WorkspacePersistenceOperation =
  | {
      readonly expected: Exclude<WorkspaceResourcePrecondition, { kind: 'missing' }>
      readonly index: number
      readonly kind: 'write'
      readonly path: string
      readonly text: string
    }
  | {
      readonly destination: WorkspaceResourcePrecondition
      readonly ignoreIfExists: boolean
      readonly index: number
      readonly kind: 'create'
      readonly overwrite: boolean
      readonly path: string
    }
  | {
      readonly destination: WorkspaceResourcePrecondition
      readonly ignoreIfExists: boolean
      readonly index: number
      readonly kind: 'rename'
      readonly newPath: string
      readonly oldPath: string
      readonly overwrite: boolean
      readonly source: Exclude<WorkspaceResourcePrecondition, { kind: 'missing' }>
    }
  | {
      readonly expected: WorkspaceResourcePrecondition
      readonly ignoreIfNotExists: boolean
      readonly index: number
      readonly kind: 'delete'
      readonly path: string
      readonly recursive: boolean
    }

export type WorkspaceEditState =
  | 'preparing'
  | 'prepared'
  | 'committed'
  | 'finalized'
  | 'aborted'
  | 'rolled-back'
  | 'undo-committed'
  | 'undone'
  | 'redo-committed'
  | 'redone'
  | 'partial'
  | 'released'

export type WorkspaceEditRecoveryTarget = 'rolled-back' | 'finalized' | 'undone' | 'redone'

export type WorkspaceEditEventPublication = 'pending' | 'published' | 'suppressed'

export type WorkspaceEditResultEntry =
  | {
      readonly exists: false
      readonly path: string
    }
  | {
      readonly exists: true
      readonly mtimeMs: number
      readonly path: string
      readonly size: number
      readonly type: 'file'
      readonly version: string
    }

export type WorkspaceEditPrepareRequest = {
  readonly bodyDigest: string
  readonly operationId: string
  readonly operations: readonly WorkspacePersistenceOperation[]
  readonly origin: 'workspace-edit'
  readonly workspace: string
}

export type WorkspaceEditTransitionRequest = {
  readonly expectedGeneration: number
  readonly operationId: string
  readonly transitionId: string
}

export type WorkspaceEditRecoverRequest = WorkspaceEditTransitionRequest & {
  readonly recoveryTarget: WorkspaceEditRecoveryTarget
}

export type WorkspaceEditPartialAcknowledgement = {
  readonly generation: number
  readonly unrecoveredPaths: readonly string[]
}

export type WorkspaceEditReleaseRequest = WorkspaceEditTransitionRequest & {
  readonly acknowledgePartial?: WorkspaceEditPartialAcknowledgement
}

export type WorkspaceEditResult = {
  readonly affectedPaths: readonly string[]
  readonly entries: readonly WorkspaceEditResultEntry[]
  readonly eventPublication: WorkspaceEditEventPublication
  readonly generation: number
  readonly operationId: string
  readonly recoveryTarget?: WorkspaceEditRecoveryTarget
  readonly rolledBackPaths: readonly string[]
  readonly serverEpoch: string
  readonly state: WorkspaceEditState
  readonly unrecoveredPaths: readonly string[]
}

export type WorkspaceEditStatusResult =
  | {
      readonly found: false
      readonly operationId: string
      readonly serverEpoch: string
    }
  | {
      readonly found: true
      readonly result: WorkspaceEditResult
    }

export type WorkspaceEditRecoverySummary = {
  readonly generation: number
  readonly operationId: string
  readonly recoveryTarget: WorkspaceEditRecoveryTarget
  readonly unrecoveredPaths: readonly string[]
  readonly workspace: string
}

export type WorkspaceEditRecoveryListResult = {
  readonly operations: readonly WorkspaceEditRecoverySummary[]
  readonly serverEpoch: string
}
