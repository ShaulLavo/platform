import { useQueryClient, type QueryClient } from '@tanstack/react-query'
import type { ReactNode } from 'react'

import { EditorStateProvider } from '@/features/editor/providers/state-provider'
import type { EditorRuntime } from '@/features/editor/state/runtime'
import { createTestEditorRuntime } from './editor-runtime'

const runtimes = new WeakMap<QueryClient, EditorRuntime>()

export function TestEditorStateProvider({ children }: { readonly children: ReactNode }) {
  const queryClient = useQueryClient()
  let runtime = runtimes.get(queryClient)
  if (!runtime) {
    runtime = createTestEditorRuntime(queryClient)
    runtimes.set(queryClient, runtime)
  }

  return <EditorStateProvider runtime={runtime}>{children}</EditorStateProvider>
}
