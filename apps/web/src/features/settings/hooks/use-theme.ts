import { use } from 'react'

import { clientErrors } from '@/lib/structured-errors'

import { ThemeContext } from '@/features/settings/providers/theme-context'

export function useTheme() {
  const context = use(ThemeContext)
  if (context) return context

  throw clientErrors.CONTEXT_MISSING({
    message: 'useTheme must be used within AppearanceProvider',
  })
}
