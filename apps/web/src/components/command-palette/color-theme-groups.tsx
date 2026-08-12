import { PaletteIcon } from '@phosphor-icons/react'
import { CommandGroup, CommandItem, CommandShortcut } from '@workspace/ui/components/command'
import { useEffect } from 'react'

import { useCommandPaletteActions } from '@/components/command-palette/hooks/use-command-palette-actions'
import { useEditorColorTheme } from '@/features/editor/hooks/use-editor-color-theme'
import { preloadVscodeThemeRegistrations } from '@/features/editor/state/editor-color-theme-store'
import { editorThemeOptions, type EditorThemeOption } from '@/features/editor/utils/theme-catalog'
import { RowLabel } from './row-label'

export function ColorThemeGroups() {
  const { previewColorTheme, selectColorTheme } = useCommandPaletteActions()
  const { committedThemeId, shikiTheme } = useEditorColorTheme()

  // Warm every bundled theme's registration so hover-preview can switch to any
  // of the 65 themes without the few-frame flash of unhighlighted text the
  // worker would otherwise show while its dynamic import is in flight.
  useEffect(() => {
    void preloadVscodeThemeRegistrations()
  }, [])

  return (
    <>
      <ColorThemeGroup
        heading='Color Theme — Dark'
        activeThemeId={committedThemeId}
        previewThemeId={shikiTheme}
        themes={editorThemeOptions('dark')}
        onPreview={previewColorTheme}
        onSelect={selectColorTheme}
      />
      <ColorThemeGroup
        heading='Color Theme — Light'
        activeThemeId={committedThemeId}
        previewThemeId={shikiTheme}
        themes={editorThemeOptions('light')}
        onPreview={previewColorTheme}
        onSelect={selectColorTheme}
      />
    </>
  )
}

function ColorThemeGroup({
  heading,
  activeThemeId,
  previewThemeId,
  themes,
  onPreview,
  onSelect,
}: {
  readonly heading: string
  readonly activeThemeId: string
  readonly previewThemeId: string
  readonly themes: readonly EditorThemeOption[]
  readonly onPreview: (themeId: string) => void
  readonly onSelect: (themeId: string) => void
}) {
  return (
    <CommandGroup heading={heading}>
      {themes.map((theme) => (
        <CommandItem
          key={theme.id}
          keywords={[theme.label, theme.id, theme.type, theme.source]}
          value={`color-theme:${theme.id}`}
          onPointerEnter={() => {
            if (theme.id === previewThemeId) return
            onPreview(theme.id)
          }}
          onSelect={() => onSelect(theme.id)}
        >
          <PaletteIcon className='text-muted-foreground' />
          <RowLabel label={theme.label} description={theme.subtitle} />
          {theme.id === activeThemeId && <CommandShortcut>active</CommandShortcut>}
        </CommandItem>
      ))}
    </CommandGroup>
  )
}
