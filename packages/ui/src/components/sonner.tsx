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
  // richColors switches sonner to --{status}-bg/-border/-text. Left unset it
  // ships stock shadcn red/green, which bypasses the tuned oklch ramp on the
  // app's loudest status surface. Each status is the popover material with a
  // thin tint of its token mixed in, so a status toast keeps the same material
  // family as a normal one and only the hue changes.
  //
  // The mixes below are oklab, never oklch. The oklch space interpolates the
  // hue channel, and every surface token here sits at hue 70. Mixing 12% of
  // --info (hue 230) into it there rotates the result to hue ~89 and yields
  // yellow-green, not pale blue. Oklab has no hue channel, so a small mix just
  // tints toward the status color the way the eye expects.
  '--error-bg': 'color-mix(in oklab, var(--destructive) 12%, var(--popover))',
  '--error-border': 'color-mix(in oklab, var(--destructive) 45%, transparent)',
  '--error-text': 'color-mix(in oklab, var(--destructive) 70%, var(--popover-foreground))',
  '--success-bg': 'color-mix(in oklab, var(--success) 12%, var(--popover))',
  '--success-border': 'color-mix(in oklab, var(--success) 45%, transparent)',
  '--success-text': 'color-mix(in oklab, var(--success) 70%, var(--popover-foreground))',
  '--warning-bg': 'color-mix(in oklab, var(--warning) 12%, var(--popover))',
  '--warning-border': 'color-mix(in oklab, var(--warning) 45%, transparent)',
  '--warning-text': 'color-mix(in oklab, var(--warning) 70%, var(--popover-foreground))',
  '--info-bg': 'color-mix(in oklab, var(--info) 12%, var(--popover))',
  '--info-border': 'color-mix(in oklab, var(--info) 45%, transparent)',
  '--info-text': 'color-mix(in oklab, var(--info) 70%, var(--popover-foreground))',
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
        },
      }}
      {...props}
    />
  )
}
