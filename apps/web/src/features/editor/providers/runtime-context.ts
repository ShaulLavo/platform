import { createContext } from 'react'

import type { EditorRuntime } from '@/features/editor/state/runtime'

export const EditorRuntimeContext = createContext<EditorRuntime | null>(null)
