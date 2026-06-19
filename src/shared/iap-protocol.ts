const SYNC = new Uint8Array([0x52, 0x44, 0x53, 0x49]) // RDSI
const HEADER_BYTES = 10
const CRC_BYTES = 4
export const IAP_MAX_PAYLOAD = 1024

export const IAP_COMMANDS = {
  hello: 0x01,
  eraseApp: 0x10,
  writeBlock: 0x11,
  verify: 0x12,
  complete: 0x13,
  reboot: 0x14,
  response: 0x80,
  error: 0x81
} as const

export type IapCommand = (typeof IAP_COMMANDS)[keyof typeof IAP_COMMANDS]

export interface IapFrame {
  version: 1
  command: IapCommand
  sequence: number
  payload: Uint8Array
}

export function encodeIapFrame(frame: IapFrame): Uint8Array {
  if (!Number.isInteger(frame.sequence) || frame.sequence < 0 || frame.sequence > 0xffff) throw new Error('IAP 序号超出 uint16 范围')
  if (frame.payload.byteLength > IAP_MAX_PAYLOAD) throw new Error(`IAP 负载不能超过 ${IAP_MAX_PAYLOAD} 字节`)

  const output = new Uint8Array(HEADER_BYTES + frame.payload.byteLength + CRC_BYTES)
  output.set(SYNC, 0)
  const view = new DataView(output.buffer)
  view.setUint8(4, frame.version)
  view.setUint8(5, frame.command)
  view.setUint16(6, frame.sequence, true)
  view.setUint16(8, frame.payload.byteLength, true)
  output.set(frame.payload, HEADER_BYTES)
  view.setUint32(HEADER_BYTES + frame.payload.byteLength, crc32(output.subarray(4, HEADER_BYTES + frame.payload.byteLength)), true)
  return output
}

export function decodeIapFrame(bytes: Uint8Array): IapFrame {
  if (bytes.byteLength < HEADER_BYTES + CRC_BYTES) throw new Error('IAP 帧长度不足')
  if (!hasSync(bytes, 0)) throw new Error('IAP 同步头错误')
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const version = view.getUint8(4)
  if (version !== 1) throw new Error(`不支持的 IAP 协议版本：${version}`)
  const length = view.getUint16(8, true)
  if (length > IAP_MAX_PAYLOAD) throw new Error('IAP 负载长度超限')
  const expectedBytes = HEADER_BYTES + length + CRC_BYTES
  if (bytes.byteLength !== expectedBytes) throw new Error(`IAP 帧长度不匹配：期望 ${expectedBytes}，实际 ${bytes.byteLength}`)
  const expectedCrc = view.getUint32(HEADER_BYTES + length, true)
  const actualCrc = crc32(bytes.subarray(4, HEADER_BYTES + length))
  if (expectedCrc !== actualCrc) throw new Error('IAP 帧 CRC32 校验失败')
  return {
    version: 1,
    command: view.getUint8(5) as IapCommand,
    sequence: view.getUint16(6, true),
    payload: bytes.slice(HEADER_BYTES, HEADER_BYTES + length)
  }
}

export class IapFrameDecoder {
  private pending: Uint8Array = new Uint8Array()

  push(chunk: Uint8Array): IapFrame[] {
    this.pending = concatBytes(this.pending, chunk)
    const frames: IapFrame[] = []
    while (this.pending.byteLength >= SYNC.byteLength) {
      const syncIndex = findSync(this.pending)
      if (syncIndex < 0) {
        this.pending = this.pending.slice(Math.max(0, this.pending.byteLength - (SYNC.byteLength - 1)))
        break
      }
      if (syncIndex > 0) this.pending = this.pending.slice(syncIndex)
      if (this.pending.byteLength < HEADER_BYTES) break
      const view = new DataView(this.pending.buffer, this.pending.byteOffset, this.pending.byteLength)
      const length = view.getUint16(8, true)
      if (length > IAP_MAX_PAYLOAD) {
        this.pending = this.pending.slice(SYNC.byteLength)
        continue
      }
      const frameBytes = HEADER_BYTES + length + CRC_BYTES
      if (this.pending.byteLength < frameBytes) break
      const candidate = this.pending.slice(0, frameBytes)
      this.pending = this.pending.slice(frameBytes)
      try {
        frames.push(decodeIapFrame(candidate))
      } catch {
        // A corrupt frame is dropped; subsequent valid frames remain decodable.
      }
    }
    return frames
  }

  reset(): void {
    this.pending = new Uint8Array()
  }
}

export function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff
  for (const byte of bytes) {
    crc ^= byte
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0)
  }
  return (crc ^ 0xffffffff) >>> 0
}

function hasSync(bytes: Uint8Array, offset: number): boolean {
  return SYNC.every((byte, index) => bytes[offset + index] === byte)
}

function findSync(bytes: Uint8Array): number {
  for (let index = 0; index <= bytes.byteLength - SYNC.byteLength; index += 1) if (hasSync(bytes, index)) return index
  return -1
}

function concatBytes(left: Uint8Array, right: Uint8Array): Uint8Array {
  const combined = new Uint8Array(left.byteLength + right.byteLength)
  combined.set(left, 0)
  combined.set(right, left.byteLength)
  return combined
}
