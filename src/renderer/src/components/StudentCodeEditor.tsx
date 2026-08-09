import Editor, { type BeforeMount } from '@monaco-editor/react'
import type { Monaco } from '@monaco-editor/react'
import type { editor as MonacoEditor } from 'monaco-editor'
import { BookOpen, CheckCircle2, ChevronDown, ChevronRight, CircleAlert, Code2, File, FileCode2, FileJson2, FileSliders, Folder, FolderOpen, LoaderCircle, LockKeyhole, Play, RotateCcw, Save, ShieldCheck, Sparkles, WandSparkles } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { CandidateDiagnostic, CandidateSnapshot, ProjectExplorerNode, ProjectExplorerSnapshot, StudentCodeExplanationRequest, StudentCodeFile, StudentDiagnosticHelp, WorkspaceSummary } from '../../../shared/types'
import { getRobotApi } from '../lib/browser-demo-api'
import { buildStudentDiagnosticCards, formatDiagnosticsForStudentAi } from '../lib/student-diagnostics'
import { toStudentErrorMessage, toStudentProblem } from '../lib/student-errors'
import { ProblemCard } from './ProblemCard'

interface StudentCodeEditorProps {
  workspace?: WorkspaceSummary
  candidate?: CandidateSnapshot
  busy: boolean
  onCandidateChanged(candidate?: CandidateSnapshot): void
  onReadyForReview(): void
  onExplainCode(request: StudentCodeExplanationRequest): void
  diagnosticHelp?: StudentDiagnosticHelp
  onRepairStudentCode(candidateId: string): void
  explorerMode?: boolean
  focusRequest?: { path: string; line?: number; nonce: number }
  onActiveFileChange?(path: string): void
}

const configureMonaco: BeforeMount = (monaco) => {
  monaco.editor.defineTheme('robotdog-track', {
    base: 'vs', inherit: true,
    rules: [
      { token: 'comment', foreground: '688896', fontStyle: 'italic' },
      { token: 'keyword', foreground: '087F91' },
      { token: 'number', foreground: 'B67200' },
      { token: 'type', foreground: '2563A5' },
      { token: 'string', foreground: '237A57' }
    ],
    colors: {
      'editor.background': '#FFFFFF', 'editor.foreground': '#17384A', 'editorLineNumber.foreground': '#91A5AF',
      'editorLineNumber.activeForeground': '#087F91', 'editor.selectionBackground': '#CDEEF2',
      'editor.lineHighlightBackground': '#EEF8FA', 'editorCursor.foreground': '#0B91A3',
      'editorIndentGuide.background1': '#E4ECEF', 'editorIndentGuide.activeBackground1': '#A9C9D0'
    }
  })
}

export function StudentCodeEditor({ workspace, candidate, busy, onCandidateChanged, onReadyForReview, onExplainCode, diagnosticHelp, onRepairStudentCode, explorerMode = false, focusRequest, onActiveFileChange }: StudentCodeEditorProps): React.JSX.Element {
  const api = useMemo(() => getRobotApi(), [])
  const manualCandidate = candidate?.origin === 'manual' ? candidate : undefined
  const [files, setFiles] = useState<StudentCodeFile[]>([])
  const [explorer, setExplorer] = useState<ProjectExplorerSnapshot>()
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set())
  const [selectedPath, setSelectedPath] = useState<StudentCodeFile['path']>('Core/Src/student_control.c')
  const [content, setContent] = useState('')
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string>()
  const [diagnostic, setDiagnostic] = useState<string>()
  const [aiHelpRequested, setAiHelpRequested] = useState(false)
  const [repairAttempted, setRepairAttempted] = useState(false)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const editorRef = useRef<MonacoEditor.IStandaloneCodeEditor | undefined>(undefined)
  const monacoRef = useRef<Monaco | undefined>(undefined)
  const explorerContentCache = useRef(new Map<string, string>())
  const selectedNode = explorer?.nodes.find((node) => node.kind === 'file' && node.displayPath === selectedPath)
  const listedSelected = files.find((file) => file.path === selectedPath)
  const selected = listedSelected ?? (selectedNode ? {
    path: selectedNode.displayPath,
    label: selectedNode.name,
    group: roleLabel(selectedNode),
    language: monacoLanguage(selectedNode.language) as StudentCodeFile['language'],
    editable: selectedNode.access === 'editable',
    content
  } : undefined)
  const buildDiagnostics = manualCandidate?.diagnostics ?? []
  const diagnosticCards = useMemo(() => buildStudentDiagnosticCards(buildDiagnostics), [buildDiagnostics])
  const keyDiagnostics = diagnosticCards.slice(0, 3)
  const fileGroups = useMemo(() => getStudentFileGroups(files), [files])

  useEffect(() => {
    if (!workspace) { setFiles([]); setExplorer(undefined); setContent(''); return }
    explorerContentCache.current.clear()
    let disposed = false
    const load = explorerMode ? api.getProjectExplorer(workspace.id, manualCandidate?.id) : api.listStudentCodeFiles(workspace.id, manualCandidate?.id)
    void load.then(async (result) => {
      if (disposed) return
      if (explorerMode) {
        const snapshot = result as ProjectExplorerSnapshot
        setExplorer(snapshot)
        setFiles([])
        const rememberedPath = localStorage.getItem(`robotdog.mcu-last-file.${workspace.id}`) ?? selectedPath
        const next = snapshot.nodes.find((node) => node.kind === 'file' && node.displayPath === rememberedPath)
          ?? snapshot.nodes.find((node) => node.kind === 'file' && node.displayPath === 'App/Src/experiment.c')
          ?? snapshot.nodes.find((node) => node.kind === 'file')
        if (next) {
          setExpandedNodes((current) => withExpandedAncestors(current, snapshot.nodes, next))
          const loaded = await api.readProjectExplorerFile(workspace.id, next.id, manualCandidate?.id)
          if (disposed) return
          setSelectedPath(next.displayPath)
          setContent(loaded.content)
          rememberExplorerContent(explorerContentCache.current, `${manualCandidate?.id ?? 'project'}:${next.id}`, loaded.content)
        }
      } else {
        const items = result as StudentCodeFile[]
        setFiles(items)
        setExplorer(undefined)
        const next = items.find((file) => file.path === selectedPath) ?? items[0]
        setSelectedPath(next?.path ?? 'Core/Src/student_control.c')
        setContent(next?.content ?? '')
      }
      setDirty(false)
    }).catch((caught) => { if (!disposed) setMessage(toStudentErrorMessage(caught)) })
    return () => { disposed = true }
  }, [api, workspace?.id, manualCandidate?.id, explorerMode])

  useEffect(() => {
    if (workspace && explorerMode && selectedPath) localStorage.setItem(`robotdog.mcu-last-file.${workspace.id}`, selectedPath)
    if (selectedPath) onActiveFileChange?.(selectedPath)
  }, [workspace?.id, explorerMode, selectedPath])

  useEffect(() => {
    if (explorerMode) return
    const file = files.find((item) => item.path === selectedPath)
    if (file) { setContent(file.content); setDirty(false) }
  }, [selectedPath, explorerMode])

  useEffect(() => {
    if (!focusRequest || !workspace || !explorerMode) return
    const node = explorer?.nodes.find((item) => item.kind === 'file' && item.displayPath === focusRequest.path)
    if (!node) return
    void switchFile(node.displayPath, focusRequest.line)
  }, [focusRequest?.nonce, explorer?.nodes.length])

  useEffect(() => {
    if (!dirty || !manualCandidate || !selected?.editable) return
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => { void saveCurrent() }, 550)
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current) }
  }, [content, dirty, manualCandidate?.id, selectedPath])

  useEffect(() => {
    const model = editorRef.current?.getModel()
    const monaco = monacoRef.current
    if (!model || !monaco) return
    const markers = buildDiagnostics.filter((item) => item.path === selectedPath && item.line).map((item) => ({
      severity: item.severity === 'warning' ? monaco.MarkerSeverity.Warning : monaco.MarkerSeverity.Error,
      message: item.message, startLineNumber: item.line!, startColumn: item.column ?? 1,
      endLineNumber: item.line!, endColumn: (item.column ?? 1) + 1
    }))
    monaco.editor.setModelMarkers(model, 'student-check', markers)
  }, [buildDiagnostics, selectedPath])

  useEffect(() => {
    if (!shouldClearCompilerIssue(manualCandidate, buildDiagnostics.length)) return
    setDiagnostic(undefined)
    setAiHelpRequested(false)
    setRepairAttempted(false)
  }, [manualCandidate?.id, manualCandidate?.state, buildDiagnostics.length])

  const saveCurrent = async (): Promise<CandidateSnapshot | undefined> => {
    if (!manualCandidate || !selected?.editable || !dirty) return manualCandidate
    setSaving(true)
    try {
      const updated = await api.writeManualDraft(manualCandidate.id, selected.path, content)
      setFiles((current) => current.map((file) => file.path === selected.path ? { ...file, content } : file))
      if (selectedNode) rememberExplorerContent(explorerContentCache.current, `${manualCandidate.id}:${selectedNode.id}`, content)
      setDirty(false)
      onCandidateChanged(updated)
      return updated
    } finally { setSaving(false) }
  }

  const startDraft = (): void => {
    if (!workspace) return
    void api.openManualDraft(workspace.id).then((opened) => { onCandidateChanged(opened); setMessage('已创建安全草稿，修改会自动保存到草稿中。') }).catch((caught) => setMessage(toStudentErrorMessage(caught)))
  }

  const switchFile = (path: StudentCodeFile['path'], line?: number): void => {
    void (async () => {
      await saveCurrent()
      if (explorerMode && workspace && explorer) {
        const node = explorer.nodes.find((item) => item.kind === 'file' && item.displayPath === path)
        if (!node) return
        setExpandedNodes((current) => withExpandedAncestors(current, explorer.nodes, node))
        const cacheKey = `${manualCandidate?.id ?? 'project'}:${node.id}`
        const cached = explorerContentCache.current.get(cacheKey)
        if (cached !== undefined) setContent(cached)
        else {
          const loaded = await api.readProjectExplorerFile(workspace.id, node.id, manualCandidate?.id)
          setContent(loaded.content)
          rememberExplorerContent(explorerContentCache.current, cacheKey, loaded.content)
        }
        setDirty(false)
      }
      setSelectedPath(path)
      if (line) setTimeout(() => { editorRef.current?.setPosition({ lineNumber: line, column: 1 }); editorRef.current?.revealLineInCenter(line); editorRef.current?.focus() }, 0)
    })().catch((caught) => setMessage(toStudentErrorMessage(caught)))
  }

  const checkCode = (): void => {
    if (!manualCandidate) return
    void (async () => {
      setDiagnostic(undefined)
      setMessage('正在检查代码…')
      await saveCurrent()
      const validated = await api.validateCandidate(manualCandidate.id)
      onCandidateChanged(validated)
      if (validated.state === 'no_changes') {
        await api.rejectCandidate(validated.id)
        onCandidateChanged(undefined)
        setMessage('代码没有变化，草稿已收好。')
        return
      }
      if (validated.state !== 'review_ready') {
        setDiagnostic(validated.error ?? '修改没有通过安全检查。')
        setMessage('先修好下面的问题，再检查一次。')
        return
      }
      const built = await api.buildCandidate(validated.id)
      onCandidateChanged(built)
      if (built.state === 'build_passed') {
        setDiagnostic(undefined)
        setAiHelpRequested(false)
        setRepairAttempted(false)
        setMessage('检查通过！下一步统一查看修改并保存到项目。')
        onReadyForReview()
      } else {
        setDiagnostic(built.error ?? '编译没有通过，请查看问题说明。')
        setMessage('代码还差一点，修改后可以再次检查。')
        const firstPath = buildStudentDiagnosticCards(built.diagnostics ?? []).find((item) => item.path)?.path
        if (firstPath) setSelectedPath(firstPath)
        requestDiagnosticHelp(built.id, built.diagnostics ?? [], built.error)
      }
    })().catch((caught) => setDiagnostic(toStudentErrorMessage(caught)))
  }

  const discard = (): void => {
    if (!manualCandidate) return
    void api.rejectCandidate(manualCandidate.id).then(() => { onCandidateChanged(undefined); setMessage('草稿已放弃，正式项目没有变化。') }).catch((caught) => setMessage(toStudentErrorMessage(caught)))
  }

  const explainSelection = (): void => {
    const editor = editorRef.current
    const selection = editor?.getSelection()
    const selectedCode = selection && editor?.getModel()?.getValueInRange(selection)
    if (!selectedCode?.trim()) { setMessage('先在编辑器里选中一小段代码，再请 AI 解释。'); return }
    onExplainCode({
      kind: 'selection', candidateId: manualCandidate?.id, selectedPath: selected?.path,
      content: selectedCode.slice(0, 4_000)
    })
  }

  const requestDiagnosticHelp = (candidateId: string, items: CandidateDiagnostic[], fallback?: string): void => {
    setAiHelpRequested(true)
    onExplainCode({ kind: 'diagnostic', candidateId, content: formatDiagnosticsForStudentAi(items, fallback) })
  }

  if (!workspace) return <div className="code-editor-empty"><Code2 size={28} /><h3>先新建一个项目</h3><p>系统会复制当前版本的教学模板，再让你在安全草稿中试改。</p></div>
  const mcu = workspace.learningPath === 'mcu-foundations'

  return (
    <div className="student-code-studio">
      <aside className={`student-file-rail ${explorerMode ? 'is-project-explorer' : ''}`}>
        <div className="editor-rail-heading"><span>{mcu ? '工程文件' : '代码赛道'}</span><strong>{manualCandidate ? '安全草稿' : '项目原稿'}</strong></div>
        {explorerMode && explorer ? <ProjectExplorerTree snapshot={explorer} selectedPath={selectedPath} expanded={expandedNodes} errorPaths={new Set(buildDiagnostics.map((item) => item.path).filter((path): path is string => Boolean(path)))} onToggle={(id) => setExpandedNodes((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next })} onSelect={(path) => switchFile(path)} /> : fileGroups.map((group) => (
          <div className="student-file-group" key={group}>
            <span>{group}</span>
            {files.filter((file) => file.group === group).map((file) => (
              <button type="button" className={selectedPath === file.path ? 'active' : ''} key={file.path} onClick={() => switchFile(file.path)}>
                {file.language === 'yaml' ? <FileSliders size={15} /> : file.editable ? <Code2 size={15} /> : <BookOpen size={15} />}
                <span><strong>{file.label}</strong><small>{file.editable ? '可以修改' : '只读参考'}</small></span>
              </button>
            ))}
          </div>
        ))}
        {explorerMode && explorer?.warning && <div className="explorer-warning"><CircleAlert size={14} /> {explorer.warning}</div>}
        <div className="editor-safety-note"><ShieldCheck size={16} /><span>{mcu ? '只会保存 App 教学目录，启动、链接和烧录设置保持受保护。' : '只会保存学生代码，硬件和烧录设置不会被改动。'}</span></div>
      </aside>

      <div className="student-editor-main">
        <header className="student-editor-toolbar">
          <div><span className="eyebrow">{selected?.group ?? '学生代码'}</span><h2>{selected?.label ?? '选择一个文件'}</h2><p>{selected?.path}{selectedNode ? ` · ${selectedNode.origin === 'lesson-overlay' ? `课程工程 ${workspace.headCommit.slice(0, 7)}` : `主固件 ${workspace.baselineCommit.slice(0, 7)}`}` : ''}</p></div>
          <div className="student-editor-actions">
            <button type="button" onClick={explainSelection} disabled={busy || !selected}><Sparkles size={14} /> 解释选中代码</button>
            {!manualCandidate ? <button type="button" className="button-primary" onClick={startDraft} disabled={busy}><Play size={14} /> 开始编写</button> : <>
              <span className={`draft-save-state ${dirty || saving ? 'saving' : ''}`}>{saving ? '正在保存草稿…' : dirty ? '等待自动保存…' : <><CheckCircle2 size={13} /> 草稿已保存</>}</span>
              <button type="button" onClick={discard} disabled={busy}><RotateCcw size={14} /> 放弃草稿</button>
              <button type="button" className="button-primary" onClick={checkCode} disabled={busy || saving}><Save size={14} /> 检查并查看修改</button>
            </>}
          </div>
        </header>
        <div className={`student-monaco-shell ${selected?.editable && manualCandidate ? '' : 'is-readonly'}`}>
          <Editor
            beforeMount={configureMonaco}
            onMount={(editor, monaco) => { editorRef.current = editor; monacoRef.current = monaco }}
            theme="robotdog-track"
              language={selectedNode ? monacoLanguage(selectedNode.language) : selected?.language ?? 'c'}
            path={selected?.path}
            value={content}
            onChange={(value) => { if (selected?.editable && manualCandidate) { setContent(value ?? ''); setDirty(true); setDiagnostic(undefined); setAiHelpRequested(false); setRepairAttempted(false) } }}
            options={{
              readOnly: !selected?.editable || !manualCandidate, automaticLayout: true, minimap: { enabled: false },
              readOnlyMessage: { value: !selected?.editable ? '这是接口说明，只能查看。' : '当前正在查看项目原稿。请点击右上角的“开始编写”按钮后再修改。' },
              fontFamily: "'Cascadia Code', Consolas, monospace", fontSize: 15, lineHeight: 24, tabSize: 4,
              padding: { top: 14, bottom: 14 }, scrollBeyondLastLine: false, wordWrap: 'on',
              renderLineHighlight: 'all', smoothScrolling: true, bracketPairColorization: { enabled: true }
            }}
          />
          {(!selected?.editable || !manualCandidate) && <div className="editor-readonly-flag"><BookOpen size={13} /> {!selected?.editable ? (selectedNode?.origin === 'firmware-baseline' ? '主固件文件只读' : '课程适配文件只读') : '点击“开始编写”后进入安全草稿'}</div>}
        </div>
        {buildDiagnostics.length > 0 && manualCandidate ? <div className="compiler-help-card">
          <div className="compiler-help-heading"><span><CircleAlert size={17} /></span><div><strong>{repairAttempted ? 'AI 修过一次，还差一点' : '代码在这里卡住了'}</strong><small>先看最关键的 {keyDiagnostics.length} 个问题；正式项目没有变化。</small></div></div>
          <div className="compiler-key-errors">
            {keyDiagnostics.map((item) => <button type="button" key={item.id} onClick={() => { if (item.path) setSelectedPath(item.path) }}>
              <span>{item.locationLabel}</span>
              <strong>{item.studentMessage}</strong>
              <small>{item.fileLabel} · {item.likelyCause}</small>
            </button>)}
          </div>
          <details className="compiler-full-output">
            <summary>查看完整编译输出（{buildDiagnostics.length} 条）</summary>
            <div>{diagnosticCards.map((item) => <code key={item.id}>{item.fileLabel} {item.locationLabel}：{item.diagnostic.message}</code>)}</div>
          </details>
          <div className={`compiler-ai-advice ${diagnosticHelp?.state ?? (aiHelpRequested ? 'loading' : 'idle')}`}>
            <div className="compiler-ai-title">{diagnosticHelp?.state === 'loading' || (aiHelpRequested && !diagnosticHelp) ? <LoaderCircle size={15} className="spin" /> : <Sparkles size={15} />}<strong>老师怎么解释</strong></div>
            {diagnosticHelp?.text ? <div className="compiler-ai-copy"><ReactMarkdown remarkPlugins={[remarkGfm]} skipHtml>{diagnosticHelp.text}</ReactMarkdown></div>
              : diagnosticHelp?.state === 'failed' ? <ProblemCard problem={toStudentProblem('network timeout', 'AI 解释没有完成')} tone="danger" compact />
                : aiHelpRequested ? <p>正在把编译器的话翻译成容易理解的建议…</p> : <p>让 AI 解释原因，并给出一个最小修改建议。</p>}
          </div>
          <div className="compiler-fix-plan">
            <strong>建议怎么改</strong>
            <p>{keyDiagnostics[0]?.actionHint ?? '先从标出的第一条错误开始，一次只改一个小地方。'}</p>
            {repairAttempted && <small>AI 已经尝试修过一次。如果仍有错误，可以先看完整输出，再点“重新解释”。</small>}
          </div>
          <div className="compiler-help-actions">
            <span>看懂建议后，可以让 AI 只修改安全草稿。</span>
            <button type="button" onClick={() => requestDiagnosticHelp(manualCandidate.id, buildDiagnostics, diagnostic)} disabled={busy}>重新解释</button>
            <button type="button" className="button-primary" onClick={() => { setRepairAttempted(true); onRepairStudentCode(manualCandidate.id) }} disabled={busy || diagnosticHelp?.state !== 'ready'}><WandSparkles size={14} /> 接受建议并修复草稿</button>
          </div>
        </div> : diagnostic ? <ProblemCard problem={{ ...toStudentProblem(diagnostic, '代码检查发现问题'), nextStep: `${toStudentProblem(diagnostic, '代码检查发现问题').nextStep} 错误只发生在安全草稿里，正式项目没有受影响。` }} tone="danger" compact />
          : message && <div className="editor-feedback"><strong>当前进度</strong><p>{message}</p></div>}
      </div>
    </div>
  )
}

export function shouldClearCompilerIssue(candidate: CandidateSnapshot | undefined, diagnosticCount: number): boolean {
  if (!candidate) return false
  if (candidate.origin !== 'manual') return false
  return diagnosticCount === 0 || candidate.state === 'build_passed'
}

export function getStudentFileGroups(files: StudentCodeFile[]): string[] {
  return [...new Set(files.map((file) => file.group))]
}

function ProjectExplorerTree({ snapshot, selectedPath, expanded, errorPaths, onToggle, onSelect }: { snapshot: ProjectExplorerSnapshot; selectedPath: string; expanded: Set<string>; errorPaths: Set<string>; onToggle(id: string): void; onSelect(path: string): void }): React.JSX.Element {
  const children = new Map<string | undefined, ProjectExplorerNode[]>()
  for (const node of snapshot.nodes) children.set(node.parentId, [...(children.get(node.parentId) ?? []), node])
  const render = (parentId: string | undefined, depth: number): React.JSX.Element[] => (children.get(parentId) ?? []).map((node) => {
    const open = node.kind === 'directory' && expanded.has(node.id)
    const Icon = node.kind === 'directory' ? open ? FolderOpen : Folder : fileIcon(node)
    return <div className="explorer-tree-entry" key={node.id}>
      <button type="button" role="treeitem" aria-expanded={node.kind === 'directory' ? open : undefined} aria-selected={node.kind === 'file' ? selectedPath === node.displayPath : undefined} className={`${selectedPath === node.displayPath ? 'active' : ''} ${errorPaths.has(node.displayPath) ? 'is-error' : node.state !== 'normal' ? `is-${node.state}` : ''}`} style={{ paddingLeft: `${10 + depth * 15}px` }} onClick={() => node.kind === 'directory' ? onToggle(node.id) : onSelect(node.displayPath)} onKeyDown={(event) => {
        if (event.key === 'ArrowRight' && node.kind === 'directory' && !open) { event.preventDefault(); onToggle(node.id) }
        else if (event.key === 'ArrowLeft' && node.kind === 'directory' && open) { event.preventDefault(); onToggle(node.id) }
        else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); moveTreeFocus(event.currentTarget, event.key === 'ArrowDown' ? 1 : -1) }
      }} title={node.displayPath}>
        {node.kind === 'directory' ? open ? <ChevronDown size={13} /> : <ChevronRight size={13} /> : <span className="explorer-indent" />}
        <Icon size={15} />
        <span className="explorer-node-name">{node.name}</span>
        {node.kind === 'file' && node.access === 'read-only' && <LockKeyhole size={11} className="explorer-lock" />}
        {node.kind === 'file' && node.state === 'modified' && <i className="explorer-state-dot" title="安全草稿中已修改" />}
        {node.kind === 'file' && errorPaths.has(node.displayPath) && <i className="explorer-error-dot" title="这个文件有编译错误" />}
      </button>
      {open && render(node.id, depth + 1)}
    </div>
  })
  return <div className="project-explorer-tree" role="tree" aria-label={`${snapshot.rootLabel} 工程目录`}><div className="explorer-root"><FolderOpen size={15} /><strong>{snapshot.rootLabel}</strong><small>{snapshot.baselineAvailable ? '完整构建工程' : '仅课程文件'}</small></div>{render(undefined, 0)}</div>
}

function fileIcon(node: ProjectExplorerNode): typeof File {
  if (['c', 'cpp', 'asm', 'linker', 'cmake'].includes(node.language ?? '')) return FileCode2
  if (node.language === 'json' || node.language === 'yaml') return FileJson2
  return File
}

export function withExpandedAncestors(current: Set<string>, nodes: ProjectExplorerNode[], selected: ProjectExplorerNode): Set<string> {
  const byId = new Map(nodes.map((node) => [node.id, node]))
  const expanded = new Set(current)
  let parentId = selected.parentId
  while (parentId) {
    expanded.add(parentId)
    parentId = byId.get(parentId)?.parentId
  }
  return expanded
}

function rememberExplorerContent(cache: Map<string, string>, key: string, content: string): void {
  cache.delete(key)
  cache.set(key, content)
  while (cache.size > 12) cache.delete(cache.keys().next().value!)
}

function moveTreeFocus(current: HTMLButtonElement, delta: number): void {
  const tree = current.closest('[role="tree"]')
  const items = tree ? Array.from(tree.querySelectorAll<HTMLButtonElement>('[role="treeitem"]')) : []
  const index = items.indexOf(current)
  items[index + delta]?.focus()
}

function roleLabel(node: ProjectExplorerNode): string {
  const labels: Record<ProjectExplorerNode['role'], string> = {
    'student-code': '课程代码', 'course-adapter': '课程适配', application: '主程序', core: '芯片核心', peripheral: '外设驱动', startup: '启动代码', linker: '链接布局', build: '构建配置', config: '工程配置', documentation: '工程说明'
  }
  return `${labels[node.role]} · ${node.access === 'editable' ? '可编辑' : '只读'}`
}

function monacoLanguage(language?: ProjectExplorerNode['language']): string {
  if (language === 'asm') return 'asm'
  if (language === 'linker' || language === 'cmake') return 'plaintext'
  return language ?? 'plaintext'
}
