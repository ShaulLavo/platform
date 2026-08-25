import { useTheme } from '@/features/settings/hooks/use-theme'
import { Toaster } from '@workspace/ui/components/sonner'

export function ThemeAwareToaster() {
  const { resolvedTheme } = useTheme()

  return <Toaster theme={resolvedTheme} />
}
