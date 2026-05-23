import { Button } from "@workspace/ui/components/button"
import { cn } from "@workspace/ui/lib/utils"
import type { ReactNode } from "react"

export function WorkspaceActivityButton({
  active,
  icon,
  label,
  onClick,
}: {
  active: boolean
  icon: ReactNode
  label: string
  onClick: () => void
}) {
  return (
    <Button
      aria-label={label}
      aria-pressed={active}
      className={cn(
        "h-10 w-full rounded-md px-0 text-muted-foreground hover:bg-muted/50",
        active &&
          "bg-accent text-accent-foreground hover:bg-accent hover:text-accent-foreground"
      )}
      size="icon-lg"
      title={label}
      type="button"
      variant="ghost"
      onClick={onClick}
    >
      {icon}
      <span className="sr-only">{label}</span>
    </Button>
  )
}
