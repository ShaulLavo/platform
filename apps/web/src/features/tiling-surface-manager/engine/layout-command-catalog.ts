import { windowManagementCommandId } from '@/features/tiling-surface-manager/engine/layout-ids'
import type {
  BuiltInWindowManagementCommand,
  CommandCycleRule,
  CustomWindowFrame,
  CustomWindowManagementCommand,
  LayoutOperation,
  WindowManagementCommand,
} from '@/features/tiling-surface-manager/engine/layout-types'

export const CLOSE_ACTIVE_SURFACE_COMMAND_ID = windowManagementCommandId('close-active-surface')
export const BACKGROUND_ACTIVE_SURFACE_COMMAND_ID = windowManagementCommandId(
  'background-active-surface',
)
export const FULLSCREEN_ACTIVE_WINDOW_COMMAND_ID = windowManagementCommandId(
  'fullscreen-active-window',
)
export const MAXIMIZE_ACTIVE_WINDOW_COMMAND_ID = windowManagementCommandId('maximize-active-window')
export const ALMOST_MAXIMIZE_ACTIVE_WINDOW_COMMAND_ID = windowManagementCommandId(
  'almost-maximize-active-window',
)
export const MAXIMIZE_ACTIVE_WINDOW_HEIGHT_COMMAND_ID = windowManagementCommandId(
  'maximize-active-window-height',
)
export const MAXIMIZE_ACTIVE_WINDOW_WIDTH_COMMAND_ID = windowManagementCommandId(
  'maximize-active-window-width',
)
export const RESTORE_ACTIVE_WINDOW_COMMAND_ID = windowManagementCommandId('restore-active-window')
export const REASONABLE_SIZE_ACTIVE_WINDOW_COMMAND_ID = windowManagementCommandId(
  'reasonable-size-active-window',
)
export const CENTER_ACTIVE_WINDOW_COMMAND_ID = windowManagementCommandId('center-active-window')
export const COLLAPSE_ACTIVE_WINDOW_COMMAND_ID = windowManagementCommandId('collapse-active-window')
export const EXPAND_ACTIVE_WINDOW_COMMAND_ID = windowManagementCommandId('expand-active-window')
export const SPLIT_ACTIVE_WINDOW_LEFT_COMMAND_ID = windowManagementCommandId(
  'split-active-window-left',
)
export const SPLIT_ACTIVE_WINDOW_RIGHT_COMMAND_ID = windowManagementCommandId(
  'split-active-window-right',
)
export const SPLIT_ACTIVE_WINDOW_TOP_COMMAND_ID =
  windowManagementCommandId('split-active-window-top')
export const SPLIT_ACTIVE_WINDOW_BOTTOM_COMMAND_ID = windowManagementCommandId(
  'split-active-window-bottom',
)
export const LEFT_HALF_ACTIVE_WINDOW_COMMAND_ID =
  windowManagementCommandId('left-half-active-window')
export const RIGHT_HALF_ACTIVE_WINDOW_COMMAND_ID = windowManagementCommandId(
  'right-half-active-window',
)
export const TOP_HALF_ACTIVE_WINDOW_COMMAND_ID = windowManagementCommandId('top-half-active-window')
export const BOTTOM_HALF_ACTIVE_WINDOW_COMMAND_ID = windowManagementCommandId(
  'bottom-half-active-window',
)
export const LEFT_THIRD_ACTIVE_WINDOW_COMMAND_ID = windowManagementCommandId(
  'left-third-active-window',
)
export const CENTER_THIRD_ACTIVE_WINDOW_COMMAND_ID = windowManagementCommandId(
  'center-third-active-window',
)
export const RIGHT_THIRD_ACTIVE_WINDOW_COMMAND_ID = windowManagementCommandId(
  'right-third-active-window',
)
export const LEFT_TWO_THIRDS_ACTIVE_WINDOW_COMMAND_ID = windowManagementCommandId(
  'left-two-thirds-active-window',
)
export const RIGHT_TWO_THIRDS_ACTIVE_WINDOW_COMMAND_ID = windowManagementCommandId(
  'right-two-thirds-active-window',
)
export const TOP_LEFT_QUARTER_ACTIVE_WINDOW_COMMAND_ID = windowManagementCommandId(
  'top-left-quarter-active-window',
)
export const TOP_RIGHT_QUARTER_ACTIVE_WINDOW_COMMAND_ID = windowManagementCommandId(
  'top-right-quarter-active-window',
)
export const BOTTOM_LEFT_QUARTER_ACTIVE_WINDOW_COMMAND_ID = windowManagementCommandId(
  'bottom-left-quarter-active-window',
)
export const BOTTOM_RIGHT_QUARTER_ACTIVE_WINDOW_COMMAND_ID = windowManagementCommandId(
  'bottom-right-quarter-active-window',
)
export const LEFT_SIXTH_ACTIVE_WINDOW_COMMAND_ID = windowManagementCommandId(
  'left-sixth-active-window',
)
export const RIGHT_SIXTH_ACTIVE_WINDOW_COMMAND_ID = windowManagementCommandId(
  'right-sixth-active-window',
)
export const MOVE_ACTIVE_SURFACE_LEFT_COMMAND_ID = windowManagementCommandId(
  'move-active-surface-left',
)
export const MOVE_ACTIVE_SURFACE_RIGHT_COMMAND_ID = windowManagementCommandId(
  'move-active-surface-right',
)
export const MOVE_ACTIVE_SURFACE_TOP_COMMAND_ID =
  windowManagementCommandId('move-active-surface-top')
export const MOVE_ACTIVE_SURFACE_BOTTOM_COMMAND_ID = windowManagementCommandId(
  'move-active-surface-bottom',
)
export const MOVE_ACTIVE_SURFACE_TO_BACKGROUND_COMMAND_ID = windowManagementCommandId(
  'move-active-surface-to-background',
)
export const MOVE_ACTIVE_WINDOW_LEFT_COMMAND_ID =
  windowManagementCommandId('move-active-window-left')
export const MOVE_ACTIVE_WINDOW_RIGHT_COMMAND_ID = windowManagementCommandId(
  'move-active-window-right',
)
export const MOVE_ACTIVE_WINDOW_TOP_COMMAND_ID = windowManagementCommandId('move-active-window-top')
export const MOVE_ACTIVE_WINDOW_BOTTOM_COMMAND_ID = windowManagementCommandId(
  'move-active-window-bottom',
)
export const MOVE_ACTIVE_WINDOW_NEXT_DISPLAY_COMMAND_ID = windowManagementCommandId(
  'move-active-window-next-display',
)
export const MOVE_ACTIVE_WINDOW_PREVIOUS_DISPLAY_COMMAND_ID = windowManagementCommandId(
  'move-active-window-previous-display',
)
export const FOCUS_WINDOW_LEFT_COMMAND_ID = windowManagementCommandId('focus-window-left')
export const FOCUS_WINDOW_RIGHT_COMMAND_ID = windowManagementCommandId('focus-window-right')
export const FOCUS_WINDOW_TOP_COMMAND_ID = windowManagementCommandId('focus-window-top')
export const FOCUS_WINDOW_BOTTOM_COMMAND_ID = windowManagementCommandId('focus-window-bottom')
export const FOCUS_PARENT_SPLIT_COMMAND_ID = windowManagementCommandId('focus-parent-split')
export const FOCUS_ACTIVE_CHILD_COMMAND_ID = windowManagementCommandId('focus-active-child')
export const FOCUS_RAIL_COMMAND_ID = windowManagementCommandId('focus-rail')
export const RESTORE_PREVIOUS_SURFACE_COMMAND_ID = windowManagementCommandId(
  'restore-previous-surface',
)
export const NEXT_SURFACE_IN_WINDOW_COMMAND_ID = windowManagementCommandId('next-surface-in-window')
export const PREVIOUS_SURFACE_IN_WINDOW_COMMAND_ID = windowManagementCommandId(
  'previous-surface-in-window',
)
export const REORDER_ACTIVE_SURFACE_LEFT_COMMAND_ID = windowManagementCommandId(
  'reorder-active-surface-left',
)
export const REORDER_ACTIVE_SURFACE_RIGHT_COMMAND_ID = windowManagementCommandId(
  'reorder-active-surface-right',
)
export const TEAR_ACTIVE_SURFACE_RIGHT_COMMAND_ID = windowManagementCommandId(
  'tear-active-surface-right',
)
export const TAB_ACTIVE_SURFACE_LEFT_COMMAND_ID =
  windowManagementCommandId('tab-active-surface-left')
export const TAB_ACTIVE_SURFACE_RIGHT_COMMAND_ID = windowManagementCommandId(
  'tab-active-surface-right',
)
export const RESIZE_ACTIVE_SPLIT_LEFT_COMMAND_ID = windowManagementCommandId(
  'resize-active-split-left',
)
export const RESIZE_ACTIVE_SPLIT_RIGHT_COMMAND_ID = windowManagementCommandId(
  'resize-active-split-right',
)
export const RESIZE_ACTIVE_SPLIT_TOP_COMMAND_ID =
  windowManagementCommandId('resize-active-split-top')
export const RESIZE_ACTIVE_SPLIT_BOTTOM_COMMAND_ID = windowManagementCommandId(
  'resize-active-split-bottom',
)

const WINDOW_MANAGEMENT_CATEGORY = 'Window Management' as const
const FRAME_CYCLE_RESET_MS = 1200

const centerFrame = frame('center', 60, 70)
const reasonableFrame = frame('center', 72, 78)
const almostMaximizedFrame = frame('center', 90, 90)
const maximizedHeightFrame = frame('center', 70, 100)
const maximizedWidthFrame = frame('center', 100, 70)
const leftHalfFrame = frame('left', 50, 100)
const rightHalfFrame = frame('right', 50, 100)
const topHalfFrame = frame('top', 100, 50)
const bottomHalfFrame = frame('bottom', 100, 50)
const leftThirdFrame = frame('left', 33.333, 100)
const centerThirdFrame = frame('center', 33.333, 100)
const rightThirdFrame = frame('right', 33.333, 100)
const leftTwoThirdsFrame = frame('left', 66.667, 100)
const rightTwoThirdsFrame = frame('right', 66.667, 100)
const topLeftQuarterFrame = frame('top-left', 50, 50)
const topRightQuarterFrame = frame('top-right', 50, 50)
const bottomLeftQuarterFrame = frame('bottom-left', 50, 50)
const bottomRightQuarterFrame = frame('bottom-right', 50, 50)
const leftSixthFrame = frame('left', 16.667, 100)
const rightSixthFrame = frame('right', 16.667, 100)

const horizontalHalfCycle: CommandCycleRule = {
  resetMs: FRAME_CYCLE_RESET_MS,
  scope: 'window',
  steps: [leftHalfFrame, leftTwoThirdsFrame, leftThirdFrame],
}
const rightHalfCycle: CommandCycleRule = {
  resetMs: FRAME_CYCLE_RESET_MS,
  scope: 'window',
  steps: [rightHalfFrame, rightTwoThirdsFrame, rightThirdFrame],
}

export const BUILT_IN_WINDOW_MANAGEMENT_COMMANDS = [
  builtInCommand({
    aliases: ['close tab', 'close surface', 'remove surface'],
    capabilityPredicate: 'active-surface-can-close',
    icon: 'x',
    id: CLOSE_ACTIVE_SURFACE_COMMAND_ID,
    operation: 'closeSurface',
    title: 'Close Active Surface',
  }),
  builtInCommand({
    aliases: ['hide surface', 'send to background', 'background tab'],
    capabilityPredicate: 'active-surface-can-background',
    icon: 'minus',
    id: BACKGROUND_ACTIVE_SURFACE_COMMAND_ID,
    operation: 'moveSurface',
    title: 'Send Active Surface To Background',
  }),
  builtInCommand({
    aliases: ['full screen', 'zoom window', 'fill screen'],
    capabilityPredicate: 'active-window',
    icon: 'maximize',
    id: FULLSCREEN_ACTIVE_WINDOW_COMMAND_ID,
    operation: 'fullscreenWindow',
    title: 'Fullscreen Active Window',
  }),
  builtInCommand({
    aliases: ['fullscreen', 'zoom window', 'fill workbench'],
    capabilityPredicate: 'active-window',
    icon: 'maximize',
    id: MAXIMIZE_ACTIVE_WINDOW_COMMAND_ID,
    operation: 'maximizeWindow',
    title: 'Maximize Active Window',
  }),
  builtInFrameCommand({
    aliases: ['almost full screen', 'nearly maximize'],
    frame: almostMaximizedFrame,
    icon: 'maximize',
    id: ALMOST_MAXIMIZE_ACTIVE_WINDOW_COMMAND_ID,
    title: 'Almost Maximize Active Window',
  }),
  builtInFrameCommand({
    aliases: ['maximize vertical', 'full height'],
    frame: maximizedHeightFrame,
    icon: 'panel-top',
    id: MAXIMIZE_ACTIVE_WINDOW_HEIGHT_COMMAND_ID,
    title: 'Maximize Active Window Height',
  }),
  builtInFrameCommand({
    aliases: ['maximize horizontal', 'full width'],
    frame: maximizedWidthFrame,
    icon: 'panel-left',
    id: MAXIMIZE_ACTIVE_WINDOW_WIDTH_COMMAND_ID,
    title: 'Maximize Active Window Width',
  }),
  builtInCommand({
    aliases: ['unmaximize', 'normal window', 'restore size', 'exit fullscreen'],
    capabilityPredicate: 'active-window',
    icon: 'restore',
    id: RESTORE_ACTIVE_WINDOW_COMMAND_ID,
    operation: 'restoreWindow',
    title: 'Restore Active Window',
  }),
  builtInFrameCommand({
    aliases: ['default size', 'sensible size'],
    frame: reasonableFrame,
    icon: 'square',
    id: REASONABLE_SIZE_ACTIVE_WINDOW_COMMAND_ID,
    title: 'Reasonable Size Active Window',
  }),
  builtInFrameCommand({
    aliases: ['center window', 'middle'],
    frame: centerFrame,
    icon: 'crosshair',
    id: CENTER_ACTIVE_WINDOW_COMMAND_ID,
    title: 'Center Active Window',
  }),
  builtInFrameCommand({
    aliases: ['left half', 'left 1/2'],
    cycleRule: horizontalHalfCycle,
    frame: leftHalfFrame,
    icon: 'panel-left',
    id: LEFT_HALF_ACTIVE_WINDOW_COMMAND_ID,
    title: 'Left Half Active Window',
  }),
  builtInFrameCommand({
    aliases: ['right half', 'right 1/2'],
    cycleRule: rightHalfCycle,
    frame: rightHalfFrame,
    icon: 'panel-right',
    id: RIGHT_HALF_ACTIVE_WINDOW_COMMAND_ID,
    title: 'Right Half Active Window',
  }),
  builtInFrameCommand({
    aliases: ['top half', 'top 1/2'],
    frame: topHalfFrame,
    icon: 'panel-top',
    id: TOP_HALF_ACTIVE_WINDOW_COMMAND_ID,
    title: 'Top Half Active Window',
  }),
  builtInFrameCommand({
    aliases: ['bottom half', 'bottom 1/2'],
    frame: bottomHalfFrame,
    icon: 'panel-bottom',
    id: BOTTOM_HALF_ACTIVE_WINDOW_COMMAND_ID,
    title: 'Bottom Half Active Window',
  }),
  builtInFrameCommand({
    aliases: ['left third', 'left 1/3'],
    frame: leftThirdFrame,
    icon: 'panel-left',
    id: LEFT_THIRD_ACTIVE_WINDOW_COMMAND_ID,
    title: 'Left Third Active Window',
  }),
  builtInFrameCommand({
    aliases: ['center third', 'middle third', 'center 1/3'],
    frame: centerThirdFrame,
    icon: 'columns',
    id: CENTER_THIRD_ACTIVE_WINDOW_COMMAND_ID,
    title: 'Center Third Active Window',
  }),
  builtInFrameCommand({
    aliases: ['right third', 'right 1/3'],
    frame: rightThirdFrame,
    icon: 'panel-right',
    id: RIGHT_THIRD_ACTIVE_WINDOW_COMMAND_ID,
    title: 'Right Third Active Window',
  }),
  builtInFrameCommand({
    aliases: ['left two thirds', 'left 2/3'],
    frame: leftTwoThirdsFrame,
    icon: 'panel-left',
    id: LEFT_TWO_THIRDS_ACTIVE_WINDOW_COMMAND_ID,
    title: 'Left Two Thirds Active Window',
  }),
  builtInFrameCommand({
    aliases: ['right two thirds', 'right 2/3'],
    frame: rightTwoThirdsFrame,
    icon: 'panel-right',
    id: RIGHT_TWO_THIRDS_ACTIVE_WINDOW_COMMAND_ID,
    title: 'Right Two Thirds Active Window',
  }),
  builtInFrameCommand({
    aliases: ['top left quarter', 'top left fourth'],
    frame: topLeftQuarterFrame,
    icon: 'panel-top',
    id: TOP_LEFT_QUARTER_ACTIVE_WINDOW_COMMAND_ID,
    title: 'Top Left Quarter Active Window',
  }),
  builtInFrameCommand({
    aliases: ['top right quarter', 'top right fourth'],
    frame: topRightQuarterFrame,
    icon: 'panel-top',
    id: TOP_RIGHT_QUARTER_ACTIVE_WINDOW_COMMAND_ID,
    title: 'Top Right Quarter Active Window',
  }),
  builtInFrameCommand({
    aliases: ['bottom left quarter', 'bottom left fourth'],
    frame: bottomLeftQuarterFrame,
    icon: 'panel-bottom',
    id: BOTTOM_LEFT_QUARTER_ACTIVE_WINDOW_COMMAND_ID,
    title: 'Bottom Left Quarter Active Window',
  }),
  builtInFrameCommand({
    aliases: ['bottom right quarter', 'bottom right fourth'],
    frame: bottomRightQuarterFrame,
    icon: 'panel-bottom',
    id: BOTTOM_RIGHT_QUARTER_ACTIVE_WINDOW_COMMAND_ID,
    title: 'Bottom Right Quarter Active Window',
  }),
  builtInFrameCommand({
    aliases: ['left sixth', 'left 1/6'],
    frame: leftSixthFrame,
    icon: 'panel-left',
    id: LEFT_SIXTH_ACTIVE_WINDOW_COMMAND_ID,
    title: 'Left Sixth Active Window',
  }),
  builtInFrameCommand({
    aliases: ['right sixth', 'right 1/6'],
    frame: rightSixthFrame,
    icon: 'panel-right',
    id: RIGHT_SIXTH_ACTIVE_WINDOW_COMMAND_ID,
    title: 'Right Sixth Active Window',
  }),
  builtInCommand({
    aliases: ['collapse window', 'fold window', 'accordion'],
    capabilityPredicate: 'active-window-can-collapse',
    icon: 'minus',
    id: COLLAPSE_ACTIVE_WINDOW_COMMAND_ID,
    operation: 'collapseWindow',
    title: 'Collapse Active Window',
  }),
  builtInCommand({
    aliases: ['expand window', 'unfold window', 'show window'],
    capabilityPredicate: 'active-window-can-expand',
    icon: 'arrows-out',
    id: EXPAND_ACTIVE_WINDOW_COMMAND_ID,
    operation: 'expandWindow',
    title: 'Expand Active Window',
  }),
  builtInCommand({
    aliases: ['split left', 'new pane left'],
    capabilityPredicate: 'active-window-and-splittable-surface',
    icon: 'panel-left',
    id: SPLIT_ACTIVE_WINDOW_LEFT_COMMAND_ID,
    operation: 'splitWindow',
    title: 'Split Active Window Left',
  }),
  builtInCommand({
    aliases: ['split right', 'new pane right'],
    capabilityPredicate: 'active-window-and-splittable-surface',
    icon: 'panel-right',
    id: SPLIT_ACTIVE_WINDOW_RIGHT_COMMAND_ID,
    operation: 'splitWindow',
    title: 'Split Active Window Right',
  }),
  builtInCommand({
    aliases: ['split up', 'new pane above'],
    capabilityPredicate: 'active-window-and-splittable-surface',
    icon: 'panel-top',
    id: SPLIT_ACTIVE_WINDOW_TOP_COMMAND_ID,
    operation: 'splitWindow',
    title: 'Split Active Window Top',
  }),
  builtInCommand({
    aliases: ['split down', 'new pane below'],
    capabilityPredicate: 'active-window-and-splittable-surface',
    icon: 'panel-bottom',
    id: SPLIT_ACTIVE_WINDOW_BOTTOM_COMMAND_ID,
    operation: 'splitWindow',
    title: 'Split Active Window Bottom',
  }),
  builtInCommand({
    aliases: ['move surface left', 'surface left'],
    capabilityPredicate: 'active-surface-can-move',
    icon: 'arrow-left',
    id: MOVE_ACTIVE_SURFACE_LEFT_COMMAND_ID,
    operation: 'moveSurface',
    title: 'Move Active Surface Left',
  }),
  builtInCommand({
    aliases: ['move surface right', 'surface right'],
    capabilityPredicate: 'active-surface-can-move',
    icon: 'arrow-right',
    id: MOVE_ACTIVE_SURFACE_RIGHT_COMMAND_ID,
    operation: 'moveSurface',
    title: 'Move Active Surface Right',
  }),
  builtInCommand({
    aliases: ['move surface up', 'surface top'],
    capabilityPredicate: 'active-surface-can-move',
    icon: 'arrow-up',
    id: MOVE_ACTIVE_SURFACE_TOP_COMMAND_ID,
    operation: 'moveSurface',
    title: 'Move Active Surface Top',
  }),
  builtInCommand({
    aliases: ['move surface down', 'surface bottom'],
    capabilityPredicate: 'active-surface-can-move',
    icon: 'arrow-down',
    id: MOVE_ACTIVE_SURFACE_BOTTOM_COMMAND_ID,
    operation: 'moveSurface',
    title: 'Move Active Surface Bottom',
  }),
  builtInCommand({
    aliases: ['send to background', 'hide active surface', 'scratchpad'],
    capabilityPredicate: 'active-surface-can-background',
    icon: 'panel-bottom-close',
    id: MOVE_ACTIVE_SURFACE_TO_BACKGROUND_COMMAND_ID,
    operation: 'moveSurface',
    title: 'Move Active Surface To Background',
  }),
  builtInCommand({
    aliases: ['move window left', 'root edge left', 'left side'],
    capabilityPredicate: 'active-window',
    icon: 'arrow-left-to-line',
    id: MOVE_ACTIVE_WINDOW_LEFT_COMMAND_ID,
    operation: 'moveWindow',
    title: 'Move Active Window Left',
  }),
  builtInCommand({
    aliases: ['move window right', 'root edge right', 'right side'],
    capabilityPredicate: 'active-window',
    icon: 'arrow-right-to-line',
    id: MOVE_ACTIVE_WINDOW_RIGHT_COMMAND_ID,
    operation: 'moveWindow',
    title: 'Move Active Window Right',
  }),
  builtInCommand({
    aliases: ['move window up', 'root edge top', 'top side'],
    capabilityPredicate: 'active-window',
    icon: 'arrow-up-to-line',
    id: MOVE_ACTIVE_WINDOW_TOP_COMMAND_ID,
    operation: 'moveWindow',
    title: 'Move Active Window Top',
  }),
  builtInCommand({
    aliases: ['move window down', 'root edge bottom', 'bottom side'],
    capabilityPredicate: 'active-window',
    icon: 'arrow-down-to-line',
    id: MOVE_ACTIVE_WINDOW_BOTTOM_COMMAND_ID,
    operation: 'moveWindow',
    title: 'Move Active Window Bottom',
  }),
  builtInCommand({
    aliases: ['move to next monitor', 'next display'],
    capabilityPredicate: 'display-movement-unavailable',
    icon: 'monitor',
    id: MOVE_ACTIVE_WINDOW_NEXT_DISPLAY_COMMAND_ID,
    operation: 'moveWindow',
    title: 'Move Active Window To Next Display',
  }),
  builtInCommand({
    aliases: ['move to previous monitor', 'previous display'],
    capabilityPredicate: 'display-movement-unavailable',
    icon: 'monitor',
    id: MOVE_ACTIVE_WINDOW_PREVIOUS_DISPLAY_COMMAND_ID,
    operation: 'moveWindow',
    title: 'Move Active Window To Previous Display',
  }),
  builtInCommand({
    aliases: ['focus left', 'window left'],
    capabilityPredicate: 'active-window',
    icon: 'arrow-left',
    id: FOCUS_WINDOW_LEFT_COMMAND_ID,
    operation: 'activateSurface',
    title: 'Focus Window Left',
  }),
  builtInCommand({
    aliases: ['focus right', 'window right'],
    capabilityPredicate: 'active-window',
    icon: 'arrow-right',
    id: FOCUS_WINDOW_RIGHT_COMMAND_ID,
    operation: 'activateSurface',
    title: 'Focus Window Right',
  }),
  builtInCommand({
    aliases: ['focus up', 'focus top'],
    capabilityPredicate: 'active-window',
    icon: 'arrow-up',
    id: FOCUS_WINDOW_TOP_COMMAND_ID,
    operation: 'activateSurface',
    title: 'Focus Window Top',
  }),
  builtInCommand({
    aliases: ['focus down', 'focus bottom'],
    capabilityPredicate: 'active-window',
    icon: 'arrow-down',
    id: FOCUS_WINDOW_BOTTOM_COMMAND_ID,
    operation: 'activateSurface',
    title: 'Focus Window Bottom',
  }),
  builtInCommand({
    aliases: ['focus parent', 'enclosing split'],
    capabilityPredicate: 'active-window',
    icon: 'corner-up-left',
    id: FOCUS_PARENT_SPLIT_COMMAND_ID,
    operation: 'activateSurface',
    title: 'Focus Parent Split',
  }),
  builtInCommand({
    aliases: ['focus child', 'focus active surface'],
    capabilityPredicate: 'active-window',
    icon: 'corner-down-right',
    id: FOCUS_ACTIVE_CHILD_COMMAND_ID,
    operation: 'activateSurface',
    title: 'Focus Active Child',
  }),
  builtInCommand({
    aliases: ['focus rail', 'focus activity bar'],
    capabilityPredicate: 'rail-available',
    icon: 'sidebar',
    id: FOCUS_RAIL_COMMAND_ID,
    operation: 'activateSurface',
    title: 'Focus Rail',
  }),
  builtInCommand({
    aliases: ['previous surface', 'restore previous window'],
    capabilityPredicate: 'active-window',
    icon: 'history',
    id: RESTORE_PREVIOUS_SURFACE_COMMAND_ID,
    operation: 'activateSurface',
    title: 'Restore Previous Surface',
  }),
  builtInCommand({
    aliases: ['next tab', 'next surface'],
    capabilityPredicate: 'active-window',
    icon: 'arrow-right',
    id: NEXT_SURFACE_IN_WINDOW_COMMAND_ID,
    operation: 'activateSurface',
    title: 'Next Surface In Window',
  }),
  builtInCommand({
    aliases: ['previous tab', 'previous surface'],
    capabilityPredicate: 'active-window',
    icon: 'arrow-left',
    id: PREVIOUS_SURFACE_IN_WINDOW_COMMAND_ID,
    operation: 'activateSurface',
    title: 'Previous Surface In Window',
  }),
  builtInCommand({
    aliases: ['move tab left', 'reorder tab left'],
    capabilityPredicate: 'active-window',
    icon: 'arrow-left',
    id: REORDER_ACTIVE_SURFACE_LEFT_COMMAND_ID,
    operation: 'reorderSurface',
    title: 'Reorder Active Surface Left',
  }),
  builtInCommand({
    aliases: ['move tab right', 'reorder tab right'],
    capabilityPredicate: 'active-window',
    icon: 'arrow-right',
    id: REORDER_ACTIVE_SURFACE_RIGHT_COMMAND_ID,
    operation: 'reorderSurface',
    title: 'Reorder Active Surface Right',
  }),
  builtInCommand({
    aliases: ['tear tab', 'detach tab', 'new window from tab'],
    capabilityPredicate: 'active-window',
    icon: 'external-link',
    id: TEAR_ACTIVE_SURFACE_RIGHT_COMMAND_ID,
    operation: 'moveSurface',
    title: 'Tear Active Surface Right',
  }),
  builtInCommand({
    aliases: ['merge tab left', 'tab into left window'],
    capabilityPredicate: 'active-window',
    icon: 'panel-left',
    id: TAB_ACTIVE_SURFACE_LEFT_COMMAND_ID,
    operation: 'tabSurface',
    title: 'Tab Active Surface Into Left Window',
  }),
  builtInCommand({
    aliases: ['merge tab right', 'tab into right window'],
    capabilityPredicate: 'active-window',
    icon: 'panel-right',
    id: TAB_ACTIVE_SURFACE_RIGHT_COMMAND_ID,
    operation: 'tabSurface',
    title: 'Tab Active Surface Into Right Window',
  }),
  builtInCommand({
    aliases: ['resize left', 'shrink or grow left'],
    capabilityPredicate: 'active-window',
    icon: 'arrow-left-right',
    id: RESIZE_ACTIVE_SPLIT_LEFT_COMMAND_ID,
    operation: 'resizeSplit',
    title: 'Resize Active Split Left',
  }),
  builtInCommand({
    aliases: ['resize right', 'shrink or grow right'],
    capabilityPredicate: 'active-window',
    icon: 'arrow-left-right',
    id: RESIZE_ACTIVE_SPLIT_RIGHT_COMMAND_ID,
    operation: 'resizeSplit',
    title: 'Resize Active Split Right',
  }),
  builtInCommand({
    aliases: ['resize up', 'resize top'],
    capabilityPredicate: 'active-window',
    icon: 'arrow-up-down',
    id: RESIZE_ACTIVE_SPLIT_TOP_COMMAND_ID,
    operation: 'resizeSplit',
    title: 'Resize Active Split Top',
  }),
  builtInCommand({
    aliases: ['resize down', 'resize bottom'],
    capabilityPredicate: 'active-window',
    icon: 'arrow-up-down',
    id: RESIZE_ACTIVE_SPLIT_BOTTOM_COMMAND_ID,
    operation: 'resizeSplit',
    title: 'Resize Active Split Bottom',
  }),
] as const satisfies readonly BuiltInWindowManagementCommand[]

export function builtInWindowManagementCommands(): readonly BuiltInWindowManagementCommand[] {
  return BUILT_IN_WINDOW_MANAGEMENT_COMMANDS
}

export function customCommandForBuiltInFrameCommand(
  command: BuiltInWindowManagementCommand,
): CustomWindowManagementCommand | null {
  if (!command.frame) return null

  return {
    aliases: command.aliases,
    category: command.category,
    cycleRule: command.cycleRule,
    enabled: true,
    icon: command.icon,
    id: command.id,
    kind: 'custom-window',
    targetFrame: command.frame,
    title: command.title,
  }
}

export function mergeWindowManagementCommands(
  customCommands: readonly WindowManagementCommand[],
): readonly WindowManagementCommand[] {
  const commandsById = new Map<string, WindowManagementCommand>()

  for (const command of BUILT_IN_WINDOW_MANAGEMENT_COMMANDS) {
    commandsById.set(command.id, command)
  }
  for (const command of customCommands) {
    commandsById.set(command.id, command)
  }

  return Array.from(commandsById.values())
}

export function commandAliasSearchMetadata(command: WindowManagementCommand): readonly string[] {
  return uniqueSearchTerms([command.title, command.id, command.kind, ...command.aliases])
}

export function commandSearchText(command: WindowManagementCommand): string {
  return commandAliasSearchMetadata(command).join(' ')
}

export function commandMatchesSearch(command: WindowManagementCommand, query: string): boolean {
  const normalizedQuery = normalizedSearchTerm(query)
  if (!normalizedQuery) return true

  return commandSearchText(command).includes(normalizedQuery)
}

function builtInFrameCommand({
  aliases,
  cycleRule,
  frame,
  icon,
  id,
  title,
}: {
  readonly aliases: readonly string[]
  readonly cycleRule?: CommandCycleRule
  readonly frame: CustomWindowFrame
  readonly icon: string
  readonly id: BuiltInWindowManagementCommand['id']
  readonly title: string
}): BuiltInWindowManagementCommand {
  return builtInCommand({
    aliases,
    capabilityPredicate: 'active-window',
    cycleRule,
    frame,
    icon,
    id,
    operation: 'applyCustomWindowCommand',
    title,
  })
}

function builtInCommand({
  aliases,
  capabilityPredicate,
  cycleRule,
  frame,
  icon,
  id,
  operation,
  title,
}: {
  readonly aliases: readonly string[]
  readonly capabilityPredicate: string
  readonly cycleRule?: CommandCycleRule
  readonly frame?: CustomWindowFrame
  readonly icon: string
  readonly id: BuiltInWindowManagementCommand['id']
  readonly operation: LayoutOperation['type']
  readonly title: string
}): BuiltInWindowManagementCommand {
  return {
    aliases,
    capabilityPredicate,
    category: WINDOW_MANAGEMENT_CATEGORY,
    cycleRule,
    frame,
    icon,
    id,
    kind: 'built-in',
    operation,
    title,
  }
}

function frame(
  anchor: CustomWindowFrame['anchor'],
  width: number,
  height: number,
): CustomWindowFrame {
  return {
    anchor,
    height,
    offsetX: 0,
    offsetY: 0,
    unit: 'percent',
    width,
  }
}

function uniqueSearchTerms(terms: readonly string[]) {
  return Array.from(new Set(terms.map(normalizedSearchTerm).filter(Boolean)))
}

function normalizedSearchTerm(term: string) {
  return term.trim().toLowerCase()
}
