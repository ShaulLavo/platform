import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClientProvider } from '@tanstack/react-query'

import '@workspace/ui/globals.css'
import { App } from './App.tsx'
import { LoggingErrorBoundary } from '@/components/logging-error-boundary.tsx'
import { ThemeAwareToaster } from '@/components/theme-aware-toaster.tsx'
import { ThemeProvider } from '@/components/theme-provider.tsx'
import { EditorColorThemeProvider } from '@/features/editor/hooks/use-editor-color-theme.ts'
import { initializeClientLogging, log } from '@/lib/client-logging.ts'
import { loadDefaultNerdFont } from '@/lib/default-nerd-font.ts'
import { installEditorPerformanceTraceFromUrl } from '@/lib/editor-performance-trace.ts'
import { queryClient } from '@/lib/query-client.ts'
import { reportReactError } from '@/lib/react-error-reporting.ts'
import { TooltipProvider } from '@workspace/ui/components/tooltip'

installEditorPerformanceTraceFromUrl()
initializeClientLogging()
log.info({
  action: 'app.bootstrap',
  area: 'app',
  mode: import.meta.env.MODE,
})
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
        <ThemeProvider>
          <EditorColorThemeProvider>
            <TooltipProvider delay={600}>
              <App />
              <ThemeAwareToaster />
            </TooltipProvider>
          </EditorColorThemeProvider>
        </ThemeProvider>
      </QueryClientProvider>
    </LoggingErrorBoundary>
  </StrictMode>,
)
