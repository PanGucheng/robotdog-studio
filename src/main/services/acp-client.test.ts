import { PassThrough } from 'node:stream'
import { describe, expect, it } from 'vitest'
import { AcpClient } from './acp-client'

describe('AcpClient', () => {
  it('correlates NDJSON requests and dispatches notifications', async () => {
    const toAgent = new PassThrough()
    const fromAgent = new PassThrough()
    const client = new AcpClient(toAgent, fromAgent, 500)
    const notifications: string[] = []
    client.onNotification((method) => notifications.push(method))
    toAgent.once('data', (chunk) => {
      const request = JSON.parse(chunk.toString()) as { id: number }
      fromAgent.write(`${JSON.stringify({ jsonrpc: '2.0', method: 'session/update', params: { ok: true } })}\n`)
      fromAgent.write(`${JSON.stringify({ jsonrpc: '2.0', id: request.id, result: { protocolVersion: 1 } })}\n`)
    })
    await expect(client.request('initialize', { protocolVersion: 1 })).resolves.toEqual({ protocolVersion: 1 })
    expect(notifications).toEqual(['session/update'])
  })

  it('answers permission requests and fails closed on malformed stdout', async () => {
    const toAgent = new PassThrough()
    const fromAgent = new PassThrough()
    const client = new AcpClient(toAgent, fromAgent, 500)
    client.handleRequest('session/request_permission', () => ({ outcome: { outcome: 'cancelled' } }))
    const response = new Promise<string>((resolve) => toAgent.once('data', (chunk) => resolve(chunk.toString())))
    fromAgent.write(`${JSON.stringify({ jsonrpc: '2.0', id: 7, method: 'session/request_permission', params: {} })}\n`)
    expect(JSON.parse(await response)).toEqual({ jsonrpc: '2.0', id: 7, result: { outcome: { outcome: 'cancelled' } } })

    const pending = client.request('session/new', {})
    fromAgent.write('not-json\n')
    await expect(pending).rejects.toThrow('ACP_INVALID_STDOUT')
  })
})
