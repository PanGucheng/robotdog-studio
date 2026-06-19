import { Bluetooth, Cable, Check, Download, LoaderCircle, RotateCcw, ShieldCheck, Unplug, Usb } from 'lucide-react'
import type { DeviceConnectionSnapshot, FirmwareBuildState, FirmwareUpdateSnapshot, FirmwareUpdateState } from '../../../shared/types'

interface ConnectionBayProps {
  connection: DeviceConnectionSnapshot
  update: FirmwareUpdateSnapshot
  buildState: FirmwareBuildState
  busy: boolean
  onToggleUsb(): void
  onStartUpdate(): void
  onCancelUpdate(): void
}

const updateSteps: Array<{ state: FirmwareUpdateState[]; label: string }> = [
  { state: ['preflight', 'stopping', 'waiting_for_usb'], label: '安全准备' },
  { state: ['entering_iap', 'bootloader_handshake'], label: '识别小马' },
  { state: ['erasing', 'writing'], label: '写入固件' },
  { state: ['verifying'], label: '完整校验' },
  { state: ['rebooting', 'validating_app', 'completed'], label: '重启验证' }
]

function stateIndex(state: FirmwareUpdateState): number {
  return updateSteps.findIndex((step) => step.state.includes(state))
}

export function ConnectionBay({ connection, update, buildState, busy, onToggleUsb, onStartUpdate, onCancelUpdate }: ConnectionBayProps): React.JSX.Element {
  const runtimeReady = connection.runtime.state === 'ready'
  const usbReady = connection.updatePort.state !== 'disconnected'
  const activeStep = stateIndex(update.state)
  const updateActive = !['idle', 'completed', 'failed', 'cancelled'].includes(update.state)
  const canStart = buildState === 'completed' && !updateActive

  return (
    <section className="connection-bay" aria-label="机器马连接舱">
      <div className="link-bays">
        <article className={`link-bay runtime-bay ${runtimeReady ? 'is-live' : ''}`}>
          <div className="link-icon"><Bluetooth size={20} /></div>
          <div className="link-copy">
            <span className="eyebrow">无线调试</span>
            <strong>{runtimeReady ? '小马在场，可无线观察' : '等待无线连接'}</strong>
            <small>{runtimeReady ? `${connection.runtime.port} · ${connection.runtime.latencyMs ?? '—'}ms` : '控制、CCD 与状态走这条链路'}</small>
          </div>
          <span className={`link-signal ${runtimeReady ? 'online' : ''}`}>{runtimeReady ? '在线' : '离线'}</span>
        </article>

        <div className="bay-divider" aria-hidden="true"><span>运行</span><i /><span>下载</span></div>

        <article className={`link-bay usb-bay ${usbReady ? 'is-live' : ''}`}>
          <div className="link-icon"><Usb size={20} /></div>
          <div className="link-copy">
            <span className="eyebrow">USB 下载</span>
            <strong>{usbReady ? connection.updatePort.state === 'bootloader' || connection.updatePort.state === 'busy' ? '已进入安全下载模式' : '下载线已识别' : '需要更新时再接线'}</strong>
            <small>{usbReady ? connection.updatePort.port : '板载串口负责稳定写入固件'}</small>
          </div>
          <button type="button" className="cable-toggle" onClick={onToggleUsb} disabled={busy || connection.updatePort.state === 'busy'}>
            {usbReady ? <><Unplug size={14} /> 模拟拔线</> : <><Cable size={14} /> 模拟接线</>}
          </button>
        </article>
      </div>

      <div className={`update-console ${update.state === 'failed' ? 'has-error' : update.state === 'completed' ? 'is-complete' : ''}`}>
        <div className="update-heading">
          <div>
            <span className="eyebrow">下载到小马</span>
            <h3>{update.state === 'idle' ? '一根线，完成安全更新' : update.message}</h3>
            <p>{update.state === 'idle' ? '软件会先让小马停稳，再自动完成写入、校验和重连。' : `${update.artifactName ?? '固件'} · ${update.progress}%`}</p>
          </div>
          <div className="update-actions">
            {update.canCancel && <button type="button" onClick={onCancelUpdate}>取消</button>}
            <button type="button" className="download-primary" onClick={onStartUpdate} disabled={!canStart || busy}>
              {updateActive ? <LoaderCircle className="spin" size={16} /> : update.state === 'failed' ? <RotateCcw size={16} /> : <Download size={16} />}
              {update.state === 'failed' ? '重新下载' : update.state === 'completed' ? '再次下载' : '下载到小马'}
            </button>
          </div>
        </div>

        <div className="update-route" aria-label="固件下载步骤">
          <div className="update-route-line"><span style={{ width: `${update.progress}%` }} /></div>
          {updateSteps.map((step, index) => {
            const done = update.state === 'completed' || (activeStep > index && activeStep !== -1)
            const active = activeStep === index && updateActive
            return (
              <div className={`update-step ${done ? 'done' : ''} ${active ? 'active' : ''}`} key={step.label}>
                <span>{done ? <Check size={13} /> : active ? <LoaderCircle className="spin" size={13} /> : index + 1}</span>
                <small>{step.label}</small>
              </div>
            )
          })}
        </div>

        {update.state === 'waiting_for_usb' && <div className="update-callout"><Cable size={16} /> 请把板载 USB 下载线接到电脑；模拟阶段可点击右上方“模拟接线”。</div>}
        {update.state === 'completed' && <div className="update-callout success"><ShieldCheck size={16} /> 新固件已通过校验，无线调试连接已经恢复。</div>}
        {update.state === 'failed' && <div className="update-callout error"><RotateCcw size={16} /> {update.error} Bootloader 未被覆盖，可以安全重试。</div>}
        {buildState !== 'completed' && update.state === 'idle' && <div className="update-callout"><Download size={16} /> 请先在下方完成固件编译，生成 BIN 后即可下载。</div>}
      </div>
    </section>
  )
}
