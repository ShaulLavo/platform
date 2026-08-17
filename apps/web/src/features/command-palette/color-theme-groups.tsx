import { PaletteIcon } from '@phosphor-icons/react'
import { CommandGroup, CommandItem, CommandShortcut } from '@workspace/ui/components/command'
import { useEffect } from 'react'

import { useCommandPaletteActions } from '@/features/command-palette/hooks/use-command-palette-actions'
import { useEditorColorTheme } from '@/features/editor/hooks/use-editor-color-theme'
import {
  prepareEditorThemeSwitching,
  preloadVscodeThemeRegistrations,
} from '@/features/editor/state/color-theme-store'
import { editorThemeOptions, type EditorThemeOption } from '@/features/editor/utils/theme-catalog'
import { colorThemeItemValue } from '@/features/command-palette/command-palette-utils'
import { RowLabel } from '@/features/command-palette/row-label'

export function ColorThemeGroups() {
  const { selectColorTheme } = useCommandPaletteActions()
  const { committedThemeId } = useEditorColorTheme()

  // Opening this list is the moment switching themes stops being hypothetical,
  // so both warmups start here rather than at document open: the registrations
  // every preview hands the worker, and the worker-side highlighter that makes a
  // swap a re-tokenize instead of a rebuild.
  useEffect(() => {
    prepareEditorThemeSwitching()
    void preloadVscodeThemeRegistrations()
  }, [])

  return (
    <>
      <ColorThemeGroup
        heading='Color Theme — Dark'
        activeThemeId={committedThemeId}
        themes={editorThemeOptions('dark')}
        onSelect={selectColorTheme}
      />
      <ColorThemeGroup
        heading='Color Theme — Light'
        activeThemeId={committedThemeId}
        themes={editorThemeOptions('light')}
        onSelect={selectColorTheme}
      />
    </>
  )
}

function ColorThemeGroup({
  heading,
  activeThemeId,
  themes,
  onSelect,
}: {
  readonly heading: string
  readonly activeThemeId: string
  readonly themes: readonly EditorThemeOption[]
  readonly onSelect: (themeId: string) => void
}) {
  return (
    <CommandGroup heading={heading}>
      {themes.map((theme) => (
        <CommandItem
          key={theme.id}
          keywords={[theme.label, theme.id, theme.type, theme.source]}
          value={colorThemeItemValue(theme.id)}
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
