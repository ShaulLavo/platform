import {
  AsteriskIcon,
  FunnelSimpleIcon,
  TextAaIcon,
  TextTIcon,
} from "@phosphor-icons/react"
import type { ChangeEvent, ReactNode } from "react"

import type {
  SearchBufferOptionPatch,
} from "@/features/search/search-buffer-state"
import type { WorkspaceSearchQueryOptions } from "@/features/search/use-search-buffer"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@workspace/ui/components/tooltip"
import { cn } from "@workspace/ui/lib/utils"

export function SearchModeButtons({
  className,
  options,
  onOptionsChange,
}: {
  className?: string
  options: WorkspaceSearchQueryOptions
  onOptionsChange: (options: SearchBufferOptionPatch) => void
}) {
  return (
    <div className={cn("flex items-center gap-0.5", className)}>
      <SearchToggleButton
        active={options.caseSensitive}
        label="Match case"
        onClick={() =>
          onOptionsChange({ caseSensitive: !options.caseSensitive })
        }
      >
        <TextAaIcon className="size-3.5" />
      </SearchToggleButton>
      <SearchToggleButton
        active={options.wholeWord}
        label="Match whole word"
        onClick={() => onOptionsChange({ wholeWord: !options.wholeWord })}
      >
        <TextTIcon className="size-3.5" />
      </SearchToggleButton>
      <SearchToggleButton
        active={options.matchMode === "regex"}
        label="Use regular expression"
        onClick={() =>
          onOptionsChange({
            matchMode: options.matchMode === "regex" ? "literal" : "regex",
          })
        }
      >
        <AsteriskIcon className="size-3.5" />
      </SearchToggleButton>
      <SearchToggleButton
        active={options.filtersVisible}
        label="Include and exclude files"
        onClick={() =>
          onOptionsChange({ filtersVisible: !options.filtersVisible })
        }
      >
        <FunnelSimpleIcon className="size-3.5" />
      </SearchToggleButton>
    </div>
  )
}

export function SearchFilterFields({
  options,
  onOptionsChange,
}: {
  options: WorkspaceSearchQueryOptions
  onOptionsChange: (options: SearchBufferOptionPatch) => void
}) {
  if (!options.filtersVisible) return null

  function handleIncludeChange(event: ChangeEvent<HTMLInputElement>) {
    onOptionsChange({ includeGlobText: event.target.value })
  }

  function handleExcludeChange(event: ChangeEvent<HTMLInputElement>) {
    onOptionsChange({ excludeGlobText: event.target.value })
  }

  return (
    <div className="mt-2 grid grid-cols-2 gap-1.5">
      <Input
        aria-label="Files to include"
        autoCapitalize="off"
        autoCorrect="off"
        className="h-7 text-[11px]"
        placeholder="include"
        spellCheck={false}
        value={options.includeGlobText}
        onChange={handleIncludeChange}
      />
      <Input
        aria-label="Files to exclude"
        autoCapitalize="off"
        autoCorrect="off"
        className="h-7 text-[11px]"
        placeholder="exclude"
        spellCheck={false}
        value={options.excludeGlobText}
        onChange={handleExcludeChange}
      />
    </div>
  )
}

function SearchToggleButton({
  active,
  children,
  label,
  onClick,
}: {
  active: boolean
  children: ReactNode
  label: string
  onClick: () => void
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            aria-label={label}
            aria-pressed={active}
            className={cn(
              "size-6 text-muted-foreground hover:text-foreground aria-pressed:bg-muted aria-pressed:text-foreground"
            )}
            size="icon-xs"
            title={label}
            type="button"
            variant="ghost"
            onClick={onClick}
          >
            {children}
          </Button>
        }
      />
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}
