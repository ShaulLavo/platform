import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClientProvider } from '@tanstack/react-query'

import '@workspace/ui/globals.css'
import { App } from '@/App'
import { restoreAddressFromStorage } from '@/features/address/state/storage.ts'
import { LoggingErrorBoundary } from '@/components/logging-error-boundary.tsx'
import { ThemeAwareToaster } from '@/components/theme-aware-toaster.tsx'
import {
  AppearanceProvider,
  bootAppearance,
  systemPrefersDark,
} from '@/features/settings/providers/appearance-provider.tsx'
import { applyAppearance } from '@/features/settings/utils/apply-appearance.ts'
import { EditorColorThemeProvider } from '@/features/editor/hooks/use-editor-color-theme.ts'
import { installServerRestartInvalidation } from '@/features/chat/state/server-restart-invalidation.ts'
import { initializeClientLogging, log } from '@/lib/client-logging.ts'
import { loadNerdFont } from '@/lib/default-nerd-font.ts'
import { hasNativeVibrancyShell, isDesktop } from '@/lib/platform/bridge.ts'
import { applyNativeVibrancy } from '@/lib/platform/native-vibrancy.ts'
import { installEditorPerformanceTraceFromUrl } from '@/features/editor/state/performance-trace.ts'
import { queryClient } from '@/lib/query-client.ts'
import { reportReactError } from '@/lib/react-error-reporting.ts'
import { TooltipProvider } from '@workspace/ui/components/tooltip'

installEditorPerformanceTraceFromUrl()
initializeClientLogging()
installServerRestartInvalidation(queryClient)
applyNativeVibrancy(hasNativeVibrancyShell())
// Before `createRoot`, deliberately. The mirrored appearance is initial
// document state: descendants construct geometry and read computed styles on
// their first render. `AppearanceProvider` corrects it from the server snapshot
// in React's insertion phase before later layout effects run.
const boot = bootAppearance()
applyAppearance(boot, document.documentElement, systemPrefersDark())
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
// The mirrored family, not the shipped default: `loadNerdFont` writes
// `--font-mono` both before and after its fetch, so loading JetBrainsMono here
// would overwrite the family `applyAppearance` just set — once immediately, and
// again whenever the download resolved, which could land after
// `AppearanceProvider` had already corrected it.
void loadNerdFont(boot['editor.fontFamily'])

// Before `createRoot`, deliberately: `EditorStateProvider` seeds its stores from the
// address during its first render, so the stored address has to be in the URL by then.
// A desktop launch always arrives at `/`, which is exactly the case this covers.
restoreAddressFromStorage()

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
        <AppearanceProvider bootDensity={boot['workbench.density']}>
          <EditorColorThemeProvider>
            <TooltipProvider delay={600}>
              {/* `ThemeAwareToaster` stays a sibling of the app so an in-flight toast
                  keeps its identity across an address change. */}
              <App />
              <ThemeAwareToaster />
            </TooltipProvider>
          </EditorColorThemeProvider>
        </AppearanceProvider>
      </QueryClientProvider>
    </LoggingErrorBoundary>
  </StrictMode>,
)
