import { ptyErrors } from './structured-errors'
import type { SpawnPtyOptions } from './types'

export function validateDimensions(cols: number, rows: number) {
  if (validDimension(cols) && validDimension(rows)) return
  throw ptyErrors.INVALID_OPTIONS({ message: 'Invalid terminal dimensions.' })
}

export function validateOptions(options: SpawnPtyOptions) {
  if (!options.command[0] || options.command.some((part) => part.includes('\0'))) {
    throw ptyErrors.INVALID_OPTIONS({ message: 'Invalid terminal command.' })
  }
  validateDimensions(options.cols ?? 80, options.rows ?? 24)
}

function validDimension(value: number) {
  return Number.isInteger(value) && value > 0 && value <= 65_535
}
