import Editor, { type BeforeMount } from '@monaco-editor/react'
import type { Monaco } from '@monaco-editor/react'
import type { editor as MonacoEditor } from 'monaco-editor'
import { BookOpen, CheckCircle2, CircleAlert, Code2, FileSliders, LoaderCircle, Play, RotateCcw, Save, ShieldCheck, Sparkles, WandSparkles } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { CandidateDiagnostic, CandidateSnapshot, StudentCodeExplanationRequest, StudentCodeFile, StudentDiagnosticHelp, WorkspaceSummary } from '../../../shared/types'
import { getRobotApi } from '../lib/browser-demo-api'
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
}

const configureMonaco: BeforeMount = (monaco) => {
  monaco.editor.defineTheme('robotdog-track', {
    base: 'vs-dark', inherit: true,
    rules: [
      { token: 'comment', foreground: '7397A8', fontStyle: 'italic' },
      { token: 'keyword', foreground: '63D6C5' },
      { token: 'number', foreground: 'FFC857' },
      { token: 'type', foreground: '7FB7FF' }
    ],
    colors: {
      'editor.background': '#10283A', 'editor.foreground': '#DDEAF0', 'editorLineNumber.foreground': '#55788A',
      'editorLineNumber.activeForeground': '#63D6C5', 'editor.selectionBackground': '#285D6C88',
      'editor.lineHighlightBackground': '#17374A', 'editorCursor.foreground': '#FFC857'
    }
  })
}

export function StudentCodeEditor({ workspace, candidate, busy, onCandidateChanged, onReadyForReview, onExplainCode, diagnosticHelp, onRepairStudentCode }: StudentCodeEditorProps): React.JSX.Element {
  const api = useMemo(() => getRobotApi(), [])
  const manualCandidate = candidate?.origin === 'manual' ? candidate : undefined
  const [files, setFiles] = useState<StudentCodeFile[]>([])
  const [selectedPath, setSelectedPath] = useState<StudentCodeFile['path']>('Core/Src/student_control.c')
  const [content, setContent] = useState('')
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string>()
  const [diagnostic, setDiagnostic] = useState<string>()
  const [aiHelpRequested, setAiHelpRequested] = useState(false)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const editorRef = useRef<MonacoEditor.IStandaloneCodeEditor | undefined>(undefined)
  const monacoRef = useRef<Monaco | undefined>(undefined)
  const selected = files.find((file) => file.path === selectedPath)
  const buildDiagnostics = manualCandidate?.diagnostics ?? []

  useEffect(() => {
    if (!workspace) { setFiles([]); setContent(''); return }
    let disposed = false
    void api.listStudentCodeFiles(workspace.id, manualCandidate?.id).then((items) => {
      if (disposed) return
      setFiles(items)
      const next = items.find((file) => file.path === selectedPath) ?? items[0]
      setSelectedPath(next?.path ?? 'Core/Src/student_control.c')
      setContent(next?.content ?? '')
      setDirty(false)
    }).catch((caught) => { if (!disposed) setMessage(toStudentErrorMessage(caught)) })
    return () => { disposed = true }
  }, [api, workspace?.id, manualCandidate?.id])

  useEffect(() => {
    const file = files.find((item) => item.path === selectedPath)
    if (file) { setContent(file.content); setDirty(false) }
  }, [selectedPath])

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

  const saveCurrent = async (): Promise<CandidateSnapshot | undefined> => {
    if (!manualCandidate || !selected?.editable || !dirty) return manualCandidate
    setSaving(true)
    try {
      const updated = await api.writeManualDraft(manualCandidate.id, selected.path, content)
      setFiles((current) => current.map((file) => file.path === selected.path ? { ...file, content } : file))
      setDirty(false)
      onCandidateChanged(updated)
      return updated
    } finally { setSaving(false) }
  }

  const startDraft = (): void => {
    if (!workspace) return
    void api.openManualDraft(workspace.id).then((opened) => { onCandidateChanged(opened); setMessage('已创建安全草稿，修改会自动保存到草稿中。') }).catch((caught) => setMessage(toStudentErrorMessage(caught)))
  }

  const switchFile = (path: StudentCodeFile['path']): void => {
    void (async () => { await saveCurrent(); setSelectedPath(path) })().catch((caught) => setMessage(toStudentErrorMessage(caught)))
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
        setMessage('检查通过！下一步统一查看修改并保存到项目。')
        onReadyForReview()
      } else {
        setDiagnostic(built.error ?? '编译没有通过，请查看问题说明。')
        setMessage('代码还差一点，修改后可以再次检查。')
        const firstPath = built.diagnostics?.find((item) => item.path)?.path
        if (firstPath) setSelectedPath(firstPath)
        requestDiagnosticHelp(built.id, built.diagnostics ?? [], built.error)
      }
    })().catch((caught) => setDiagnostic(caught instanceof Error ? caught.message : String(caught)))
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
    onExplainCode({ kind: 'diagnostic', candidateId, content: formatDiagnosticsForAi(items, fallback) })
  }

  if (!workspace) return <div className="code-editor-empty"><Code2 size={28} /><h3>先新建一个学生对话</h3><p>系统会复制代码模板，再让你放心试改。</p></div>

  return (
    <div className="student-code-studio">
      <aside className="student-file-rail">
        <div className="editor-rail-heading"><span>代码赛道</span><strong>{manualCandidate ? '安全草稿' : '项目原稿'}</strong></div>
        {(['控制逻辑', '参数设置', '参考接口'] as const).map((group) => (
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
        <div className="editor-safety-note"><ShieldCheck size={16} /><span>只会保存学生代码，硬件和烧录设置不会被改动。</span></div>
      </aside>

      <div className="student-editor-main">
        <header className="student-editor-toolbar">
          <div><span className="eyebrow">{selected?.group ?? '学生代码'}</span><h2>{selected?.label ?? '选择一个文件'}</h2><p>{selected?.path}</p></div>
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
            language={selected?.language ?? 'c'}
            path={selected?.path}
            value={content}
            onChange={(value) => { if (selected?.editable && manualCandidate) { setContent(value ?? ''); setDirty(true); setDiagnostic(undefined); setAiHelpRequested(false) } }}
            options={{
              readOnly: !selected?.editable || !manualCandidate, automaticLayout: true, minimap: { enabled: false },
              readOnlyMessage: { value: !selected?.editable ? '这是接口说明，只能查看。' : '当前正在查看项目原稿。请点击右上角的“开始编写”按钮后再修改。' },
              fontFamily: "'Cascadia Code', Consolas, monospace", fontSize: 15, lineHeight: 24, tabSize: 4,
              padding: { top: 14, bottom: 14 }, scrollBeyondLastLine: false, wordWrap: 'on',
              renderLineHighlight: 'all', smoothScrolling: true, bracketPairColorization: { enabled: true }
            }}
          />
          {(!selected?.editable || !manualCandidate) && <div className="editor-readonly-flag"><BookOpen size={13} /> {!selected?.editable ? '接口说明只供参考' : '点击“开始编写”后进入安全草稿'}</div>}
        </div>
        {buildDiagnostics.length > 0 && manualCandidate ? <div className="compiler-help-card">
          <div className="compiler-help-heading"><span><CircleAlert size={17} /></span><div><strong>代码在这里卡住了</strong><small>错误只在安全草稿里，正式项目没有变化。</small></div></div>
          <div className="compiler-key-errors">{buildDiagnostics.slice(0, 4).map((item, index) => <div key={`${item.path}-${item.line}-${index}`}>
            <span>{item.line ? `第 ${item.line} 行` : '代码检查'}</span><strong>{item.message}</strong>
          </div>)}</div>
          <div className={`compiler-ai-advice ${diagnosticHelp?.state ?? (aiHelpRequested ? 'loading' : 'idle')}`}>
            <div className="compiler-ai-title">{diagnosticHelp?.state === 'loading' || (aiHelpRequested && !diagnosticHelp) ? <LoaderCircle size={15} className="spin" /> : <Sparkles size={15} />}<strong>AI 助教怎么说</strong></div>
            {diagnosticHelp?.text ? <div className="compiler-ai-copy"><ReactMarkdown remarkPlugins={[remarkGfm]} skipHtml>{diagnosticHelp.text}</ReactMarkdown></div>
              : diagnosticHelp?.state === 'failed' ? <p>AI 暂时没有解释成功，你可以重新试一次。</p>
                : aiHelpRequested ? <p>正在把编译器的话翻译成容易理解的建议…</p> : <p>让 AI 解释原因，并给出一个最小修改建议。</p>}
          </div>
          <div className="compiler-help-actions">
            <button type="button" onClick={() => requestDiagnosticHelp(manualCandidate.id, buildDiagnostics, diagnostic)} disabled={busy}>重新解释</button>
            <button type="button" className="button-primary" onClick={() => onRepairStudentCode(manualCandidate.id)} disabled={busy || diagnosticHelp?.state !== 'ready'}><WandSparkles size={14} /> 接受建议并修复草稿</button>
          </div>
        </div> : diagnostic ? <ProblemCard problem={{ ...toStudentProblem(diagnostic, '代码检查发现问题'), nextStep: `${toStudentProblem(diagnostic, '代码检查发现问题').nextStep} 错误只发生在安全草稿里，正式项目没有受影响。` }} tone="danger" compact />
          : message && <div className="editor-feedback"><strong>当前进度</strong><p>{message}</p></div>}
      </div>
    </div>
  )
}

function formatDiagnosticsForAi(items: CandidateDiagnostic[], fallback?: string): string {
  if (items.length === 0) return fallback ?? '代码没有通过编译。'
  return items.map((item) => `${item.path ?? '学生代码'}${item.line ? ` 第 ${item.line} 行` : ''}${item.column ? ` 第 ${item.column} 列` : ''}：${item.message}`).join('\n')
}
