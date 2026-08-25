import { createContext } from 'react'

import type { FocusService } from '@/lib/focus/state/service'

export const FocusServiceContext = createContext<FocusService | null>(null)
