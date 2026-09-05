import { isRecord, orchestrationWsClientMessageSchema } from '@workspace/contracts'
import * as v from 'valibot'
import { expect } from '../fixtures'
import type { TestServer } from '../server'
import { FakeOrchestrationSocket } from './orchestration-socket'

export function inProcessOrchestrationSocketFactory(server: TestServer) {
  const hooks: unknown = server.app.routes.find(
    (route) => route.path === '/orchestration/rpc',
  )?.hooks
  if (
    !isRecord(hooks) ||
    typeof hooks.open !== 'function' ||
    typeof hooks.message !== 'function' ||
    typeof hooks.close !== 'function'
  ) {
    return expect.unreachable('The real server must expose orchestration WebSocket handlers.')
  }
  const onOpen = hooks.open
  const onMessage = hooks.message
  const onClose = hooks.close

  return (_url: string): WebSocket => {
    const socket = new FakeOrchestrationSocket()
    const peer = {
      raw: {},
      data: { headers: { origin: server.origin } },
      send: (message: string) => socket.deliver(JSON.parse(message)),
      close: (code = 1000) => socket.serverClose({ code, wasClean: true }),
    }
    const close = socket.close.bind(socket)
    socket.close = () => {
      if (socket.closed) return
      Reflect.apply(onClose, undefined, [peer])
      close()
    }
    socket.send = (raw: string) => {
      const message = v.parse(orchestrationWsClientMessageSchema, JSON.parse(raw))
      Reflect.apply(onMessage, undefined, [peer, message])
    }
    setTimeout(() => {
      if (socket.closed) return
      socket.open(false)
      Reflect.apply(onOpen, undefined, [peer])
    }, 0)
    return socket as unknown as WebSocket
  }
}
