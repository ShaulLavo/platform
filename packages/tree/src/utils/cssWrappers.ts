const LAYER_ORDER = `@layer base, unsafe;`

export function wrapCoreCSS(coreCSS: string): string {
  return `${LAYER_ORDER}
@layer base {
  ${coreCSS}
}`
}

export function wrapUnsafeCSS(unsafeCSS: string): string {
  return `${LAYER_ORDER}
@layer unsafe {
  ${unsafeCSS}
}`
}
