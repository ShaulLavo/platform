import {
  commandIdSchema,
  type OrchestrationDispatchResult,
  type ProjectCreateCommand,
} from '@workspace/contracts'
import * as v from 'valibot'
import { createClientInvariantError } from '@/lib/structured-errors'

export function createProjectRegistrationCommand({
  workspaceRoot,
  title,
}: {
  workspaceRoot: string
  title: string
}): ProjectCreateCommand {
  return {
    commandId: v.parse(commandIdSchema, `command-${crypto.randomUUID()}`),
    defaultModelSelection: null,
    title,
    type: 'project.create',
    workspaceRoot,
  }
}

export function projectRegistrationResult(receipt: OrchestrationDispatchResult) {
  if (receipt.result) return receipt.result
  throw createClientInvariantError('Project registration did not return its checkout identity.')
}
