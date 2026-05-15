import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { QueryClientProvider } from "@tanstack/react-query"

import "@workspace/ui/globals.css"
import { App } from "./App.tsx"
import { ThemeProvider } from "@/components/theme-provider.tsx"
import { EditorColorThemeProvider } from "@/features/editor/hooks/use-editor-color-theme.ts"
import { queryClient } from "@/lib/query-client.ts"
import { Toaster } from "@workspace/ui/components/sonner"
import { TooltipProvider } from "@workspace/ui/components/tooltip"

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <EditorColorThemeProvider>
          <TooltipProvider delay={600}>
            <App />
            <Toaster />
          </TooltipProvider>
        </EditorColorThemeProvider>
      </ThemeProvider>
    </QueryClientProvider>
  </StrictMode>
)
