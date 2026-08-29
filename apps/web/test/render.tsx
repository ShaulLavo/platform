import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  render,
  renderHook,
  type RenderHookOptions,
  type RenderOptions,
  type RenderResult,
} from '@testing-library/react'
import { TooltipProvider } from '@workspace/ui/components/tooltip'
import type { ReactElement, ReactNode } from 'react'

import { EditorColorThemeProvider } from '@/features/editor/hooks/use-editor-color-theme'
import { AppearanceProvider } from '@/features/settings/providers/appearance-provider'
import { readSettingsMirror } from '@/features/settings/utils/boot-mirror'
import { FocusProvider } from '@/lib/focus/providers/provider'
import type { FocusService } from '@/lib/focus/state/service'
import { TestCommandProvider, type TestCommandRuntimeOptions } from './factories/command-runtime'
import { LanguageServerMatchProvider } from '@/features/editor/providers/language-server-match-provider'

// Retry/gc off so failing queries surface immediately and no timers outlive a test.
export function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { gcTime: Number.POSITIVE_INFINITY, retry: false } },
  })
}

export type RenderWithProvidersOptions = Omit<RenderOptions, 'wrapper'> & {
  command?: TestCommandRuntimeOptions | false
  focusService?: FocusService
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
  command,
  focusService,
  queryClient,
}: {
  readonly children: ReactNode
  readonly command?: TestCommandRuntimeOptions | false
  readonly focusService?: FocusService
  readonly queryClient: QueryClient
}) {
  const content = <TooltipProvider delay={0}>{children}</TooltipProvider>

  return (
    <QueryClientProvider client={queryClient}>
      <LanguageServerMatchProvider>
        <FocusProvider service={focusService}>
          <AppearanceProvider bootDensity={readSettingsMirror()['workbench.density']}>
            <EditorColorThemeProvider>
              {command === false ? (
                content
              ) : (
                <TestCommandProvider options={command} queryClient={queryClient}>
                  {content}
                </TestCommandProvider>
              )}
            </EditorColorThemeProvider>
          </AppearanceProvider>
        </FocusProvider>
      </LanguageServerMatchProvider>
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
  seedPrefersColorScheme(theme)
}

// The boot mirror only rules until the real settings snapshot lands, and the
// shipped default for `workbench.colorTheme` is `system` - so the media query
// decides from then on. happy-dom reports light unless the device is told
// otherwise, which would flip the theme mid-test and re-run everything keyed on
// it. No-op in the browser project, where the Playwright context sets the scheme.
function seedPrefersColorScheme(theme: 'dark' | 'light') {
  const happyDom = (window as Window & { happyDOM?: HappyDomDeviceApi }).happyDOM
  if (!happyDom) return

  happyDom.settings.device.prefersColorScheme = theme
}

type HappyDomDeviceApi = { settings: { device: { prefersColorScheme: string } } }

// Returns the QueryClient for cache assertions.
export function renderWithProviders(
  ui: ReactElement,
  {
    command,
    focusService,
    queryClient = createTestQueryClient(),
    theme = 'dark',
    ...options
  }: RenderWithProvidersOptions = {},
): RenderWithProvidersResult {
  seedBootMirrorTheme(theme)

  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <AppProviders command={command} focusService={focusService} queryClient={queryClient}>
        {children}
      </AppProviders>
    )
  }

  return { queryClient, ...render(ui, { wrapper: Wrapper, ...options }) }
}

export function renderHookWithProviders<Result, Props>(
  callback: (props: Props) => Result,
  {
    command,
    focusService,
    queryClient = createTestQueryClient(),
    theme = 'dark',
    ...options
  }: Omit<RenderHookOptions<Props>, 'wrapper'> & RenderWithProvidersOptions = {},
) {
  seedBootMirrorTheme(theme)

  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <AppProviders command={command} focusService={focusService} queryClient={queryClient}>
        {children}
      </AppProviders>
    )
  }

  return { queryClient, ...renderHook(callback, { wrapper: Wrapper, ...options }) }
}
