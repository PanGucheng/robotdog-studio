import { AlertTriangle, Cable, CheckCircle2, ChevronDown, ChevronUp, CircleAlert, Cpu, FileArchive, Hammer, LoaderCircle, Square, TerminalSquare, Usb, Zap } from 'lucide-react'
import { useEffect, useMemo, useReducer, useRef, type KeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react'
import type { CandidateSnapshot, DeviceConnectionSnapshot, FirmwareBaselineStatus, FirmwareBuildSnapshot, FirmwareUpdateSnapshot, StudentCodeExplanationRequest, WchLinkFlashSnapshot, WorkspaceSummary } from '../../../shared/types'
import { aggregateWorkspaceProblems, bottomPanelReducer, DEFAULT_BOTTOM_PANEL, firmwareBelongsToWorkspace, isFirmwareArtifactCurrent, maxBottomPanelHeight, restoreBottomPanel, type BottomPanelTab, type WorkspaceProblem } from '../lib/mcu-workspace-model'

interface McuBottomPanelProps {
  workspace: WorkspaceSummary
  candidate?: CandidateSnapshot
  build: FirmwareBuildSnapshot
  baseline?: FirmwareBaselineStatus
  connection: DeviceConnectionSnapshot
  update: FirmwareUpdateSnapshot
  wchLink: WchLinkFlashSnapshot
  busy: boolean
  request?: { tab: BottomPanelTab; nonce: number }
  onFocusFile(path: string, line?: number): void
  onExplain(request: StudentCodeExplanationRequest): void
  onBuildFirmware(): void
  onCancelBuild(): void
  onToggleUsb(): void
  onStartUpdate(): void
  onCancelUpdate(): void
  onProbeWchLink(): void
  onFlashWchLink(): void
  onCancelWchLink(): void
}

const activeWch = new Set<WchLinkFlashSnapshot['state']>(['probing', 'flashing', 'verifying', 'resetting'])

export function McuBottomPanel(props: McuBottomPanelProps): React.JSX.Element {
  const storageKey = `robotdog.mcu.bottom-panel.v1.${props.workspace.id}`
  const [state, dispatch] = useReducer(bottomPanelReducer, DEFAULT_BOTTOM_PANEL, (fallback) => {
    try { return restoreBottomPanel(JSON.parse(localStorage.getItem(storageKey) ?? 'null'), window.innerHeight) } catch { return fallback }
  })
  const rootRef = useRef<HTMLElement>(null)
  const previousBuild = useRef<FirmwareBuildSnapshot['state'] | undefined>(undefined)
  const problems = useMemo(() => aggregateWorkspaceProblems(props.candidate, props.build, props.workspace.id), [props.candidate, props.build, props.workspace.id])
  const belongs = firmwareBelongsToWorkspace(props.build, props.workspace.id)
  const artifactCurrent = isFirmwareArtifactCurrent(props.build, props.workspace)

  useEffect(() => {
    localStorage.setItem(storageKey, JSON.stringify({ version: 1, ...state }))
  }, [storageKey, state])

  useEffect(() => {
    if (props.candidate && props.candidate.workspaceId === props.workspace.id && ['failed', 'conflict', 'review_ready'].includes(props.candidate.state) && props.candidate.diagnostics?.length) dispatch({ type: 'CANDIDATE_FAILED' })
  }, [props.candidate?.state, props.candidate?.updatedAt, props.workspace.id])

  useEffect(() => {
    if (belongs && previousBuild.current !== props.build.state) {
      if (props.build.state === 'running') dispatch({ type: 'FIRMWARE_STARTED' })
      else if (props.build.state === 'failed') dispatch({ type: 'FIRMWARE_FAILED' })
      else if (props.build.state === 'completed') dispatch({ type: 'FIRMWARE_COMPLETED' })
    }
    previousBuild.current = props.build.state
  }, [props.build.state, props.build.completedAt, belongs])

  useEffect(() => { if (props.request) dispatch({ type: 'USER_OPEN', tab: props.request.tab }) }, [props.request?.nonce])

  useEffect(() => {
    const surface = rootRef.current?.parentElement
    if (!surface) return
    const observer = new ResizeObserver(([entry]) => dispatch({ type: 'USER_RESIZE', height: state.height, surfaceHeight: entry.contentRect.height }))
    observer.observe(surface)
    return () => observer.disconnect()
  }, [state.height])

  const resize = (event: ReactPointerEvent<HTMLButtonElement>): void => {
    event.preventDefault()
    const startY = event.clientY
    const startHeight = state.height
    const surfaceHeight = rootRef.current?.parentElement?.getBoundingClientRect().height ?? window.innerHeight
    const move = (moveEvent: PointerEvent): void => dispatch({ type: 'USER_RESIZE', height: startHeight + startY - moveEvent.clientY, surfaceHeight })
    const stop = (): void => { document.removeEventListener('pointermove', move); document.removeEventListener('pointerup', stop) }
    document.addEventListener('pointermove', move)
    document.addEventListener('pointerup', stop)
  }

  const resizeByKeyboard = (event: KeyboardEvent<HTMLButtonElement>): void => {
    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return
    event.preventDefault()
    const delta = (event.shiftKey ? 48 : 16) * (event.key === 'ArrowUp' ? 1 : -1)
    dispatch({ type: 'USER_RESIZE', height: state.height + delta, surfaceHeight: rootRef.current?.parentElement?.getBoundingClientRect().height ?? window.innerHeight })
  }

  const status = panelStatus(props.build, belongs, artifactCurrent, problems)
  return <section ref={rootRef} className={`mcu-bottom-panel is-${status.tone} ${state.open ? 'is-open' : 'is-collapsed'}`} style={state.open ? { height: state.height } : undefined} aria-label="代码问题与构建结果">
    <button type="button" className="mcu-panel-resizer" role="separator" aria-orientation="horizontal" aria-valuemin={160} aria-valuemax={maxBottomPanelHeight(rootRef.current?.parentElement?.getBoundingClientRect().height ?? window.innerHeight)} aria-valuenow={state.height} onPointerDown={resize} onKeyDown={resizeByKeyboard} />
    <header className="mcu-panel-bar">
      <nav aria-label="底部面板">
        <PanelTab id="problems" label={`问题${problems.length ? ` ${problems.length}` : ''}`} active={state.tab === 'problems'} onSelect={(tab) => dispatch({ type: 'USER_SELECT_TAB', tab })} />
        <PanelTab id="build" label="构建" active={state.tab === 'build'} onSelect={(tab) => dispatch({ type: 'USER_SELECT_TAB', tab })} />
        <PanelTab id="output" label="输出" active={state.tab === 'output'} onSelect={(tab) => dispatch({ type: 'USER_SELECT_TAB', tab })} />
      </nav>
      <span className="mcu-panel-summary"><i />{status.summary}</span>
      <button type="button" onClick={() => dispatch({ type: state.open ? 'USER_CLOSE' : 'USER_OPEN' })} aria-label={state.open ? '收起底部面板' : '展开底部面板'}>{state.open ? <ChevronDown size={16} /> : <ChevronUp size={16} />}</button>
    </header>
    {state.open && <div className="mcu-panel-body">
      {state.tab === 'problems' ? <ProblemsView problems={problems} candidate={props.candidate} onFocus={props.onFocusFile} onExplain={props.onExplain} />
        : state.tab === 'build' ? <BuildView {...props} belongs={belongs} artifactCurrent={artifactCurrent} />
          : <OutputView build={belongs ? props.build : undefined} wchLink={props.wchLink} />}
    </div>}
  </section>
}

function PanelTab({ id, label, active, onSelect }: { id: BottomPanelTab; label: string; active: boolean; onSelect(tab: BottomPanelTab): void }): React.JSX.Element {
  return <button type="button" role="tab" aria-selected={active} className={active ? 'active' : ''} onClick={() => onSelect(id)}>{label}</button>
}

function ProblemsView({ problems, candidate, onFocus, onExplain }: { problems: WorkspaceProblem[]; candidate?: CandidateSnapshot; onFocus(path: string, line?: number): void; onExplain(request: StudentCodeExplanationRequest): void }): React.JSX.Element {
  if (!problems.length) return <div className="mcu-panel-empty"><CheckCircle2 size={18} /><span><strong>当前没有需要处理的问题</strong><small>代码检查与完整程序构建的问题会集中显示在这里。</small></span></div>
  return <div className="mcu-problem-table">{problems.map((problem) => <article key={problem.id} className={`is-${problem.severity}`}>
    <button type="button" className="mcu-problem-main" onClick={() => problem.path && onFocus(problem.path, problem.line)} disabled={!problem.path}>
      {problem.severity === 'error' ? <CircleAlert size={15} /> : <AlertTriangle size={15} />}<span><strong>{problem.message}</strong><small>{sourceLabel(problem.source)} · {problem.path ? `${problem.path}${problem.line ? `:${problem.line}${problem.column ? `:${problem.column}` : ''}` : ''}` : '全局问题'}</small></span>
    </button>
    <button type="button" onClick={() => onExplain({ kind: 'diagnostic', candidateId: candidate?.id, selectedPath: problem.path, content: `${sourceLabel(problem.source)}：${problem.message}${problem.path ? `\n位置：${problem.path}:${problem.line ?? 1}` : ''}` })}>让 AI 解释</button>
  </article>)}</div>
}

function BuildView(props: McuBottomPanelProps & { belongs: boolean; artifactCurrent: boolean }): React.JSX.Element {
  const { build, baseline, connection, update, wchLink } = props
  if (!props.belongs) return <div className="mcu-panel-empty"><LoaderCircle className="spin" size={18} /><span><strong>另一个项目正在生成程序</strong><small>当前项目会在后台任务结束后恢复生成入口。</small></span></div>
  if (build.state === 'running') return <div className="mcu-build-panel"><div className="mcu-build-lead"><LoaderCircle className="spin" size={19} /><span><strong>{stageLabel(build.stage)}</strong><small>{build.currentFile ?? '正在准备完整固件'} · {build.completedFiles}/{build.totalFiles || 1}</small></span><button type="button" onClick={props.onCancelBuild}><Square size={14} />取消生成</button></div><div className="mcu-build-progress"><i style={{ width: `${build.totalFiles ? build.completedFiles / build.totalFiles * 100 : 4}%` }} /></div></div>
  if (!props.artifactCurrent) return <div className="mcu-build-panel"><div className="mcu-build-lead"><Cpu size={19} /><span><strong>{build.state === 'completed' ? '程序已过期，需要重新生成' : build.state === 'failed' ? '程序生成失败' : '生成当前工程的完整程序'}</strong><small>{build.error ?? '合并课程代码与受保护主固件，生成可烧录产物。'}</small></span><button type="button" className="button-primary" onClick={props.onBuildFirmware} disabled={props.busy}><Hammer size={14} />{build.state === 'failed' ? '重新生成' : '生成完整程序'}</button></div></div>
  const flash = (build.size?.text ?? 0) + (build.size?.data ?? 0)
  const ram = (build.size?.data ?? 0) + (build.size?.bss ?? 0)
  const targetReady = wchLink.state === 'target_ready' || wchLink.state === 'completed'
  const usbReady = ['connected', 'bootloader'].includes(connection.updatePort.state)
  const flashing = activeWch.has(wchLink.state) || !['idle', 'completed', 'failed', 'cancelled'].includes(update.state)
  return <div className="mcu-build-panel"><div className="mcu-build-lead"><CheckCircle2 size={19} /><span><strong>程序已生成并通过哈希校验</strong><small>Flash {formatBytes(flash)} / {formatBytes(baseline?.memory.flashBytes ?? 0)} · RAM {formatBytes(ram)} / {formatBytes(baseline?.memory.ramBytes ?? 0)}</small></span>{flashing ? <button type="button" onClick={activeWch.has(wchLink.state) ? props.onCancelWchLink : props.onCancelUpdate}><Square size={14} />取消写入</button> : targetReady ? <button type="button" className="button-primary" onClick={props.onFlashWchLink}><Zap size={14} />烧录到开发板</button> : usbReady ? <button type="button" className="button-primary" onClick={props.onStartUpdate}><Usb size={14} />通过 USB 写入</button> : <button type="button" onClick={props.onProbeWchLink}><Cable size={14} />检测开发板</button>}</div><div className="mcu-artifact-row">{build.artifacts.map((item) => <span key={item.kind}><FileArchive size={13} />{item.kind.toUpperCase()} {item.bytes ? formatBytes(item.bytes) : ''}</span>)}</div></div>
}

function OutputView({ build, wchLink }: { build?: FirmwareBuildSnapshot; wchLink: WchLinkFlashSnapshot }): React.JSX.Element {
  const lines = [...(build?.logs ?? []), ...(wchLink.logs.length ? ['— WCH-Link —', ...wchLink.logs] : [])]
  return <pre className="mcu-output-view" aria-label="只读构建输出"><TerminalSquare size={14} />{lines.length ? lines.join('\n') : '还没有构建输出。'}</pre>
}

function panelStatus(build: FirmwareBuildSnapshot, belongs: boolean, current: boolean, problems: WorkspaceProblem[]): { tone: 'idle' | 'running' | 'passed' | 'failed' | 'stale'; summary: string } {
  if (problems.some((item) => item.severity === 'error')) return { tone: 'failed', summary: `${problems.length} 个问题需要处理` }
  if (!belongs && build.state === 'running') return { tone: 'running', summary: '另一个项目正在生成程序' }
  if (belongs && build.state === 'running') return { tone: 'running', summary: `正在生成程序 · ${build.completedFiles}/${build.totalFiles || 1}` }
  if (current) return { tone: 'passed', summary: `程序生成完成${build.size ? ` · Flash ${formatBytes(build.size.text + build.size.data)} · RAM ${formatBytes(build.size.data + build.size.bss)}` : ''}` }
  if (build.state === 'completed') return { tone: 'stale', summary: '程序已过期，需要重新生成' }
  return { tone: 'idle', summary: problems.length ? `${problems.length} 个提示` : '代码与程序状态' }
}

function sourceLabel(source: WorkspaceProblem['source']): string { return ({ candidate: '代码检查', firmware: '完整程序', linker: '链接器', safety: '安全校验' })[source] }
function stageLabel(stage: FirmwareBuildSnapshot['stage']): string { return ({ preparing: '正在准备固件', compiling: '正在编译源文件', linking: '正在链接程序', packaging: '正在打包产物' })[stage ?? 'preparing'] }
function formatBytes(value: number): string { return value >= 1024 ? `${(value / 1024).toFixed(value >= 10240 ? 0 : 1)} KB` : `${value} B` }
