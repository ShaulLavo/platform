import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClientProvider } from '@tanstack/react-query'

import '@workspace/ui/globals.css'
import { App } from './App.tsx'
import { LoggingErrorBoundary } from '@/components/logging-error-boundary.tsx'
import { ThemeAwareToaster } from '@/components/theme-aware-toaster.tsx'
import { ThemeProvider } from '@/components/theme-provider.tsx'
import {
  AppearanceProvider,
  bootAppearance,
  systemPrefersDark,
} from '@/features/settings/providers/appearance-provider.tsx'
import { applyAppearance } from '@/features/settings/utils/apply-appearance.ts'
import { EditorColorThemeProvider } from '@/features/editor/hooks/use-editor-color-theme.ts'
import { installServerRestartInvalidation } from '@/features/chat/state/server-restart-invalidation.ts'
import { initializeClientLogging, log } from '@/lib/client-logging.ts'
import { loadDefaultNerdFont } from '@/lib/default-nerd-font.ts'
import { isDesktop } from '@/lib/platform/bridge.ts'
import { applyNativeVibrancy } from '@/lib/platform/native-vibrancy.ts'
import { installEditorPerformanceTraceFromUrl } from '@/lib/editor-performance-trace.ts'
import { queryClient } from '@/lib/query-client.ts'
import { reportReactError } from '@/lib/react-error-reporting.ts'
import { TooltipProvider } from '@workspace/ui/components/tooltip'

installEditorPerformanceTraceFromUrl()
initializeClientLogging()
installServerRestartInvalidation(queryClient)
applyNativeVibrancy(isDesktop())
// Before `createRoot`, deliberately. React runs child effects before parent
// effects, so an effect near the root would land after descendants that read
// computed styles — the terminal snapshots CSS variables when it is built. The
// React pass in `AppearanceProvider` is the correction, not the primary path.
applyAppearance(bootAppearance(), document.documentElement, systemPrefersDark())
const visualViewport = window.visualViewport
log.info({
  action: 'app.bootstrap',
  availHeight: window.screen.availHeight,
  availWidth: window.screen.availWidth,
  area: 'app',
  mode: import.meta.env.MODE,
  desktop: isDesktop(),
  devicePixelRatio: window.devicePixelRatio,
  innerHeight: window.innerHeight,
  screenWidth: window.screen.width,
  screenHeight: window.screen.height,
  innerWidth: window.innerWidth,
  visualViewportHeight: visualViewport?.height ?? null,
  visualViewportWidth: visualViewport?.width ?? null,
})
// The chosen font is loaded by `AppearanceProvider` once settings resolve. This
// is the pre-settings default, so the first paint is not in a fallback face.
void loadDefaultNerdFont()

createRoot(document.getElementById('root')!, {
  onCaughtError: (error, errorInfo) => {
    reportReactError({ error, errorInfo, kind: 'caught' })
  },
  onRecoverableError: (error, errorInfo) => {
    reportReactError({ error, errorInfo, kind: 'recoverable' })
  },
  onUncaughtError: (error, errorInfo) => {
    reportReactError({ error, errorInfo, kind: 'uncaught' })
  },
}).render(
  <StrictMode>
    <LoggingErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <AppearanceProvider>
          <ThemeProvider>
            <EditorColorThemeProvider>
              <TooltipProvider delay={600}>
                <App />
                <ThemeAwareToaster />
              </TooltipProvider>
            </EditorColorThemeProvider>
          </ThemeProvider>
        </AppearanceProvider>
      </QueryClientProvider>
    </LoggingErrorBoundary>
  </StrictMode>,
)
