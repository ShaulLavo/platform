import { readSettingsMirror } from '@/features/settings/utils/boot-mirror'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import '@workspace/ui/globals.css'
import { HotkeysProvider } from '@tanstack/react-hotkeys'
import { ActiveEnvironmentApplication } from '@/components/active-environment-application'
import { App } from '@/App'
import { addressedWorkspaceCache } from '@/features/address/utils/cache'
import { parseAddress } from '@/features/address/utils/grammar'
import { readWorkspaceCache } from '@/features/workspace/state/cache'
import { getSelectedEditorThemeId } from '@/features/editor/state/color-theme-store'
import { FocusProvider } from '@/lib/focus/providers/provider'
import { CommandBusProvider } from '@/keymap/providers/bus-provider'
import { ApplicationRuntimeProvider } from '@/providers/application-runtime-provider'
import { createApplicationRuntime } from '@/state/application-runtime'
import { restoreAddressFromStorage } from '@/features/address/state/storage.ts'
import { LoggingErrorBoundary } from '@/components/logging-error-boundary.tsx'
import {
  bootAppearance,
  systemPrefersDark,
} from '@/features/settings/providers/appearance-provider.tsx'
import { applyAppearance } from '@/features/settings/utils/apply-appearance.ts'
import { initializeClientLogging, log } from '@/lib/client-logging.ts'
import { loadNerdFont } from '@/lib/default-nerd-font.ts'
import { isDesktop } from '@/lib/platform/bridge.ts'
import { applyBackdrop, resolveBackdrop } from '@/lib/platform/backdrop.ts'
import { installEditorPerformanceTraceFromUrl } from '@/features/editor/state/performance-trace.ts'
import { reportReactError } from '@/lib/react-error-reporting.ts'

installEditorPerformanceTraceFromUrl()
initializeClientLogging()
applyBackdrop(resolveBackdrop())
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
const application = createApplicationRuntime({
  workspaceCache: addressedWorkspaceCache(readWorkspaceCache(), parseAddress(window.location.href)),
  preparation: {
    appliedThemeContentHash: null,
    appliedThemeId: null,
    selectedThemeId: getSelectedEditorThemeId(systemPrefersDark() ? 'dark' : 'light'),
    syntaxHighlightingEnabled: readSettingsMirror()['editor.syntaxHighlighting.enabled'],
  },
})

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
      <ApplicationRuntimeProvider application={application}>
        <FocusProvider>
          <HotkeysProvider>
            <CommandBusProvider binding={application.commandBinding}>
              <ActiveEnvironmentApplication bootDensity={boot['workbench.density']}>
                <App />
              </ActiveEnvironmentApplication>
            </CommandBusProvider>
          </HotkeysProvider>
        </FocusProvider>
      </ApplicationRuntimeProvider>
    </LoggingErrorBoundary>
  </StrictMode>,
)
