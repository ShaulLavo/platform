'use client'

import { MagnifyingGlassIcon } from '@phosphor-icons/react'
import { Command as CommandPrimitive } from 'cmdk'
import type { ComponentProps, ReactNode } from 'react'

import { cn } from '@workspace/ui/lib/utils'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@workspace/ui/components/dialog'

type CommandDialogProps = Omit<ComponentProps<typeof Dialog>, 'children'> & {
  children?: ReactNode
  commandClassName?: string
  commandProps?: ComponentProps<typeof CommandPrimitive>
  contentClassName?: string
}

function Command({ className, ...props }: ComponentProps<typeof CommandPrimitive>) {
  return (
    <CommandPrimitive
      data-slot='command'
      className={cn(
        'flex h-full w-full flex-col overflow-hidden rounded-md bg-popover text-popover-foreground',
        className,
      )}
      {...props}
    />
  )
}

function CommandDialog({
  children,
  commandClassName,
  commandProps,
  contentClassName,
  ...props
}: CommandDialogProps) {
  return (
    <Dialog {...props}>
      <DialogContent
        showCloseButton={false}
        className={cn(
          'top-[18vh] max-w-[min(44rem,calc(100%-2rem))] translate-y-0 gap-0 overflow-hidden rounded-md border border-border bg-popover p-0 shadow-2xl sm:max-w-2xl',
          contentClassName,
        )}
      >
        <DialogTitle className='sr-only'>Command Palette</DialogTitle>
        <DialogDescription className='sr-only'>
          Search commands and choose one to run.
        </DialogDescription>
        <Command {...commandProps} className={cn(commandClassName, commandProps?.className)}>
          {children}
        </Command>
      </DialogContent>
    </Dialog>
  )
}

function CommandInput({ className, ...props }: ComponentProps<typeof CommandPrimitive.Input>) {
  return (
    <div data-slot='command-input-wrapper' className='flex h-12 items-center gap-2 border-b px-3'>
      <MagnifyingGlassIcon className='text-muted-foreground size-4 shrink-0' />
      <CommandPrimitive.Input
        data-slot='command-input'
        className={cn(
          'h-11 w-full min-w-0 bg-transparent text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50',
          className,
        )}
        {...props}
      />
    </div>
  )
}

function CommandList({ className, ...props }: ComponentProps<typeof CommandPrimitive.List>) {
  return (
    <CommandPrimitive.List
      data-slot='command-list'
      className={cn(
        'max-h-[min(30rem,calc(100vh-12rem))] scroll-py-1 overflow-x-hidden overflow-y-auto px-1 py-1',
        className,
      )}
      {...props}
    />
  )
}

function CommandEmpty({ className, ...props }: ComponentProps<typeof CommandPrimitive.Empty>) {
  return (
    <CommandPrimitive.Empty
      data-slot='command-empty'
      className={cn('py-7 text-center text-xs text-muted-foreground', className)}
      {...props}
    />
  )
}

function CommandGroup({ className, ...props }: ComponentProps<typeof CommandPrimitive.Group>) {
  return (
    <CommandPrimitive.Group
      data-slot='command-group'
      className={cn(
        'overflow-hidden p-1 text-foreground [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground',
        className,
      )}
      {...props}
    />
  )
}

function CommandSeparator({
  className,
  ...props
}: ComponentProps<typeof CommandPrimitive.Separator>) {
  return (
    <CommandPrimitive.Separator
      data-slot='command-separator'
      className={cn('-mx-1 my-1 h-px bg-border', className)}
      {...props}
    />
  )
}

function CommandItem({ className, ...props }: ComponentProps<typeof CommandPrimitive.Item>) {
  return (
    <CommandPrimitive.Item
      data-slot='command-item'
      className={cn(
        "relative flex min-h-10 cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-xs outline-none select-none data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-45 data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground [&_svg]:size-4 [&_svg]:shrink-0 [&_svg:not([class*='text-'])]:text-muted-foreground",
        className,
      )}
      {...props}
    />
  )
}

function CommandShortcut({ className, ...props }: ComponentProps<'span'>) {
  return (
    <span
      data-slot='command-shortcut'
      className={cn(
        'ml-auto shrink-0 rounded-sm border border-border bg-muted/50 px-1.5 py-0.5 font-mono text-[10px] leading-none tracking-normal text-muted-foreground',
        className,
      )}
      {...props}
    />
  )
}

export {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
}
