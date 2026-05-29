import { createContext } from 'react'

import type { EditorPaneDropContextValue } from '@/components/workspace/file-viewer-types'

export const EditorPaneDropContext = createContext<EditorPaneDropContextValue | null>(null)
