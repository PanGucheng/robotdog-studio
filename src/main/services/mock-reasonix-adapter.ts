import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { AdapterEvent, AdapterTurnContext, ReasonixAdapter } from './reasonix-adapter'

export interface MockReasonixAdapterOptions {
  stepDelayMs?: number
  failAtStep?: number
  emitDuplicateAndUnknown?: boolean
}

export class MockReasonixAdapter implements ReasonixAdapter {
  readonly kind = 'mock' as const
  private readonly stepDelayMs: number
  private readonly failAtStep?: number
  private readonly emitDuplicateAndUnknown: boolean

  constructor(options: MockReasonixAdapterOptions = {}) {
    this.stepDelayMs = options.stepDelayMs ?? 180
    this.failAtStep = options.failAtStep
    this.emitDuplicateAndUnknown = options.emitDuplicateAndUnknown ?? false
  }

  async runTurn(context: AdapterTurnContext, emit: (event: AdapterEvent | unknown) => void, signal: AbortSignal): Promise<{ summary: string }> {
    let step = 0
    const next = async (event: AdapterEvent): Promise<void> => {
      step += 1
      await delay(this.stepDelayMs, signal)
      if (this.failAtStep === step) throw new Error('AGENT_CRASHED')
      emit(event)
      if (this.emitDuplicateAndUnknown && step === 2) {
        emit(event)
        emit({ type: 'future_event', sequence: event.sequence + 100, payload: 'ignored' })
      }
    }

    await next({ type: 'plan', sequence: 1, steps: [
      { id: 'inspect', label: '检查现在的巡线参数' },
      { id: 'adjust', label: '在候选副本中调整' },
      { id: 'verify', label: '进行安全核对' }
    ] })
    await next({ type: 'activity', sequence: 2, state: 'thinking', label: '正在理解你的想法' })
    await next({ type: 'assistant_delta', sequence: 3, text: '我先看看现在的转弯设置，' })

    const configPath = join(context.candidateRoot, 'student-config', 'line-following.yaml')
    const original = await readFile(configPath, 'utf8')
    const current = Number(/turn_strength\s*:\s*(\d+)/.exec(original)?.[1] ?? 18)
    const target = chooseTurnStrength(context.message, current)
    await next({ type: 'activity', sequence: 4, state: 'editing', label: '正在准备一份可撤销的修改' })
    signal.throwIfAborted()
    const updated = /turn_strength\s*:\s*\d+/.test(original)
      ? original.replace(/turn_strength\s*:\s*\d+/, `turn_strength: ${target}`)
      : `turn_strength: ${target}\n${original}`
    await writeFile(configPath, updated, 'utf8')
    await next({ type: 'assistant_delta', sequence: 5, text: `把转弯强度从 ${current} 调整到 ${target}。` })
    await next({ type: 'activity', sequence: 6, state: 'validating', label: '正在检查修改范围和文件安全' })
    return { summary: target === current ? '当前设置已经符合你的描述，没有产生新修改。' : `转弯强度 ${current} → ${target}，修改仅发生在学生参数文件。` }
  }
}

function chooseTurnStrength(message: string, current: number): number {
  if (/不变|只检查|不用修改/.test(message)) return current
  if (/温柔|平稳|慢|柔和/.test(message)) return Math.max(5, current - 2)
  if (/更快|灵敏|猛烈|急/.test(message)) return Math.min(30, current + 2)
  return current === 18 ? 17 : current
}

async function delay(milliseconds: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) throw signal.reason ?? new Error('AGENT_CANCELLED')
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, milliseconds)
    signal.addEventListener('abort', () => {
      clearTimeout(timer)
      reject(signal.reason ?? new Error('AGENT_CANCELLED'))
    }, { once: true })
  })
}
