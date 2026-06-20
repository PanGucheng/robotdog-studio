import Editor, { type BeforeMount } from '@monaco-editor/react'
import type { Monaco } from '@monaco-editor/react'
import type { editor as MonacoEditor } from 'monaco-editor'
import { BookOpen, CheckCircle2, Code2, FileSliders, Play, RotateCcw, Save, ShieldCheck, Sparkles } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { CandidateSnapshot, StudentCodeFile, WorkspaceSummary } from '../../../shared/types'
import { getRobotApi } from '../lib/browser-demo-api'

interface StudentCodeEditorProps {
  workspace?: WorkspaceSummary
  candidate?: CandidateSnapshot
  busy: boolean
  onCandidateChanged(candidate?: CandidateSnapshot): void
  onReadyForReview(): void
  onExplainDiagnostic(candidateId: string, diagnostic: string): void
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

export function StudentCodeEditor({ workspace, candidate, busy, onCandidateChanged, onReadyForReview, onExplainDiagnostic }: StudentCodeEditorProps): React.JSX.Element {
  const api = useMemo(() => getRobotApi(), [])
  const manualCandidate = candidate?.origin === 'manual' ? candidate : undefined
  const [files, setFiles] = useState<StudentCodeFile[]>([])
  const [selectedPath, setSelectedPath] = useState<StudentCodeFile['path']>('Core/Src/student_control.c')
  const [content, setContent] = useState('')
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string>()
  const [diagnostic, setDiagnostic] = useState<string>()
  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const editorRef = useRef<MonacoEditor.IStandaloneCodeEditor | undefined>(undefined)
  const monacoRef = useRef<Monaco | undefined>(undefined)
  const selected = files.find((file) => file.path === selectedPath)

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
    }).catch((caught) => { if (!disposed) setMessage(caught instanceof Error ? caught.message : String(caught)) })
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
    const match = /:(\d+)(?::(\d+))?:\s*(?:fatal\s+)?error:/i.exec(diagnostic ?? '')
    monaco.editor.setModelMarkers(model, 'student-check', match ? [{
      severity: monaco.MarkerSeverity.Error, message: diagnostic!.slice(0, 500),
      startLineNumber: Number(match[1]), startColumn: Number(match[2] ?? 1),
      endLineNumber: Number(match[1]), endColumn: Number(match[2] ?? 1) + 1
    }] : [])
  }, [diagnostic, selectedPath])

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
    void api.openManualDraft(workspace.id).then((opened) => { onCandidateChanged(opened); setMessage('已创建安全草稿，修改会自动保存到草稿中。') }).catch((caught) => setMessage(caught instanceof Error ? caught.message : String(caught)))
  }

  const switchFile = (path: StudentCodeFile['path']): void => {
    void (async () => { await saveCurrent(); setSelectedPath(path) })().catch((caught) => setMessage(caught instanceof Error ? caught.message : String(caught)))
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
      }
    })().catch((caught) => setDiagnostic(caught instanceof Error ? caught.message : String(caught)))
  }

  const discard = (): void => {
    if (!manualCandidate) return
    void api.rejectCandidate(manualCandidate.id).then(() => { onCandidateChanged(undefined); setMessage('草稿已放弃，正式项目没有变化。') }).catch((caught) => setMessage(caught instanceof Error ? caught.message : String(caught)))
  }

  const explainSelection = (): void => {
    if (!manualCandidate) return
    const editor = editorRef.current
    const selection = editor?.getSelection()
    const selectedCode = selection && editor?.getModel()?.getValueInRange(selection)
    if (!selectedCode?.trim()) { setMessage('先在编辑器里选中一小段代码，再请 AI 解释。'); return }
    onExplainDiagnostic(manualCandidate.id, `请逐段解释下面这段 ${selected?.language === 'yaml' ? '巡线参数' : 'C 代码'}在机器马上会做什么：\n\n${selectedCode.slice(0, 4_000)}`)
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
            {!manualCandidate ? <button type="button" className="button-primary" onClick={startDraft} disabled={busy}><Play size={14} /> 开始编写</button> : <>
              <span className={`draft-save-state ${dirty || saving ? 'saving' : ''}`}>{saving ? '正在保存草稿…' : dirty ? '等待自动保存…' : <><CheckCircle2 size={13} /> 草稿已保存</>}</span>
              <button type="button" onClick={explainSelection} disabled={busy}><Sparkles size={14} /> 解释选中代码</button>
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
            onChange={(value) => { if (selected?.editable && manualCandidate) { setContent(value ?? ''); setDirty(true); setDiagnostic(undefined) } }}
            options={{
              readOnly: !selected?.editable || !manualCandidate, automaticLayout: true, minimap: { enabled: false },
              fontFamily: "'Cascadia Code', Consolas, monospace", fontSize: 15, lineHeight: 24, tabSize: 4,
              padding: { top: 14, bottom: 14 }, scrollBeyondLastLine: false, wordWrap: 'on',
              renderLineHighlight: 'all', smoothScrolling: true, bracketPairColorization: { enabled: true }
            }}
          />
          {(!selected?.editable || !manualCandidate) && <div className="editor-readonly-flag"><BookOpen size={13} /> {!selected?.editable ? '接口说明只供参考' : '点击“开始编写”后进入安全草稿'}</div>}
        </div>
        {(message || diagnostic) && <div className={`editor-feedback ${diagnostic ? 'has-error' : ''}`}>
          <strong>{diagnostic ? '代码检查发现问题' : '当前进度'}</strong>
          <p>{diagnostic ?? message}</p>
          {diagnostic && <small>错误只发生在安全草稿里，正式项目没有受影响。</small>}
          {diagnostic && manualCandidate && <button type="button" onClick={() => onExplainDiagnostic(manualCandidate.id, diagnostic)} disabled={busy}>请 AI 助教解释</button>}
        </div>}
      </div>
    </div>
  )
}
