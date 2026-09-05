import { healthDescriptorSchema } from '@workspace/contracts'
import * as v from 'valibot'
import { createEndpointClient } from '@/lib/environments/state/endpoint-client'
import { createInProcessClient, createObservedInProcessClient } from '../../../../test/client'
import { makeTestServer } from '../../../../test/server'
import { expect, test } from '../../../../test/fixtures'

test('endpoint replacement preserves client identity and captures a request before awaiting its response', async ({
  server,
}) => {
  const replacement = await makeTestServer({ filesystemWatch: false })
  const gate = Promise.withResolvers<void>()
  const started = Promise.withResolvers<void>()
  const original = createObservedInProcessClient(server, async (request) => {
    if (new URL(request.url).pathname !== '/health') return
    started.resolve()
    await gate.promise
  })
  const next = createInProcessClient(replacement)
  let endpoint = 'http://localhost:39801'
  const client = createEndpointClient({
    origin: endpoint,
    resolveEndpoint: () => endpoint,
    createClient: (origin) => (origin.endsWith('39801') ? original : next),
  })
  try {
    const pending = client.health.get()
    await started.promise
    endpoint = 'http://localhost:39802'
    const later = await client.health.get()
    gate.resolve()
    const earlier = await pending
    expect(v.parse(healthDescriptorSchema, earlier.data).environmentId).not.toBe(
      v.parse(healthDescriptorSchema, later.data).environmentId,
    )
    expect(v.parse(healthDescriptorSchema, later.data).environmentId).toBe(
      v.parse(healthDescriptorSchema, (await next.health.get()).data).environmentId,
    )
  } finally {
    gate.resolve()
    await replacement.cleanup()
  }
})
