import type { SettingsValues } from '@workspace/contracts'

export type FilePickerDensity = SettingsValues['workbench.density']

export type FilePickerDensityMetrics = {
  entryRowSize: number
  entryWithPathRowSize: number
  headerSize: number
  sectionRowSize: number
}

const FILE_PICKER_DENSITY_METRICS = {
  compact: {
    entryRowSize: 26,
    entryWithPathRowSize: 38,
    headerSize: 26,
    sectionRowSize: 22,
  },
  cozy: {
    entryRowSize: 32,
    entryWithPathRowSize: 44,
    headerSize: 32,
    sectionRowSize: 26,
  },
} as const satisfies Record<FilePickerDensity, FilePickerDensityMetrics>

export function filePickerDensityMetrics(density: FilePickerDensity): FilePickerDensityMetrics {
  return FILE_PICKER_DENSITY_METRICS[density]
}
