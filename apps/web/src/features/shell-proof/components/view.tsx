import { ShellProofSession } from '@/features/shell-proof/components/session'
import { shellProofSeedKey } from '@/features/shell-proof/utils/seed'

export function ShellProofView() {
  const search = pageSearch()

  return <ShellProofSession key={shellProofSeedKey(search)} search={search} />
}

function pageSearch() {
  if (typeof window === 'undefined') return ''

  return window.location.search
}
