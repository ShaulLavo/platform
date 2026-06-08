import { AppRuntimeContent } from '@/components/app-runtime-content'
import { DndProofView } from '@/features/dnd-proof/components/proof-view'

export function AppContent() {
  if (dndProofRoute()) return <DndProofView />

  return <AppRuntimeContent />
}

function dndProofRoute() {
  if (typeof window === 'undefined') return false

  return window.location.pathname === '/dnd-proof'
}
