import {
  ArrowArcLeftIcon,
  ArrowArcRightIcon,
  ArrowClockwiseIcon,
  ArrowCounterClockwiseIcon,
  ArrowLineDownIcon,
  ArrowLineUpIcon,
  ArrowSquareOutIcon,
  ArrowsOutLineVerticalIcon,
  BracketsCurlyIcon,
  CardsIcon,
  ChatTextIcon,
  ClockCounterClockwiseIcon,
  CommandIcon,
  CopySimpleIcon,
  CrosshairIcon,
  CursorClickIcon,
  DesktopIcon,
  FileMagnifyingGlassIcon,
  FloppyDiskBackIcon,
  FloppyDiskIcon,
  FolderOpenIcon,
  GearSixIcon,
  GitDiffIcon,
  type Icon,
  ImageIcon,
  LinkIcon,
  MagnifyingGlassIcon,
  MoonIcon,
  PaletteIcon,
  SelectionIcon,
  SidebarSimpleIcon,
  SquareHalfBottomIcon,
  SquaresFourIcon,
  SunIcon,
  SwapIcon,
  TextIndentIcon,
  TextOutdentIcon,
  TrashIcon,
  XIcon,
} from '@phosphor-icons/react'

import type { PlatformCommandId } from '@/keymap/types'

import { CommandCategoryIcon } from './command-category-icon'

// A meaningful icon per command makes the palette scannable instead of a wall
// of identical category glyphs. Anything not listed falls back to its category
// icon, so partial coverage degrades gracefully.
const COMMAND_ICONS: Partial<Record<PlatformCommandId, Icon>> = {
  'workspace.showQuickAccess': FileMagnifyingGlassIcon,
  'workspace.showCommandPalette': CommandIcon,
  'workspace.openFilePicker': FolderOpenIcon,
  'workspace.showSettings': GearSixIcon,
  'workspace.openSearchEditor': FileMagnifyingGlassIcon,
  'workspace.quickOpenPreviousEditor': ClockCounterClockwiseIcon,
  'workspace.quickOpenView': SquaresFourIcon,
  'workspace.gotoSymbol': BracketsCurlyIcon,
  'workspace.showAllEditors': CardsIcon,
  'workspace.saveFile': FloppyDiskIcon,
  'workspace.saveAllFiles': FloppyDiskBackIcon,
  'workspace.revertFile': ArrowCounterClockwiseIcon,
  'workspace.reopenClosedEditor': ArrowClockwiseIcon,
  'workspace.toggleSidebarVisibility': SidebarSimpleIcon,
  'workspace.togglePanel': SquareHalfBottomIcon,
  'workspace.focusFirstEditorGroup': CrosshairIcon,
  'workspace.focusSecondEditorGroup': CrosshairIcon,
  'workspace.focusThirdEditorGroup': CrosshairIcon,
  'workspace.focusEditor': CrosshairIcon,
  'workspace.focusFileTree': CrosshairIcon,
  'workspace.focusGit': CrosshairIcon,
  'workspace.closeCurrentTab': XIcon,
  'workspace.toggleDiffViewMode': GitDiffIcon,
  'workspace.selectColorMode': PaletteIcon,
  'workspace.setDarkTheme': MoonIcon,
  'workspace.setLightTheme': SunIcon,
  'workspace.setSystemTheme': DesktopIcon,
  'workspace.toggleWallpaper': ImageIcon,
  'editor.undo': ArrowArcLeftIcon,
  'editor.redo': ArrowArcRightIcon,
  'editor.find': MagnifyingGlassIcon,
  'editor.findReplace': SwapIcon,
  'editor.findNext': MagnifyingGlassIcon,
  'editor.findPrevious': MagnifyingGlassIcon,
  'editor.goToDefinition': ArrowSquareOutIcon,
  'editor.editor.action.goToReferences': LinkIcon,
  'editor.replaceOne': SwapIcon,
  'editor.replaceAll': SwapIcon,
  'editor.selectAll': SelectionIcon,
  'editor.selectAllMatches': SelectionIcon,
  'editor.editor.action.selectHighlights': SelectionIcon,
  'editor.editor.action.changeAll': SwapIcon,
  'editor.addNextOccurrence': CursorClickIcon,
  'editor.editor.action.insertCursorAbove': CursorClickIcon,
  'editor.editor.action.insertCursorBelow': CursorClickIcon,
  'editor.clearSecondarySelections': CursorClickIcon,
  'editor.editor.action.deleteLines': TrashIcon,
  'editor.editor.action.copyLinesUpAction': CopySimpleIcon,
  'editor.editor.action.copyLinesDownAction': CopySimpleIcon,
  'editor.editor.action.moveLinesUpAction': ArrowsOutLineVerticalIcon,
  'editor.editor.action.moveLinesDownAction': ArrowsOutLineVerticalIcon,
  'editor.editor.action.insertLineBefore': ArrowLineUpIcon,
  'editor.editor.action.insertLineAfter': ArrowLineDownIcon,
  'editor.editor.action.commentLine': ChatTextIcon,
  'editor.editor.action.blockComment': ChatTextIcon,
  'editor.editor.action.indentLines': TextIndentIcon,
  'editor.editor.action.outdentLines': TextOutdentIcon,
  'editor.indentSelection': TextIndentIcon,
  'editor.outdentSelection': TextOutdentIcon,
}

type CommandPaletteIconProps = {
  readonly category: string
  readonly command: PlatformCommandId
}

export function CommandPaletteIcon({ category, command }: CommandPaletteIconProps) {
  const ResolvedIcon = COMMAND_ICONS[command]
  if (!ResolvedIcon) return <CommandCategoryIcon category={category} />

  return <ResolvedIcon className='text-muted-foreground' weight='duotone' />
}
