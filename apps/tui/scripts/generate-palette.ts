import { readFile, writeFile } from 'node:fs/promises'
import { transform } from 'lightningcss'
import { createClientError } from '@workspace/client-core/errors'

const source = await readFile(
  new URL('../../../packages/ui/src/styles/globals.css', import.meta.url),
  'utf8',
)
const output = new URL('../src/theme/palette.json', import.meta.url)
const tokens = {
  background: 'background-solid',
  card: 'card-solid',
  popover: 'popover-solid',
  muted: 'muted-solid',
  accent: 'accent-solid',
  primary: 'primary',
  primaryForeground: 'primary-foreground',
  foreground: 'foreground',
  mutedForeground: 'muted-foreground',
  border: 'border',
  destructive: 'destructive',
  info: 'info',
  success: 'success',
  warning: 'warning',
  diffAdded: 'diff-added',
  diffRemoved: 'diff-removed',
}
const light = declarations(':root')
const dark = { ...light, ...declarations('.dark') }
const result = {
  graphite: { light: palette(light), dark: palette(dark) },
  sage: {
    light: palette({ ...light, ...declarations("html[data-palette='sage']") }),
    dark: palette({ ...dark, ...declarations(".dark[data-palette='sage']") }),
  },
}
const generated = JSON.stringify(result, null, 2) + '\n'
if (process.argv.includes('--check')) {
  if ((await readFile(output, 'utf8')) !== generated) fail('Generated TUI palette is out of date.')
} else {
  await writeFile(output, generated)
}

function declarations(selector: string): Record<string, string> {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const block = source.match(new RegExp(`^${escaped} \\{([\\s\\S]*?)^\\}`, 'm'))?.[1]
  if (!block) return fail(`Missing CSS selector ${selector}.`)
  const css = block.replace(/\/\*[\s\S]*?\*\//g, '')
  return Object.fromEntries(
    [...css.matchAll(/--([\w-]+):\s*([^;]+);/g)].map((match) => [match[1], match[2]]),
  )
}

function palette(values: Record<string, string>) {
  const background = color(resolve('background-solid', values))
  return Object.fromEntries(
    Object.entries(tokens).map(([key, token]) => [
      key,
      composite(color(resolve(token, values)), background),
    ]),
  )
}

function resolve(
  token: string,
  values: Record<string, string>,
  visited = new Set<string>(),
): string {
  if (visited.has(token)) return fail(`Circular CSS token ${token}.`)
  visited.add(token)
  const value = values[token]
  if (!value) return fail(`Missing CSS token ${token}.`)
  const reference = value.match(/^var\(--([\w-]+)\)$/)?.[1]
  return reference ? resolve(reference, values, visited) : value
}

function color(value: string) {
  const converted = transform({
    filename: 'palette.css',
    code: Buffer.from(`a{color:${value}}`),
    targets: { chrome: 90 << 16 },
    minify: true,
  }).code.toString()
  const fallback = converted.match(/color:([^;}]+)/)?.[1]
  const rgba = fallback ? Bun.color(fallback, '[rgba]') : null
  if (!rgba) return fail(`Cannot convert CSS color ${value}.`)
  return rgba
}

function composite(
  [r, g, b, a]: readonly [number, number, number, number],
  [bgR, bgG, bgB]: readonly [number, number, number, number],
) {
  const alpha = a / 255
  const channels = [
    r * alpha + bgR * (1 - alpha),
    g * alpha + bgG * (1 - alpha),
    b * alpha + bgB * (1 - alpha),
  ].map(Math.round)
  return '#' + channels.map((channel) => channel.toString(16).padStart(2, '0')).join('')
}

function fail(message: string): never {
  throw createClientError({
    code: 'TUI_THEME_GENERATION_FAILED',
    message,
    status: 500,
    why: 'Terminal colors must derive from the shared UI tokens.',
    fix: 'Update the generator for the current CSS and run bun run theme:generate in apps/tui.',
  })
}
