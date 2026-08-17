import { logRowClickMovementTolerancePx } from '@/features/logs/utils/row-layout'

export type LogRowPointerStart = {
  x: number
  y: number
} | null

export function logRowPointerStart(event: { clientX: number; clientY: number }) {
  return { x: event.clientX, y: event.clientY }
}

export function shouldToggleLogRow(
  event: { clientX: number; clientY: number },
  pointerStart: LogRowPointerStart,
) {
  if (isClickMovement(event, pointerStart)) return true

  return false
}

export function shouldToggleLogRowKey(key: string) {
  return key === 'Enter' || key === ' '
}

function isClickMovement(
  event: { clientX: number; clientY: number },
  pointerStart: LogRowPointerStart,
) {
  if (!pointerStart) return true

  const movedX = Math.abs(event.clientX - pointerStart.x)
  const movedY = Math.abs(event.clientY - pointerStart.y)

  return movedX <= logRowClickMovementTolerancePx && movedY <= logRowClickMovementTolerancePx
}
