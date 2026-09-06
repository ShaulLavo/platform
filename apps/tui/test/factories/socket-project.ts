import { commandIdSchema, worktreeIdSchema } from '@workspace/contracts'
import * as v from 'valibot'
import { createTestRpcClient } from './rpc-client'
import type { TestServer } from '../server'

export async function createSocketProject(server: TestServer) {
  const { rpc } = createTestRpcClient({ server })
  try {
    const registration = await rpc.dispatchCommand({
      commandId: v.parse(commandIdSchema, 'socket-fixture-create-project'),
      defaultModelSelection: null,
      title: 'Socket fixture',
      type: 'project.create',
      workspaceRoot: server.root,
    })
    return v.parse(v.object({ worktreeId: worktreeIdSchema }), registration.result)
  } finally {
    rpc.close()
  }
}
