import { describe, expect, it } from 'vitest'
import { Elysia } from 'elysia'

import { fontRoutes } from '../routes'
import type { FontService } from '../service'

describe('fontRoutes', () => {
  it('returns available Nerd Font links', async () => {
    const app = testApp()

    const response = await app.handle(new Request('http://local/fonts'))

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      JetBrainsMono: 'https://example.test/JetBrainsMono.zip',
    })
  })

  it('returns full font binaries with long-lived cache headers', async () => {
    const app = testApp()

    const response = await app.handle(new Request('http://local/fonts/JetBrainsMono'))

    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('public, max-age=31536000, immutable')
    expect(response.headers.get('content-type')).toBe('font/ttf')
    expect(await response.text()).toBe('font-data')
  })

  it('returns preview subsets with short-lived cache headers', async () => {
    const app = testApp()

    const response = await app.handle(
      new Request('http://local/fonts/JetBrainsMono/preview?text=ABC'),
    )

    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('public, max-age=86400')
    expect(response.headers.get('content-type')).toBe('font/woff2')
    expect(await response.text()).toBe('preview-data:ABC')
  })

  it('returns structured not found errors', async () => {
    const app = testApp({ getExtractedFont: async () => null })

    const response = await app.handle(new Request('http://local/fonts/MissingFont'))

    expect(response.status).toBe(404)
    expect(await response.json()).toEqual({
      error: { code: 'NOT_FOUND', message: 'font not found' },
    })
  })

  it('returns base64 data for batch downloads', async () => {
    const app = testApp()

    const response = await app.handle(
      new Request('http://local/fonts/batch', {
        body: JSON.stringify({ names: ['JetBrainsMono', 'MissingFont'] }),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
      }),
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      JetBrainsMono: Buffer.from('font-data').toString('base64'),
      MissingFont: null,
    })
  })

  it('validates batch request bodies', async () => {
    const app = testApp()

    const response = await app.handle(
      new Request('http://local/fonts/batch', {
        body: JSON.stringify({ names: [] }),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
      }),
    )

    expect(response.status).toBe(422)
  })
})

function testApp(overrides: Partial<FontService> = {}) {
  return new Elysia().use(fontRoutes(Object.assign(testFontService(), overrides)))
}

function testFontService(): FontService {
  return {
    async getBatchFonts(fontNames) {
      return Object.fromEntries(
        fontNames.map((name) => [name, name === 'JetBrainsMono' ? Buffer.from('font-data') : null]),
      )
    },
    async getExtractedFont(fontName) {
      return fontName === 'JetBrainsMono' ? Buffer.from('font-data') : null
    },
    async getNerdFontLinks() {
      return {
        JetBrainsMono: 'https://example.test/JetBrainsMono.zip',
      }
    },
    async getPreviewSubset(fontName, previewText) {
      if (fontName !== 'JetBrainsMono') return null

      return Buffer.from(`preview-data:${previewText ?? 'default'}`)
    },
  }
}
