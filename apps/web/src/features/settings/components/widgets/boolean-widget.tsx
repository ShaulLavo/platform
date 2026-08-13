import { Switch } from '@workspace/ui/components/switch'

export function BooleanWidget({
  checked,
  disabled,
  id,
  onChange,
}: {
  checked: boolean
  disabled?: boolean
  id: string
  onChange: (next: boolean) => void
}) {
  return <Switch checked={checked} disabled={disabled} id={id} onCheckedChange={onChange} />
}
