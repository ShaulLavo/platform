import { createContext } from 'react'
import type { ApplicationRuntime } from '@/state/application-runtime'

export const ApplicationRuntimeContext = createContext<ApplicationRuntime | null>(null)
