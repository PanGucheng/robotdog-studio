import { Check, CircleDot, Cpu, Download, Eye, MessageCircle, PencilLine, Wrench } from 'lucide-react'
import type { FirmwareBuildState, FirmwareUpdateState } from '../../../shared/types'

const steps = [
  { label: '连接', icon: Cpu, state: 'active' },
  { label: '观察', icon: Eye, state: 'next' },
  { label: '修改', icon: PencilLine, state: 'next' },
  { label: '编译', icon: Wrench, state: 'next' },
  { label: '下载', icon: Download, state: 'next' },
  { label: '测试', icon: Check, state: 'next' }
] as const

interface PipelineRailProps {
  connected: boolean
  buildState: FirmwareBuildState
  updateState: FirmwareUpdateState
}

export function PipelineRail({ connected, buildState, updateState }: PipelineRailProps): React.JSX.Element {
  const buildDone = buildState === 'completed'
  const updateDone = updateState === 'completed'
  const activeIndex = !connected ? 0 : !buildDone ? 1 : !updateDone ? 4 : 5
  return (
    <div className="pipeline" aria-label="开发闭环进度">
      <div className="pipeline-line" />
      {steps.map(({ label, icon: Icon }, index) => {
        const done = index === 0 ? connected : index === 3 ? buildDone : index === 4 ? updateDone : index < activeIndex
        const active = index === activeIndex
        return (
          <div className={`pipeline-step ${done ? 'is-done' : active ? 'is-active' : ''}`} key={label}>
            <span className="pipeline-node">
              {done ? <Check size={13} strokeWidth={3} /> : active ? <CircleDot size={13} /> : <Icon size={13} />}
            </span>
            <span>{label}</span>
          </div>
        )
      })}
      <span className="pipeline-caption"><MessageCircle size={13} /> 一次安全迭代</span>
    </div>
  )
}
