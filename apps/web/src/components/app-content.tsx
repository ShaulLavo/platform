import { AppRuntimeContent } from '@/components/app-runtime-content'
import { DndProofView } from '@/features/dnd-proof/components/proof-view'
import { ShellProofView } from '@/features/shell-proof/components/view'

export function AppContent() {
  if (shellProofRoute()) return <ShellProofView />
  if (dndProofRoute()) return <DndProofView />

  return <AppRuntimeContent />
}

function shellProofRoute() {
  if (typeof window === 'undefined') return false

  return window.location.pathname === '/shell-proof'
}

function dndProofRoute() {
  if (typeof window === 'undefined') return false

  return window.location.pathname === '/dnd-proof'
}
