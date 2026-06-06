import { mkdtemp, rm } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { NerdFontService, parseNerdFontLinks } from '../service'

type TestZip = {
  file(name: string, data: string | Buffer): TestZip
  generateAsync(options: { type: 'arraybuffer' }): Promise<ArrayBuffer>
}
type JSZipConstructor = new () => TestZip

const require = createRequire(import.meta.url)
const JSZip = require('jszip') as JSZipConstructor
const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

describe('NerdFontService', () => {
  it('parses Nerd Fonts download links from the downloads page', () => {
    const links = parseNerdFontLinks(`
      <a href="https://github.com/ryanoasis/nerd-fonts/releases/download/v3.4.0/JetBrainsMono.zip">Download</a>
      <a href="/not-a-font.txt">Download</a>
      <a href="https://github.com/ryanoasis/nerd-fonts/releases/download/v3.4.0/Bad%2FName.zip">Download</a>
      <a href="https://example.com/Ignored.zip">Docs</a>
    `)

    expect(links).toEqual({
      JetBrainsMono:
        'https://github.com/ryanoasis/nerd-fonts/releases/download/v3.4.0/JetBrainsMono.zip',
    })
  })

  it('reuses cached font links', async () => {
    const root = await fixtureRoot()
    const first = new NerdFontService({
      cacheRoot: root,
      fetcher: async () => new Response(downloadsHtml(['JetBrainsMono'])),
    })

    await expect(first.getNerdFontLinks()).resolves.toHaveProperty('JetBrainsMono')

    const second = new NerdFontService({
      cacheRoot: root,
      fetcher: async () => {
        throw new Error('cache miss')
      },
    })

    await expect(second.getNerdFontLinks()).resolves.toHaveProperty('JetBrainsMono')
  })

  it('extracts the regular font from a downloaded archive', async () => {
    const root = await fixtureRoot()
    const archive = await fontArchive()
    const service = new NerdFontService({
      cacheRoot: root,
      fetcher: async (input) => fontFetch(input, archive),
    })

    const font = await service.getExtractedFont('JetBrainsMono')

    expect(font?.toString()).toBe('regular-font')
  })

  it('rejects invalid font names before fetching', async () => {
    let fetchCount = 0
    const service = new NerdFontService({
      cacheRoot: await fixtureRoot(),
      fetcher: async () => {
        fetchCount += 1
        return new Response(downloadsHtml(['JetBrainsMono']))
      },
    })

    await expect(service.getExtractedFont('../JetBrainsMono')).resolves.toBeNull()
    expect(fetchCount).toBe(0)
  })

  it('keeps null entries for unavailable batch fonts', async () => {
    const service = new NerdFontService({
      cacheRoot: await fixtureRoot(),
      fetcher: async () => new Response(downloadsHtml([])),
    })

    await expect(service.getBatchFonts(['MissingFont'])).resolves.toEqual({
      MissingFont: null,
    })
  })

  it('caches preview subsets by font and preview text', async () => {
    let subsetCount = 0
    const service = new NerdFontService({
      cacheRoot: await fixtureRoot(),
      fetcher: async (input) => fontFetch(input, await fontArchive()),
      subsetter: async (font, text) => {
        subsetCount += 1
        return Buffer.from(`subset:${text}:${font.toString()}`)
      },
    })

    await expect(service.getPreviewSubset('JetBrainsMono', 'ABC')).resolves.toEqual(
      Buffer.from('subset:ABC:regular-font'),
    )
    await expect(service.getPreviewSubset('JetBrainsMono', 'ABC')).resolves.toEqual(
      Buffer.from('subset:ABC:regular-font'),
    )
    expect(subsetCount).toBe(1)
  })
})

async function fixtureRoot() {
  const root = await mkdtemp(path.join(tmpdir(), 'platform-fonts-'))
  roots.push(root)
  return root
}

async function fontArchive() {
  const zip = new JSZip()
  zip.file('JetBrainsMonoNerdFont-Bold.ttf', 'bold-font')
  zip.file('JetBrainsMonoNerdFont-Regular.ttf', 'regular-font')
  return zip.generateAsync({ type: 'arraybuffer' })
}

function fontFetch(input: string | URL | Request, archive: ArrayBuffer) {
  const url = String(input)
  if (url.includes('font-downloads'))
    return Promise.resolve(new Response(downloadsHtml(['JetBrainsMono'])))
  if (url.endsWith('/JetBrainsMono.zip')) return Promise.resolve(new Response(archive))

  throw new Error(`Unexpected fetch: ${url}`)
}

function downloadsHtml(names: readonly string[]) {
  return names
    .map(
      (name) =>
        `<a href="https://github.com/ryanoasis/nerd-fonts/releases/download/v3.4.0/${name}.zip">Download</a>`,
    )
    .join('\n')
}
