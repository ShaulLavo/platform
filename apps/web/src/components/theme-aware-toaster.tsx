import { useTheme } from "@/components/theme-context"
import { Toaster } from "@workspace/ui/components/sonner"

export function ThemeAwareToaster() {
  const { resolvedTheme } = useTheme()

  return <Toaster theme={resolvedTheme} />
}
