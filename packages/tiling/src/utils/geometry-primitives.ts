import type { LayoutRect } from '@workspace/tiling/utils/layout-geometry'

export type PointerCoordinates = {
  readonly x: number
  readonly y: number
}

export type PointerTravel = {
  readonly horizontal: 'left' | 'none' | 'right'
  readonly vertical: 'down' | 'none' | 'up'
}

export function balancedSizes(count: number) {
  if (count <= 0) return []

  return Array.from({ length: count }, () => 1 / count)
}

export function clampIndex(index: number, length: number) {
  return Math.max(0, Math.min(index, length))
}

export function distanceFromRange(value: number, min: number, max: number) {
  if (value < min) return min - value
  if (value > max) return value - max

  return 0
}

export function formatPoint(point: PointerCoordinates) {
  return `${Math.round(point.x)},${Math.round(point.y)}`
}

export function inflateRect(rect: LayoutRect, amount: number): LayoutRect {
  return {
    height: rect.height + amount * 2,
    width: rect.width + amount * 2,
    x: rect.x - amount,
    y: rect.y - amount,
  }
}

export function clampPointToRect(rect: LayoutRect, point: PointerCoordinates): PointerCoordinates {
  return {
    x: Math.min(Math.max(point.x, rect.x), rect.x + rect.width),
    y: Math.min(Math.max(point.y, rect.y), rect.y + rect.height),
  }
}

export function pointInRect(rect: LayoutRect, point: PointerCoordinates) {
  if (point.x < rect.x) return false
  if (point.x > rect.x + rect.width) return false
  if (point.y < rect.y) return false
  if (point.y > rect.y + rect.height) return false

  return true
}

export function rectArea(rect: LayoutRect) {
  return rect.width * rect.height
}

export function rectCenterDistance(rect: LayoutRect, point: PointerCoordinates) {
  const centerX = rect.x + rect.width / 2
  const centerY = rect.y + rect.height / 2

  return Math.hypot(point.x - centerX, point.y - centerY)
}
