import Editor, { type BeforeMount } from '@monaco-editor/react'
import type { Monaco } from '@monaco-editor/react'
import type { editor as MonacoEditor } from 'monaco-editor'
import { BookOpen, CheckCircle2, ChevronDown, ChevronRight, CircleAlert, Code2, File, FileCode2, FileJson2, FileSliders, Folder, FolderOpen, LockKeyhole, Play, RotateCcw, Save, ShieldCheck, Sparkles } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { CandidateDiagnostic, CandidateSnapshot, ProjectExplorerNode, ProjectExplorerSnapshot, StudentCodeExplanationRequest, StudentCodeFile, StudentDiagnosticHelp, WorkspaceSummary } from '../../../shared/types'
import { getRobotApi } from '../lib/browser-demo-api'
import { buildStudentDiagnosticCards, formatDiagnosticsForStudentAi } from '../lib/student-diagnostics'
import { toStudentErrorMessage } from '../lib/student-errors'
import { readMcuEditorViewState, saveMcuEditorViewState } from '../lib/mcu-monaco-session'

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
  editorOverlay?: ReactNode
  overlayVisible?: boolean
  bottomPanel?: ReactNode
  workspaceAction?: { summary: string; primaryLabel: string; onPrimary(): void; secondaryLabel: string; onSecondary(): void; disabled?: boolean }
  workspaceDiagnostics?: CandidateDiagnostic[]
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

export function StudentCodeEditor({ workspace, candidate, busy, onCandidateChanged, onReadyForReview, onExplainCode, diagnosticHelp: _diagnosticHelp, onRepairStudentCode: _onRepairStudentCode, explorerMode = false, focusRequest, onActiveFileChange, editorOverlay, overlayVisible = false, bottomPanel, workspaceAction, workspaceDiagnostics = [] }: StudentCodeEditorProps): React.JSX.Element {
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
  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const saveInFlightRef = useRef<Promise<CandidateSnapshot | undefined> | undefined>(undefined)
  const editVersionRef = useRef(0)
  const contentRef = useRef(content)
  const editorRef = useRef<MonacoEditor.IStandaloneCodeEditor | undefined>(undefined)
  const monacoRef = useRef<Monaco | undefined>(undefined)
  const explorerContentCache = useRef(new Map<string, string>())
  const pendingDraftRef = useRef<{ workspaceId?: string; candidateId?: string; path?: string; content: string; dirty: boolean; direct: boolean; editable: boolean }>({ content: '', dirty: false, direct: false, editable: false })
  const viewContextRef = useRef<{ workspaceId?: string; path?: string }>({})
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
  const directEditing = workspace?.learningPath === 'mcu-foundations'
  const aiReviewActive = isActiveAiCandidate(candidate)
  const editorWritable = Boolean(selected?.editable && (directEditing ? !aiReviewActive : manualCandidate))
  const buildDiagnostics = directEditing ? workspaceDiagnostics : manualCandidate?.diagnostics ?? []
  const fileGroups = useMemo(() => getStudentFileGroups(files), [files])
  contentRef.current = content
  pendingDraftRef.current = { workspaceId: workspace?.id, candidateId: manualCandidate?.id, path: selected?.path, content, dirty, direct: directEditing, editable: editorWritable }
  viewContextRef.current = { workspaceId: workspace?.id, path: selectedPath }

  useEffect(() => () => {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    const pending = pendingDraftRef.current
    if (pending.dirty && pending.editable && pending.path) {
      const flush = (): Promise<unknown> | undefined => pending.direct && pending.workspaceId
        ? api.writeWorkspaceFile(pending.workspaceId, pending.path!, pending.content)
        : pending.candidateId ? api.writeManualDraft(pending.candidateId, pending.path!, pending.content) : undefined
      if (saveInFlightRef.current) void saveInFlightRef.current.then(flush, flush)
      else void flush()
    }
    const view = viewContextRef.current
    if (view.workspaceId && view.path) saveMcuEditorViewState(view.workspaceId, view.path, editorRef.current?.saveViewState() ?? null)
  }, [api])

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
    if (!dirty || !editorWritable) return
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => { void saveCurrent() }, 550)
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current) }
  }, [content, dirty, manualCandidate?.id, selectedPath, editorWritable, workspace?.id])

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
  }, [manualCandidate?.id, manualCandidate?.state, buildDiagnostics.length])

  useEffect(() => {
    if (!workspace || !selectedPath) return
    const editor = editorRef.current
    const state = readMcuEditorViewState(workspace.id, selectedPath)
    if (!editor || !state) return
    requestAnimationFrame(() => { editor.restoreViewState(state); editor.layout() })
  }, [workspace?.id, selectedPath])

  useEffect(() => {
    if (!workspace || !selectedPath) return
    const editor = editorRef.current
    if (overlayVisible) saveMcuEditorViewState(workspace.id, selectedPath, editor?.saveViewState() ?? null)
    else {
      const state = readMcuEditorViewState(workspace.id, selectedPath)
      if (editor && state) requestAnimationFrame(() => { editor.restoreViewState(state); editor.layout(); editor.focus() })
    }
  }, [overlayVisible, workspace?.id, selectedPath])

  const saveCurrent = async (): Promise<CandidateSnapshot | undefined> => {
    if (!selected?.editable || !dirty) return manualCandidate
    if (saveInFlightRef.current) await saveInFlightRef.current
    const savedContent = contentRef.current
    const savedVersion = editVersionRef.current
    setSaving(true)
    const operation = (async (): Promise<CandidateSnapshot | undefined> => {
      const updated = directEditing && workspace
        ? await api.writeWorkspaceFile(workspace.id, selected.path, savedContent)
        : manualCandidate ? await api.writeManualDraft(manualCandidate.id, selected.path, savedContent) : undefined
      if (!updated) return manualCandidate
      setFiles((current) => current.map((file) => file.path === selected.path ? { ...file, content: savedContent } : file))
      if (selectedNode) rememberExplorerContent(explorerContentCache.current, `${directEditing ? 'project' : manualCandidate?.id}:${selectedNode.id}`, savedContent)
      if (editVersionRef.current === savedVersion) setDirty(false)
      if (!directEditing) onCandidateChanged(updated as CandidateSnapshot)
      return directEditing ? undefined : updated as CandidateSnapshot
    })()
    saveInFlightRef.current = operation
    try {
      return await operation
    } catch (caught) {
      setMessage(toStudentErrorMessage(caught))
      return manualCandidate
    } finally {
      if (saveInFlightRef.current === operation) saveInFlightRef.current = undefined
      setSaving(false)
    }
  }

  const startDraft = (): void => {
    if (!workspace) return
    void api.openManualDraft(workspace.id).then((opened) => { onCandidateChanged(opened); setMessage('已创建安全草稿，修改会自动保存到草稿中。') }).catch((caught) => setMessage(toStudentErrorMessage(caught)))
  }

  const switchFile = (path: StudentCodeFile['path'], line?: number): void => {
    void (async () => {
      if (workspace && selectedPath) saveMcuEditorViewState(workspace.id, selectedPath, editorRef.current?.saveViewState() ?? null)
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
        setMessage('检查通过！下一步统一查看修改并保存到项目。')
        onReadyForReview()
      } else {
        setDiagnostic(built.error ?? '编译没有通过，请查看问题说明。')
        setMessage('代码还差一点，修改后可以再次检查。')
        const firstPath = buildStudentDiagnosticCards(built.diagnostics ?? []).find((item) => item.path)?.path
        if (firstPath) setSelectedPath(firstPath)
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
    onExplainCode({ kind: 'diagnostic', candidateId, content: formatDiagnosticsForStudentAi(items, fallback) })
  }

  if (!workspace) return <div className="code-editor-empty"><Code2 size={28} /><h3>先新建一个项目</h3><p>系统会复制当前版本的教学模板，再让你在安全草稿中试改。</p></div>
  const mcu = workspace.learningPath === 'mcu-foundations'

  return (
    <div className="student-code-studio">
      <aside className={`student-file-rail ${explorerMode ? 'is-project-explorer' : ''}`}>
        <div className="editor-rail-heading"><span>{mcu ? '工程文件' : '代码赛道'}</span><strong>{mcu ? 'Workspace' : manualCandidate ? '安全草稿' : '项目原稿'}</strong></div>
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
            {mcu ? <><span className={`draft-save-state ${dirty || saving ? 'saving' : ''}`} role="status" aria-live="polite">{saving || dirty ? '正在保存…' : <><CheckCircle2 size={13} /> 已保存</>}</span>{workspaceAction && <><button type="button" onClick={workspaceAction.onSecondary}>{workspaceAction.secondaryLabel}</button><button type="button" className="button-primary" onClick={workspaceAction.onPrimary} disabled={workspaceAction.disabled || saving || dirty}><Play size={14} />{workspaceAction.primaryLabel}</button></>}</> : !manualCandidate ? workspaceAction ? <><span className="draft-save-state"><CheckCircle2 size={13} />{workspaceAction.summary}</span><button type="button" onClick={workspaceAction.onSecondary}>{workspaceAction.secondaryLabel}</button><button type="button" className="button-primary" onClick={workspaceAction.onPrimary} disabled={workspaceAction.disabled}><Play size={14} />{workspaceAction.primaryLabel}</button></> : <button type="button" className="button-primary" onClick={startDraft} disabled={busy}><Play size={14} /> 开始编写</button> : <>
              <span className={`draft-save-state ${dirty || saving ? 'saving' : ''}`}>{saving ? '正在保存草稿…' : dirty ? '等待自动保存…' : <><CheckCircle2 size={13} /> 草稿已保存</>}</span>
              <button type="button" onClick={discard} disabled={busy}><RotateCcw size={14} /> 放弃草稿</button>
              <button type="button" className="button-primary" onClick={checkCode} disabled={busy || saving}><Save size={14} /> 检查代码</button>
            </>}
          </div>
        </header>
        <div className="mcu-editor-stage">
        <div className={`student-monaco-shell ${editorWritable ? '' : 'is-readonly'} ${overlayVisible ? 'is-covered' : ''}`} aria-hidden={overlayVisible || undefined}>
          <Editor
            beforeMount={configureMonaco}
            onMount={(editor, monaco) => {
              editorRef.current = editor
              monacoRef.current = monaco
              if (workspace && selectedPath) {
                const state = readMcuEditorViewState(workspace.id, selectedPath)
                if (state) { editor.restoreViewState(state); editor.layout() }
              }
            }}
            theme="robotdog-track"
              language={selectedNode ? monacoLanguage(selectedNode.language) : selected?.language ?? 'c'}
            path={selected?.path}
            value={content}
            onChange={(value) => { if (editorWritable) { editVersionRef.current += 1; setContent(value ?? ''); setDirty(true); setDiagnostic(undefined) } }}
            options={{
              readOnly: !editorWritable, automaticLayout: true, minimap: { enabled: false },
              readOnlyMessage: { value: !selected?.editable ? '这是受保护文件，只能查看。' : aiReviewActive ? '请先完成或放弃当前 AI 修改。' : '请点击右上角的“开始编写”按钮后再修改。' },
              fontFamily: "'Cascadia Code', Consolas, monospace", fontSize: 15, lineHeight: 24, tabSize: 4,
              padding: { top: 14, bottom: 14 }, scrollBeyondLastLine: false, wordWrap: 'on',
              renderLineHighlight: 'all', smoothScrolling: true, bracketPairColorization: { enabled: true }
            }}
          />
          {!editorWritable && <div className="editor-readonly-flag"><BookOpen size={13} /> {!selected?.editable ? (selectedNode?.origin === 'firmware-baseline' ? '主固件文件只读' : '课程适配文件只读') : aiReviewActive ? 'AI 修改等待确认，当前工程暂时只读' : '点击“开始编写”后进入安全草稿'}</div>}
        </div>
        {editorOverlay}
        </div>
        {diagnostic ? <div className="editor-feedback"><strong>代码检查发现问题</strong><p>{diagnostic}</p>{manualCandidate && <button type="button" onClick={() => requestDiagnosticHelp(manualCandidate.id, buildDiagnostics, diagnostic)}>让 AI 解释</button>}</div>
          : message && <div className="editor-feedback"><strong>当前进度</strong><p>{message}</p></div>}
        {bottomPanel}
      </div>
    </div>
  )
}

export function shouldClearCompilerIssue(candidate: CandidateSnapshot | undefined, diagnosticCount: number): boolean {
  if (!candidate) return false
  if (candidate.origin !== 'manual') return false
  return diagnosticCount === 0 || candidate.state === 'build_passed'
}

export function isActiveAiCandidate(candidate: CandidateSnapshot | undefined): boolean {
  if (candidate?.origin !== 'ai') return false
  return !['applied', 'rejected', 'cancelled', 'stale'].includes(candidate.state)
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
