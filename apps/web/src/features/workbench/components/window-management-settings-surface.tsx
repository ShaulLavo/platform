import type { ChangeEvent } from 'react'
import { Button } from '@workspace/ui/components/button'
import { Input } from '@workspace/ui/components/input'
import { Switch } from '@workspace/ui/components/switch'

import { builtInWindowManagementCommands } from '@/features/tiling-surface-manager/engine/layout-command-catalog'
import { defaultWindowManagementHotkeyPresets } from '@/features/tiling-surface-manager/engine/layout-command-presets'
import {
  layoutCommandId,
  windowManagementCommandId,
} from '@/features/tiling-surface-manager/engine/layout-ids'
import {
  type CustomWindowFrame,
  type CustomWindowManagementCommand,
  type LayoutCommandSurfaceSlot,
  type Surface,
  type WorkspaceLayout,
  type WorkspaceLayoutCommand,
} from '@/features/tiling-surface-manager/engine/layout-types'
import { useLayoutState } from '@/features/workbench/hooks/use-layout-state'
import { useLayoutStoreApi } from '@/features/workbench/hooks/use-layout-store-api'
import { selectVisibleSurfaces } from '@/features/tiling-surface-manager/engine/layout-selectors'

const FRAME_ANCHORS: readonly CustomWindowFrame['anchor'][] = [
  'top-left',
  'top',
  'top-right',
  'left',
  'center',
  'right',
  'bottom-left',
  'bottom',
  'bottom-right',
]

export function WindowManagementSettingsSurface() {
  const layout = useLayoutState((state) => state.layout)
  const layoutStore = useLayoutStoreApi()
  const builtIns = builtInWindowManagementCommands()
  const customCommands = Object.values(layout.windowCommandsById).filter(
    (command): command is CustomWindowManagementCommand => command.kind === 'custom-window',
  )
  const layoutCommands = Object.values(layout.layoutCommandsById)

  function updateCustomCommand(
    command: CustomWindowManagementCommand,
    patch: Partial<CustomWindowManagementCommand>,
  ) {
    layoutStore.getState().dispatchLayoutOperation({
      command: { ...command, ...patch },
      type: 'upsertCustomWindowCommand',
    })
  }

  function updateCustomFrame(
    command: CustomWindowManagementCommand,
    patch: Partial<CustomWindowFrame>,
  ) {
    updateCustomCommand(command, {
      targetFrame: {
        ...command.targetFrame,
        ...patch,
      },
    })
  }

  function updateLayoutCommand(
    command: WorkspaceLayoutCommand,
    patch: Partial<WorkspaceLayoutCommand>,
  ) {
    layoutStore.getState().dispatchLayoutOperation({
      command: { ...command, ...patch },
      type: 'upsertLayoutCommand',
    })
  }

  function createCustomCommand() {
    layoutStore.getState().dispatchLayoutOperation({
      command: defaultSettingsCustomCommand(layout),
      type: 'upsertCustomWindowCommand',
    })
  }

  function createSavedLayoutCommand() {
    layoutStore.getState().dispatchLayoutOperation({
      command: defaultSettingsLayoutCommand(layout),
      type: 'upsertLayoutCommand',
    })
  }

  function applyPreset(presetId: string) {
    const preset = defaultWindowManagementHotkeyPresets().find(
      (candidate) => candidate.id === presetId,
    )
    if (!preset) return

    layoutStore.getState().dispatchLayoutOperation({ preset, type: 'applyHotkeyPreset' })
  }

  return (
    <section className='bg-background flex h-full min-h-0 min-w-0 flex-col overflow-hidden'>
      <header className='border-border/70 bg-muted/20 shrink-0 border-b px-4 py-3'>
        <h2 className='text-foreground truncate text-sm font-medium'>Window Management Settings</h2>
      </header>
      <div className='min-h-0 flex-1 space-y-5 overflow-auto p-4'>
        <div className='flex flex-wrap gap-2'>
          <Button size='sm' type='button' variant='secondary' onClick={createCustomCommand}>
            Create Window Command
          </Button>
          <Button size='sm' type='button' variant='secondary' onClick={createSavedLayoutCommand}>
            Create Layout Command
          </Button>
        </div>
        {renderCommandTable(builtIns, customCommands, layoutCommands)}
        {renderCustomCommands(customCommands, updateCustomCommand, updateCustomFrame)}
        {renderLayoutCommands(layoutCommands, updateLayoutCommand)}
        {renderPresetPanel(layout, applyPreset)}
      </div>
    </section>
  )
}

function renderCommandTable(
  builtIns: readonly ReturnType<typeof builtInWindowManagementCommands>[number][],
  customCommands: readonly CustomWindowManagementCommand[],
  layoutCommands: readonly WorkspaceLayoutCommand[],
) {
  const rows = [
    ...builtIns.map((command) => ({
      aliases: command.aliases.join(', '),
      enabled: true,
      hotkey: '',
      id: command.id,
      name: command.title,
      type: 'Built-in',
    })),
    ...customCommands.map((command) => ({
      aliases: command.aliases.join(', '),
      enabled: command.enabled,
      hotkey: command.hotkeyId ?? '',
      id: command.id,
      name: command.title,
      type: 'Custom',
    })),
    ...layoutCommands.map((command) => ({
      aliases: command.aliases.join(', '),
      enabled: command.enabled,
      hotkey: command.hotkeyId ?? '',
      id: command.id,
      name: command.title,
      type: 'Layout',
    })),
  ]

  return (
    <div className='border-border bg-card overflow-hidden rounded-md border'>
      <div className='border-border grid grid-cols-[1.3fr_0.7fr_1fr_0.8fr_0.5fr] border-b px-3 py-2 text-xs font-medium'>
        <span>Name</span>
        <span>Type</span>
        <span>Alias</span>
        <span>Hotkey</span>
        <span>Enabled</span>
      </div>
      {rows.map((row) => (
        <div
          className='text-muted-foreground border-border grid grid-cols-[1.3fr_0.7fr_1fr_0.8fr_0.5fr] border-b px-3 py-2 text-xs last:border-b-0'
          key={row.id}
        >
          <span className='text-foreground truncate'>{row.name}</span>
          <span>{row.type}</span>
          <span className='truncate'>{row.aliases || '-'}</span>
          <span className='truncate'>{row.hotkey || '-'}</span>
          <span>{row.enabled ? 'Yes' : 'No'}</span>
        </div>
      ))}
    </div>
  )
}

function renderCustomCommands(
  commands: readonly CustomWindowManagementCommand[],
  updateCommand: (
    command: CustomWindowManagementCommand,
    patch: Partial<CustomWindowManagementCommand>,
  ) => void,
  updateFrame: (command: CustomWindowManagementCommand, patch: Partial<CustomWindowFrame>) => void,
) {
  return (
    <section className='space-y-2'>
      <h3 className='text-foreground text-xs font-medium'>Custom Window Commands</h3>
      {commands.length === 0 ? (
        <div className='text-muted-foreground border-border rounded-md border p-3 text-xs'>
          No custom window commands.
        </div>
      ) : (
        commands.map((command) => (
          <div className='border-border bg-card grid gap-3 rounded-md border p-3' key={command.id}>
            <div className='grid gap-2 md:grid-cols-[1fr_1fr_0.7fr_auto]'>
              {renderLabeledInput('Name', command.title, (value) =>
                updateCommand(command, { title: value }),
              )}
              {renderLabeledInput('Alias', command.aliases.join(', '), (value) =>
                updateCommand(command, { aliases: aliasesFromText(value) }),
              )}
              {renderLabeledInput('Hotkey', command.hotkeyId ?? '', (value) =>
                updateCommand(command, { hotkeyId: optionalText(value) }),
              )}
              <label className='flex items-end gap-2 pb-1 text-xs'>
                <Switch
                  checked={command.enabled}
                  size='sm'
                  onCheckedChange={(enabled) => updateCommand(command, { enabled })}
                />
                Enabled
              </label>
            </div>
            <div className='grid gap-2 md:grid-cols-[0.9fr_0.7fr_repeat(4,0.55fr)]'>
              {renderAnchorSelect(command.targetFrame.anchor, (anchor) =>
                updateFrame(command, { anchor }),
              )}
              {renderUnitSelect(command.targetFrame.unit, (unit) => updateFrame(command, { unit }))}
              {renderNumberInput('Width', command.targetFrame.width, (width) =>
                updateFrame(command, { width }),
              )}
              {renderNumberInput('Height', command.targetFrame.height, (height) =>
                updateFrame(command, { height }),
              )}
              {renderNumberInput('Offset X', command.targetFrame.offsetX, (offsetX) =>
                updateFrame(command, { offsetX }),
              )}
              {renderNumberInput('Offset Y', command.targetFrame.offsetY, (offsetY) =>
                updateFrame(command, { offsetY }),
              )}
            </div>
          </div>
        ))
      )}
    </section>
  )
}

function renderLayoutCommands(
  commands: readonly WorkspaceLayoutCommand[],
  updateCommand: (command: WorkspaceLayoutCommand, patch: Partial<WorkspaceLayoutCommand>) => void,
) {
  return (
    <section className='space-y-2'>
      <h3 className='text-foreground text-xs font-medium'>Saved Layout Commands</h3>
      {commands.map((command) => (
        <div className='border-border bg-card grid gap-3 rounded-md border p-3' key={command.id}>
          <div className='grid gap-2 md:grid-cols-[1fr_1fr_0.7fr_auto]'>
            {renderLabeledInput('Name', command.title, (value) =>
              updateCommand(command, { title: value }),
            )}
            {renderLabeledInput('Alias', command.aliases.join(', '), (value) =>
              updateCommand(command, { aliases: aliasesFromText(value) }),
            )}
            {renderLabeledInput('Hotkey', command.hotkeyId ?? '', (value) =>
              updateCommand(command, { hotkeyId: optionalText(value) }),
            )}
            <label className='flex items-end gap-2 pb-1 text-xs'>
              <Switch
                checked={command.enabled}
                size='sm'
                onCheckedChange={(enabled) => updateCommand(command, { enabled })}
              />
              Enabled
            </label>
          </div>
          <div className='space-y-2'>
            {command.slots.map((slot) => renderLayoutSlot(command, slot, updateCommand))}
          </div>
        </div>
      ))}
    </section>
  )
}

function renderLayoutSlot(
  command: WorkspaceLayoutCommand,
  slot: LayoutCommandSurfaceSlot,
  updateCommand: (command: WorkspaceLayoutCommand, patch: Partial<WorkspaceLayoutCommand>) => void,
) {
  function updateSlot(patch: Partial<LayoutCommandSurfaceSlot>) {
    updateCommand(command, {
      slots: command.slots.map((candidate) =>
        candidate.id === slot.id ? { ...candidate, ...patch } : candidate,
      ),
    })
  }

  function updateFrame(patch: Partial<CustomWindowFrame>) {
    updateSlot({
      frame: {
        ...slot.frame,
        ...patch,
      },
    })
  }

  return (
    <div className='border-border grid gap-2 border-t pt-2 md:grid-cols-[0.8fr_1fr_0.8fr_0.7fr_repeat(2,0.55fr)]'>
      <div className='min-w-0'>
        <div className='text-muted-foreground text-[11px]'>Surface</div>
        <div className='text-foreground truncate text-xs'>{slot.surfaceType}</div>
      </div>
      {renderLabeledInput('Resource', slot.resourceKey ?? '', (resourceKey) =>
        updateSlot({ resourceKey: optionalText(resourceKey) }),
      )}
      {renderLabeledInput('Payload', slot.payload?.value ?? '', (value) =>
        updateSlot({ payload: payloadFromValue(value) }),
      )}
      {renderAnchorSelect(slot.frame.anchor, (anchor) => updateFrame({ anchor }))}
      {renderNumberInput('Width', slot.frame.width, (width) => updateFrame({ width }))}
      {renderNumberInput('Height', slot.frame.height, (height) => updateFrame({ height }))}
    </div>
  )
}

function renderPresetPanel(layout: WorkspaceLayout, applyPreset: (presetId: string) => void) {
  return (
    <section className='border-border bg-card rounded-md border p-3'>
      <h3 className='text-foreground mb-2 text-xs font-medium'>Hotkey Presets</h3>
      <div className='flex flex-wrap gap-2'>
        {defaultWindowManagementHotkeyPresets().map((preset) => (
          <Button
            disabled={layout.activeHotkeyPresetId === preset.id}
            key={preset.id}
            size='sm'
            type='button'
            variant={layout.activeHotkeyPresetId === preset.id ? 'secondary' : 'outline'}
            onClick={() => applyPreset(preset.id)}
          >
            {preset.title}
          </Button>
        ))}
      </div>
      <div className='text-muted-foreground mt-3 grid gap-2 text-xs md:grid-cols-4'>
        <span>Default Gap: Theme spacing</span>
        <span>Cycling: Command scoped</span>
        <span>Display Wrapping: Stored when available</span>
        <span>OS Compatibility: Browser safe</span>
      </div>
    </section>
  )
}

function renderLabeledInput(label: string, value: string, onChange: (value: string) => void) {
  return (
    <label className='grid gap-1 text-xs'>
      <span className='text-muted-foreground text-[11px]'>{label}</span>
      <Input value={value} onChange={(event) => onChange(event.currentTarget.value)} />
    </label>
  )
}

function renderAnchorSelect(
  value: CustomWindowFrame['anchor'],
  onChange: (value: CustomWindowFrame['anchor']) => void,
) {
  return (
    <label className='grid gap-1 text-xs'>
      <span className='text-muted-foreground text-[11px]'>Position</span>
      <select
        className='border-input bg-background h-8 rounded-none border px-2 text-xs'
        value={value}
        onChange={(event) => onChange(event.currentTarget.value as CustomWindowFrame['anchor'])}
      >
        {FRAME_ANCHORS.map((anchor) => (
          <option key={anchor} value={anchor}>
            {anchor}
          </option>
        ))}
      </select>
    </label>
  )
}

function renderUnitSelect(
  value: CustomWindowFrame['unit'],
  onChange: (value: CustomWindowFrame['unit']) => void,
) {
  return (
    <label className='grid gap-1 text-xs'>
      <span className='text-muted-foreground text-[11px]'>Unit</span>
      <select
        className='border-input bg-background h-8 rounded-none border px-2 text-xs'
        value={value}
        onChange={(event) => onChange(event.currentTarget.value as CustomWindowFrame['unit'])}
      >
        <option value='percent'>percent</option>
        <option value='points'>points</option>
      </select>
    </label>
  )
}

function renderNumberInput(label: string, value: number, onChange: (value: number) => void) {
  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    const nextValue = Number(event.currentTarget.value)
    if (!Number.isFinite(nextValue)) return

    onChange(nextValue)
  }

  return (
    <label className='grid gap-1 text-xs'>
      <span className='text-muted-foreground text-[11px]'>{label}</span>
      <Input type='number' value={value} onChange={handleChange} />
    </label>
  )
}

function defaultSettingsCustomCommand(layout: WorkspaceLayout): CustomWindowManagementCommand {
  const id = windowManagementCommandId(
    `settings-custom-${Object.keys(layout.windowCommandsById).length + 1}`,
  )

  return {
    aliases: ['custom window'],
    category: 'Window Management',
    enabled: true,
    icon: 'window',
    id,
    kind: 'custom-window',
    targetFrame: defaultFrame('left'),
    title: 'Custom Window Command',
  }
}

function defaultSettingsLayoutCommand(layout: WorkspaceLayout): WorkspaceLayoutCommand {
  const id = layoutCommandId(`settings-layout-${Object.keys(layout.layoutCommandsById).length + 1}`)

  return {
    aliases: ['saved layout'],
    enabled: true,
    icon: 'layout',
    id,
    slots: settingsLayoutSlots(layout),
    title: 'Saved Layout Command',
  }
}

function settingsLayoutSlots(layout: WorkspaceLayout): readonly LayoutCommandSurfaceSlot[] {
  const slots = selectVisibleSurfaces(layout).flatMap(settingsLayoutSlot)
  if (slots.length > 0) return slots

  return [
    {
      frame: defaultFrame('left'),
      id: 'placeholder',
      surfaceType: 'placeholder',
    },
  ]
}

function settingsLayoutSlot(surface: Surface, index: number): readonly LayoutCommandSurfaceSlot[] {
  if (surface.type === 'search-preview') return []

  return [
    {
      frame: defaultFrame(index % 2 === 0 ? 'left' : 'right'),
      id: `${surface.type}:${index}`,
      resourceKey: surface.resourceKey,
      stateKey: surface.stateKey,
      surfaceType: surface.type,
    },
  ]
}

function defaultFrame(anchor: CustomWindowFrame['anchor']): CustomWindowFrame {
  return {
    anchor,
    height: 100,
    offsetX: 0,
    offsetY: 0,
    unit: 'percent',
    width: 50,
  }
}

function aliasesFromText(value: string) {
  return value
    .split(',')
    .map((alias) => alias.trim())
    .filter(Boolean)
}

function optionalText(value: string) {
  const trimmed = value.trim()
  if (!trimmed) return undefined

  return trimmed
}

function payloadFromValue(value: string): LayoutCommandSurfaceSlot['payload'] {
  const trimmed = value.trim()
  if (!trimmed) return undefined

  return { kind: 'quicklink', value: trimmed }
}
