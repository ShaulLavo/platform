import { descriptorFor, type SettingId, type SettingsSnapshot } from '@workspace/contracts'

import { useSettingsActions } from '../hooks/use-settings-actions'
import { settingInspection } from '../hooks/use-setting-inspection'
import { useSettingsScope } from '../state/scope-store'
import { humanizeSettingId } from '../utils/humanize'
import { ModelSection } from './model-section'
import { ProviderSection } from './provider-section'
import { RowActions } from './row-actions'
import { BooleanWidget } from './widgets/boolean-widget'
import { EnumWidget } from './widgets/enum-widget'
import { FontWidget } from './widgets/font-widget'
import { NumberWidget } from './widgets/number-widget'
import { RecordWidget } from './widgets/record-widget'
import { StringWidget } from './widgets/string-widget'

export function SettingRow({ id, snapshot }: { id: SettingId; snapshot: SettingsSnapshot }) {
  const descriptor = descriptorFor(id)
  const scope = useSettingsScope()
  const { setSetting } = useSettingsActions()
  const inspection = settingInspection(id, snapshot, scope)
  const { alsoModifiedIn, isModified, overriddenBy } = inspection
  // A read-only key is shown, not hidden: the answer to "why is this off" belongs
  // on the page rather than in a commit message. It outranks the scope reason —
  // no scope makes a read-only key writable.
  const disabledReason = descriptor.readOnlyReason ?? inspection.disabledReason
  const value = snapshot.values[id]

  return (
    <div className='border-border flex flex-col gap-2 border-b py-3 last:border-b-0 sm:flex-row sm:items-start sm:justify-between sm:gap-6'>
      <div className='flex min-w-0 flex-col gap-1'>
        <div className='flex flex-wrap items-center gap-2'>
          {/* A border, not a coloured dot: it reads in both themes without a
              palette literal, which the theme tokens would otherwise forbid. */}
          {isModified ? (
            <span
              aria-label='Modified'
              className='bg-info h-3 w-0.5 shrink-0 rounded-full'
              title='Modified from the default'
            />
          ) : null}
          <label className='text-foreground text-sm font-medium' htmlFor={id}>
            {humanizeSettingId(id)}
          </label>
          <code className='text-muted-foreground text-xs'>{id}</code>
          {descriptor.requiresRestart ? (
            <span className='border-warning/30 bg-warning/10 text-warning rounded border px-1 text-[10px]'>
              Restart required
            </span>
          ) : null}
        </div>
        <p className='text-muted-foreground text-xs'>{descriptor.description}</p>
        {alsoModifiedIn.length > 0 ? (
          // Without this a value set in another layer looks like the row is
          // simply wrong: the control shows the resolved value and nothing says
          // where it came from.
          <p className='text-info text-xs'>Also modified in {alsoModifiedIn.join(', ')} settings</p>
        ) : null}
        {overriddenBy ? (
          // Stronger than "also modified": this scope loses. Editing here writes
          // the file and the app keeps using the other layer's value, which
          // without a word on screen just reads as a control that does nothing.
          <p className='text-warning text-xs'>
            {overriddenBy} settings override this — editing here will not change the value in use
          </p>
        ) : null}
        {disabledReason ? <p className='text-warning text-xs'>{disabledReason}</p> : null}
      </div>

      <div className='flex shrink-0 items-center gap-1'>
        <SettingControl
          disabled={disabledReason !== null}
          id={id}
          onChange={(next) => setSetting(id, next, scope)}
          value={value}
        />
        <RowActions id={id} isModified={isModified} value={value} />
      </div>
    </div>
  )
}

function SettingControl({
  disabled,
  id,
  onChange,
  value,
}: {
  disabled: boolean
  id: SettingId
  onChange: (next: never) => void
  value: unknown
}) {
  const descriptor = descriptorFor(id)

  if (descriptor.widget === 'boolean') {
    return (
      <BooleanWidget
        checked={value === true}
        disabled={disabled}
        id={id}
        onChange={onChange as (next: boolean) => void}
      />
    )
  }

  if (descriptor.widget === 'number') {
    return (
      <NumberWidget
        disabled={disabled}
        id={id}
        onCommit={onChange as (next: number) => void}
        value={Number(value)}
      />
    )
  }

  // The two keys whose value is a whole domain object rather than a scalar. They
  // render the editors that already know how to source their rows — providers
  // from the running snapshots, models from the provider catalogue — because
  // neither list lives in the settings document.
  if (descriptor.widget === 'providers') {
    return <ProviderSection saved={value as never} />
  }

  if (descriptor.widget === 'models') {
    return <ModelSection settingId={id} />
  }

  if (descriptor.widget === 'record') {
    return (
      <RecordWidget
        disabled={disabled}
        id={id}
        onChange={onChange as (next: Record<string, string | null>) => void}
        recorder={id === 'keybindings.overrides'}
        value={(value ?? {}) as Record<string, string | null>}
      />
    )
  }

  if (descriptor.widget === 'font') {
    return (
      <FontWidget
        disabled={disabled}
        id={id}
        onChange={onChange as (next: string) => void}
        value={String(value)}
      />
    )
  }

  if (descriptor.widget === 'string' || descriptor.widget === 'multiline') {
    return (
      <StringWidget
        disabled={disabled}
        id={id}
        onCommit={onChange as (next: string) => void}
        value={String(value)}
      />
    )
  }

  if (descriptor.widget === 'enum') {
    return (
      <EnumWidget
        disabled={disabled}
        id={id}
        onChange={onChange as (next: string) => void}
        options={enumOptions(descriptor.schema)}
        value={String(value)}
      />
    )
  }

  // Lists, records and provider config get real editors in a later phase. Saying
  // so beats rendering a control that cannot represent the value.
  return <span className='text-muted-foreground text-xs'>Edit in settings.json</span>
}

function enumOptions(schema: unknown): readonly string[] {
  if (!schema || typeof schema !== 'object') return []
  const options = (schema as { options?: unknown }).options

  return Array.isArray(options) ? options.map(String) : []
}
