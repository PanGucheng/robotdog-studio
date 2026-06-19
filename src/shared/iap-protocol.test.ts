import { describe, expect, it } from 'vitest'
import { crc32, decodeIapFrame, encodeIapFrame, IAP_COMMANDS, IapFrameDecoder } from './iap-protocol'

describe('IAP protocol', () => {
  it('matches the standard CRC32 check value', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926)
  })

  it('encodes and decodes a write block frame', () => {
    const encoded = encodeIapFrame({ version: 1, command: IAP_COMMANDS.writeBlock, sequence: 42, payload: new Uint8Array([1, 2, 3, 4]) })
    expect(decodeIapFrame(encoded)).toEqual({ version: 1, command: IAP_COMMANDS.writeBlock, sequence: 42, payload: new Uint8Array([1, 2, 3, 4]) })
  })

  it('rejects corrupted frames', () => {
    const encoded = encodeIapFrame({ version: 1, command: IAP_COMMANDS.hello, sequence: 1, payload: new Uint8Array([7]) })
    encoded[10] ^= 0xff
    expect(() => decodeIapFrame(encoded)).toThrow('CRC32')
  })

  it('recovers fragmented and concatenated frames after noise', () => {
    const first = encodeIapFrame({ version: 1, command: IAP_COMMANDS.hello, sequence: 1, payload: new Uint8Array([7]) })
    const second = encodeIapFrame({ version: 1, command: IAP_COMMANDS.verify, sequence: 2, payload: new Uint8Array([8, 9]) })
    const decoder = new IapFrameDecoder()
    expect(decoder.push(new Uint8Array([0xaa, 0xbb, ...first.slice(0, 6)]))).toEqual([])
    const frames = decoder.push(new Uint8Array([...first.slice(6), ...second]))
    expect(frames.map((frame) => frame.sequence)).toEqual([1, 2])
  })
})
