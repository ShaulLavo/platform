import {
  createEditorStore,
  EditorStateContext,
} from "@/components/editor/editor-state"
import { useState, type ReactNode } from "react"

export function EditorStateProvider({ children }: { children: ReactNode }) {
  const [store] = useState(createEditorStore)

  return (
    <EditorStateContext.Provider value={store}>
      {children}
    </EditorStateContext.Provider>
  )
}
