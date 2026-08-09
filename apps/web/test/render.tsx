import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, type RenderOptions, type RenderResult } from '@testing-library/react'
import { TooltipProvider } from '@workspace/ui/components/tooltip'
import type { ReactElement, ReactNode } from 'react'

import { ThemeProvider } from '@/components/theme-provider'
import { EditorColorThemeProvider } from '@/features/editor/hooks/use-editor-color-theme'
import { MenuCommandProvider } from '@/features/menus/providers/command-provider'

// Retry/gc off so failing queries surface immediately and no timers outlive a test.
function createTestQueryClient() {
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
// way they do in production. Returns the QueryClient for cache assertions.
export function renderWithProviders(
  ui: ReactElement,
  {
    queryClient = createTestQueryClient(),
    theme = 'dark',
    ...options
  }: RenderWithProvidersOptions = {},
): RenderWithProvidersResult {
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <ThemeProvider defaultTheme={theme} storageKey='platform-test-theme'>
          <EditorColorThemeProvider>
            <MenuCommandProvider>
              <TooltipProvider delay={0}>{children}</TooltipProvider>
            </MenuCommandProvider>
          </EditorColorThemeProvider>
        </ThemeProvider>
      </QueryClientProvider>
    )
  }

  return { queryClient, ...render(ui, { wrapper: Wrapper, ...options }) }
}
