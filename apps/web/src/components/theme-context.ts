import { createContext, use } from 'react'
import { clientErrors } from '@/lib/structured-errors'

export type Theme = 'dark' | 'light' | 'system'
export type ResolvedTheme = 'dark' | 'light'

type ThemeProviderState = {
  resolvedTheme: ResolvedTheme
  theme: Theme
  setTheme: (theme: Theme) => void
}

export const ThemeProviderContext = createContext<ThemeProviderState | undefined>(undefined)

export function useTheme() {
  const context = use(ThemeProviderContext)

  if (context === undefined) {
    throw clientErrors.CONTEXT_MISSING({
      message: 'useTheme must be used within a ThemeProvider',
    })
  }

  return context
}
