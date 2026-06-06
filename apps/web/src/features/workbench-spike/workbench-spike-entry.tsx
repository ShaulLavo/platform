import { createRoot } from 'react-dom/client'
import { QueryClientProvider } from '@tanstack/react-query'
import { TooltipProvider } from '@workspace/ui/components/tooltip'

import '@workspace/ui/globals.css'
import 'dockview-react/dist/styles/dockview.css'
import './workbench-spike.css'

import { ThemeProvider } from '@/components/theme-provider'
import { FocusProvider } from '@/components/workspace/focus/providers/focus-provider'
import { EditorColorThemeProvider } from '@/features/editor/hooks/use-editor-color-theme'
import { WorkbenchSpikeApp } from '@/features/workbench-spike/workbench-spike-app'
import { queryClient } from '@/lib/query-client'

createRoot(document.getElementById('root')!).render(
  <QueryClientProvider client={queryClient}>
    <ThemeProvider>
      <EditorColorThemeProvider>
        <FocusProvider>
          <TooltipProvider delay={600}>
            <WorkbenchSpikeApp />
          </TooltipProvider>
        </FocusProvider>
      </EditorColorThemeProvider>
    </ThemeProvider>
  </QueryClientProvider>,
)
