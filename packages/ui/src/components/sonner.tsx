import type { CSSProperties } from 'react'
import { Toaster as Sonner, type ToasterProps } from 'sonner'

import { cn } from '@workspace/ui/lib/utils'

type ToastThemeStyle = CSSProperties & Record<`--${string}`, string>

const toastThemeStyle = {
  '--normal-bg': 'var(--popover)',
  '--normal-border': 'var(--border)',
  '--normal-border-hover': 'var(--border)',
  '--normal-bg-hover': 'var(--muted)',
  '--normal-text': 'var(--popover-foreground)',
  '--border-radius': 'var(--radius-md)',
} satisfies ToastThemeStyle

export function Toaster({
  className,
  closeButton = true,
  richColors = true,
  style,
  theme = 'system',
  toastOptions,
  ...props
}: ToasterProps) {
  const classNames = toastOptions?.classNames

  return (
    <Sonner
      closeButton={closeButton}
      className={cn('toaster group', className)}
      richColors={richColors}
      style={{ ...toastThemeStyle, ...style }}
      theme={theme}
      toastOptions={{
        ...toastOptions,
        classNames: {
          ...classNames,
          toast: cn('surface-vibrancy', classNames?.toast),
          error: cn('border-destructive/40', classNames?.error),
        },
      }}
      {...props}
    />
  )
}
