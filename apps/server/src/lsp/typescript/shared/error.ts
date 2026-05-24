import { isRecord } from '@workspace/contracts'
import type * as lsp from 'vscode-languageserver-protocol'

export const JSON_RPC_INTERNAL_ERROR = -32603

export type JsonRpcError = {
  code: number
  message: string
  data?: unknown
}

export function isJsonRpcError(error: unknown): error is JsonRpcError {
  if (!isRecord(error)) return false
  return typeof error.code === 'number' && typeof error.message === 'string'
}

export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  if (typeof error === 'string') return error
  return 'TypeScript LSP operation failed'
}

export function toResponseError(error: unknown): JsonRpcError {
  if (isJsonRpcError(error)) return error
  return { code: JSON_RPC_INTERNAL_ERROR, message: errorMessage(error) }
}

export function respondWithError(
  post: (id: lsp.RequestMessage['id'] | null, error: JsonRpcError) => void,
  id: lsp.RequestMessage['id'] | null,
  error: unknown,
): void {
  post(id, toResponseError(error))
}
