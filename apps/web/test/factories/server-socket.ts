export class RecordingServerSocket extends EventTarget {
  static readonly CONNECTING = 0
  static readonly OPEN = 1
  static readonly CLOSING = 2
  static readonly CLOSED = 3
  static readonly opened: RecordingServerSocket[] = []

  readonly url: string
  readyState = RecordingServerSocket.OPEN
  binaryType: BinaryType = 'blob'
  readonly sent: unknown[] = []

  constructor(url: string | URL) {
    super()
    this.url = String(url)
    RecordingServerSocket.opened.push(this)
  }

  send(value: unknown) {
    this.sent.push(value)
  }

  close(code = 1000, reason = '') {
    this.readyState = RecordingServerSocket.CLOSED
    this.dispatchEvent(new CloseEvent('close', { code, reason, wasClean: true }))
  }
}
