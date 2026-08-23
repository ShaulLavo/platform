import { expect, test } from '../../../../../test/fixtures'

import { filePickerDensityMetrics } from '@/features/file-picker/utils/density'

test('keeps compact and cozy file-list geometry explicit', () => {
  expect(filePickerDensityMetrics('compact')).toEqual({
    entryRowSize: 26,
    entryWithPathRowSize: 38,
    headerSize: 26,
    sectionRowSize: 22,
  })
  expect(filePickerDensityMetrics('cozy')).toEqual({
    entryRowSize: 32,
    entryWithPathRowSize: 44,
    headerSize: 32,
    sectionRowSize: 26,
  })
})
