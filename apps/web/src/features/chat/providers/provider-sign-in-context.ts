import { createContext } from 'react'

import type { ProviderSignInTarget } from '@/features/chat/utils/provider-auth'

export type ProviderSignInDialogControl = {
  /** Opens the sign-in dialog for one provider. Re-opening switches providers. */
  readonly openSignIn: (target: ProviderSignInTarget) => void
}

export const ProviderSignInDialogContext = createContext<ProviderSignInDialogControl | null>(null)
