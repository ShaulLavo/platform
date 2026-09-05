import { QueryClient } from '@tanstack/react-query'
import { expect, test } from '../../../../test/fixtures'
import { registerEnvironmentQueryClient } from '@/lib/environments/state/query-clients'
import {
  wallpaperInfoQueryOptions,
  wallpaperMediaQueryOptions,
  wallpaperStillQueryOptions,
} from '@/features/workbench/state/wallpaper-query'

test('a remote workbench returns the bundled fallback without fetching remote wallpaper', async ({
  client,
}) => {
  const queryClient = new QueryClient()
  registerEnvironmentQueryClient(queryClient, 'http://localhost:39078', client)
  try {
    await expect(
      queryClient.fetchQuery(wallpaperInfoQueryOptions({ enabled: true })),
    ).resolves.toBe('image')
    await expect(queryClient.fetchQuery(wallpaperStillQueryOptions())).resolves.toBeNull()
    await expect(
      queryClient.fetchQuery(wallpaperMediaQueryOptions({ enabled: true })),
    ).resolves.toBeNull()
  } finally {
    queryClient.clear()
  }
})
