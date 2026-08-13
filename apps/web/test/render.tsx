import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, type RenderOptions, type RenderResult } from '@testing-library/react'
import { TooltipProvider } from '@workspace/ui/components/tooltip'
import type { ReactElement, ReactNode } from 'react'

import { ThemeProvider } from '@/components/theme-provider'
import { EditorColorThemeProvider } from '@/features/editor/hooks/use-editor-color-theme'
import { MenuCommandProvider } from '@/features/menus/providers/command-provider'

// Retry/gc off so failing queries surface immediately and no timers outlive a test.
export function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { gcTime: Number.POSITIVE_INFINITY, retry: false } },
  })
}

export type RenderWithProvidersOptions = Omit<RenderOptions, 'wrapper'> & {
  queryClient?: QueryClient
  theme?: 'dark' | 'light'
}

export type RenderWithProvidersResult = RenderResult & { queryClient: QueryClient }

// Mirrors the app's top-level provider stack (main.tsx) so components render the
// way they do in production. Exported for the browser tests, which mount through
// `createRoot` rather than Testing Library and would otherwise grow a second,
// drifting copy of this stack.
export function AppProviders({
  children,
  queryClient,
}: {
  readonly children: ReactNode
  readonly queryClient: QueryClient
}) {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <EditorColorThemeProvider>
          <MenuCommandProvider>
            <TooltipProvider delay={0}>{children}</TooltipProvider>
          </MenuCommandProvider>
        </EditorColorThemeProvider>
      </ThemeProvider>
    </QueryClientProvider>
  )
}

// Theme is a setting now, so there is no prop to pass. Seeding the boot mirror
// is the honest equivalent: it is exactly what the app reads before the first
// snapshot lands. Call it before mounting.
export function seedBootMirrorTheme(theme: 'dark' | 'light') {
  localStorage.setItem(
    'platform.settings-boot-mirror.v1',
    JSON.stringify({ 'workbench.colorTheme': theme }),
  )
}

// Returns the QueryClient for cache assertions.
export function renderWithProviders(
  ui: ReactElement,
  {
    queryClient = createTestQueryClient(),
    theme = 'dark',
    ...options
  }: RenderWithProvidersOptions = {},
): RenderWithProvidersResult {
  seedBootMirrorTheme(theme)

  function Wrapper({ children }: { children: ReactNode }) {
    return <AppProviders queryClient={queryClient}>{children}</AppProviders>
  }

  return { queryClient, ...render(ui, { wrapper: Wrapper, ...options }) }
}
