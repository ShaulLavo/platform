import { Elysia } from 'elysia'

import { errorPayload, FsError } from '../fs/errors'
import { fontBatchBodySchema, fontNameParamsSchema, fontPreviewQuerySchema } from './contracts'
import { NerdFontService, type FontService } from './service'

export function fontRoutes(fonts: FontService = new NerdFontService()) {
  return new Elysia({ name: 'font-routes' }).group('/fonts', (app) =>
    app
      .get('', () => fonts.getNerdFontLinks())
      .get(
        '/:name/preview',
        async ({ params, query, set }) => {
          const subset = await fonts.getPreviewSubset(params.name, query.text)
          if (!subset) return fontNotFound(set)

          return fontResponse(subset, 'font/woff2', 'public, max-age=86400')
        },
        {
          params: fontNameParamsSchema,
          query: fontPreviewQuerySchema,
        },
      )
      .get(
        '/:name',
        async ({ params, set }) => {
          const font = await fonts.getExtractedFont(params.name)
          if (!font) return fontNotFound(set)

          return fontResponse(font, 'font/ttf', 'public, max-age=31536000, immutable')
        },
        {
          params: fontNameParamsSchema,
        },
      )
      .post(
        '/batch',
        async ({ body }) => {
          const fontsByName = await fonts.getBatchFonts(body.names)

          return Object.fromEntries(
            Object.entries(fontsByName).map(([name, data]) => [
              name,
              data ? Buffer.from(data).toString('base64') : null,
            ]),
          )
        },
        {
          body: fontBatchBodySchema,
        },
      ),
  )
}

function fontResponse(data: Buffer, contentType: string, cacheControl: string) {
  return new Response(new Uint8Array(data), {
    headers: {
      'cache-control': cacheControl,
      'content-length': String(data.byteLength),
      'content-type': contentType,
    },
  })
}

function fontNotFound(set: { status?: number | string }) {
  set.status = 404
  return errorPayload(new FsError('NOT_FOUND', 'font not found'))
}
