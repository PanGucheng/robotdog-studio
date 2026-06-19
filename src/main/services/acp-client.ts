import { createInterface } from 'node:readline'
import type { Readable, Writable } from 'node:stream'

interface RpcError { code: number; message: string }
interface RpcFrame { jsonrpc?: string; id?: number; method?: string; params?: unknown; result?: unknown; error?: RpcError }
interface Pending { resolve: (value: unknown) => void; reject: (reason: Error) => void; timer: NodeJS.Timeout }

export class AcpClient {
  private nextId = 1
  private readonly pending = new Map<number, Pending>()
  private readonly notifications = new Set<(method: string, params: unknown) => void>()
  private readonly requests = new Map<string, (params: unknown) => Promise<unknown>>()
  private failure?: Error

  constructor(private readonly input: Writable, output: Readable, private readonly timeoutMs = 30_000) {
    const lines = createInterface({ input: output, crlfDelay: Infinity })
    lines.on('line', (line) => this.receive(line))
    lines.on('close', () => this.fail(new Error('ACP_CONNECTION_CLOSED')))
    output.on('error', (error) => this.fail(error))
  }

  onNotification(listener: (method: string, params: unknown) => void): () => void {
    this.notifications.add(listener)
    return () => this.notifications.delete(listener)
  }

  handleRequest(method: string, handler: (params: unknown) => Promise<unknown> | unknown): void {
    this.requests.set(method, async (params) => handler(params))
  }

  async request<T>(method: string, params: unknown, timeoutMs = this.timeoutMs): Promise<T> {
    if (this.failure) throw this.failure
    const id = this.nextId++
    const result = new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error(`ACP_TIMEOUT:${method}`))
      }, timeoutMs)
      this.pending.set(id, { resolve, reject, timer })
    })
    this.write({ jsonrpc: '2.0', id, method, params })
    return result as Promise<T>
  }

  notify(method: string, params: unknown): void {
    if (this.failure) return
    this.write({ jsonrpc: '2.0', method, params })
  }

  close(): void {
    this.input.end()
    this.fail(new Error('ACP_CONNECTION_CLOSED'))
  }

  private receive(line: string): void {
    if (!line.trim()) return
    let frame: RpcFrame
    try { frame = JSON.parse(line) as RpcFrame } catch { this.fail(new Error('ACP_INVALID_STDOUT')); return }
    if (frame.jsonrpc !== '2.0') { this.fail(new Error('ACP_INVALID_FRAME')); return }
    if (frame.method && frame.id !== undefined) { void this.answerRequest(frame); return }
    if (frame.method) { for (const listener of this.notifications) listener(frame.method, frame.params); return }
    if (frame.id !== undefined) {
      const pending = this.pending.get(frame.id)
      if (!pending) return
      this.pending.delete(frame.id)
      clearTimeout(pending.timer)
      if (frame.error) pending.reject(new Error(`ACP_RPC_${frame.error.code}:${frame.error.message}`))
      else pending.resolve(frame.result)
      return
    }
    this.fail(new Error('ACP_INVALID_FRAME'))
  }

  private async answerRequest(frame: RpcFrame): Promise<void> {
    const handler = this.requests.get(frame.method!)
    if (!handler) { this.write({ jsonrpc: '2.0', id: frame.id, error: { code: -32601, message: 'method not allowed' } }); return }
    try { this.write({ jsonrpc: '2.0', id: frame.id, result: await handler(frame.params) }) }
    catch { this.write({ jsonrpc: '2.0', id: frame.id, error: { code: -32603, message: 'request denied' } }) }
  }

  private write(frame: RpcFrame): void {
    this.input.write(`${JSON.stringify(frame)}\n`)
  }

  private fail(error: Error): void {
    if (this.failure) return
    this.failure = error
    for (const pending of this.pending.values()) { clearTimeout(pending.timer); pending.reject(error) }
    this.pending.clear()
  }
}
