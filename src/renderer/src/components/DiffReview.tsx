import { AlertTriangle, CheckCircle2, FileCode2, FileDiff, LoaderCircle, ShieldCheck, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import type { CandidateDiff, CandidateDiffFile, CandidateSnapshot } from '../../../shared/types'

interface DiffReviewProps {
  candidate?: CandidateSnapshot
  diff?: CandidateDiff
  loading: boolean
  error?: string
  onReject(candidateId: string): void
}

export interface DiffRow {
  kind: 'same' | 'added' | 'removed'
  beforeNumber?: number
  afterNumber?: number
  text: string
}

export function DiffReview({ candidate, diff, loading, error, onReject }: DiffReviewProps): React.JSX.Element {
  const [selectedPath, setSelectedPath] = useState<string>()
  useEffect(() => {
    if (!diff?.files.some((file) => file.path === selectedPath)) setSelectedPath(diff?.files[0]?.path)
  }, [diff, selectedPath])
  const selected = diff?.files.find((file) => file.path === selectedPath) ?? diff?.files[0]
  const rows = useMemo(() => selected ? buildDiffRows(selected) : [], [selected])

  if (!candidate) return <DiffEmpty />
  if (loading) return <div className="diff-state"><LoaderCircle className="spin" size={22} /><strong>正在展开候选修改</strong><span>核对文件范围、源码指纹和修改内容…</span></div>
  if (error) return <div className="diff-state is-error"><AlertTriangle size={22} /><strong>暂时无法读取修改</strong><span>{error}</span></div>
  if (!diff || diff.files.length === 0) return <DiffEmpty message="这次候选没有产生文件变化。" />

  const additions = diff.files.reduce((sum, file) => sum + file.additions, 0)
  const deletions = diff.files.reduce((sum, file) => sum + file.deletions, 0)
  return (
    <div className="diff-review">
      <header className="diff-review-head">
        <div><span className="eyebrow">安全检查台 · Candidate diff</span><h2>逐行核对 AI 的修改</h2><p>左侧是修改前，右侧是候选版本；只有这些文件会进入下一步编译。</p></div>
        <div className="diff-verdict"><ShieldCheck size={17} /><span><strong>范围合规</strong><small>{diff.files.length} 个学生文件</small></span></div>
      </header>

      <div className="diff-ledger" aria-label="候选修改统计">
        <span><FileDiff size={14} /> {diff.files.length} 个文件</span><span className="added">+{additions}</span><span className="removed">−{deletions}</span><code>{diff.diffHash.slice(0, 10)}</code>
      </div>

      <div className="diff-station">
        <aside className="diff-files" aria-label="修改文件">
          <span className="diff-files-label">检查清单</span>
          {diff.files.map((file) => <button type="button" className={file.path === selected?.path ? 'active' : ''} key={file.path} onClick={() => setSelectedPath(file.path)}><FileCode2 size={14} /><span><strong>{fileName(file.path)}</strong><small>{file.path}</small></span><em>+{file.additions} / −{file.deletions}</em></button>)}
        </aside>
        <section className="diff-sheet">
          <div className="diff-sheet-title"><span><FileCode2 size={14} /> {selected?.path}</span><small>修改前</small><small>候选版本</small></div>
          <div className="diff-code" role="table" aria-label={`${selected?.path} 修改内容`}>
            {rows.map((row, index) => <div className={`diff-line ${row.kind}`} role="row" key={`${row.kind}-${row.beforeNumber ?? 'x'}-${row.afterNumber ?? 'x'}-${index}`}><span className="line-sign">{row.kind === 'added' ? '+' : row.kind === 'removed' ? '−' : ' '}</span><span className="line-no">{row.beforeNumber ?? ''}</span><span className="line-no">{row.afterNumber ?? ''}</span><code>{row.text || ' '}</code></div>)}
          </div>
        </section>
      </div>

      <footer className="diff-review-actions"><span><CheckCircle2 size={14} /> 已通过路径、大小、文本与敏感信息检查</span><button type="button" onClick={() => onReject(candidate.id)}><X size={14} /> 放弃这次修改</button><button type="button" className="button-primary" disabled title="下一里程碑将接入候选编译">下一步：编译候选</button></footer>
    </div>
  )
}

function DiffEmpty({ message = 'AI 生成修改后，这里会逐行展示候选内容。' }: { message?: string }): React.JSX.Element {
  return <div className="diff-empty"><span><FileDiff size={24} /></span><strong>代码检查台等待候选</strong><p>{message}</p></div>
}

function fileName(path: string): string { return path.split('/').at(-1) ?? path }

export function buildDiffRows(file: CandidateDiffFile): DiffRow[] {
  const before = splitLines(file.before)
  const after = splitLines(file.after)
  const width = after.length + 1
  const matrix = new Uint32Array((before.length + 1) * width)
  for (let left = before.length - 1; left >= 0; left -= 1) {
    for (let right = after.length - 1; right >= 0; right -= 1) {
      matrix[left * width + right] = before[left] === after[right]
        ? matrix[(left + 1) * width + right + 1] + 1
        : Math.max(matrix[(left + 1) * width + right], matrix[left * width + right + 1])
    }
  }
  const rows: DiffRow[] = []
  let left = 0; let right = 0
  while (left < before.length || right < after.length) {
    if (left < before.length && right < after.length && before[left] === after[right]) {
      rows.push({ kind: 'same', beforeNumber: left + 1, afterNumber: right + 1, text: before[left] }); left += 1; right += 1
    } else if (right < after.length && (left === before.length || matrix[left * width + right + 1] > matrix[(left + 1) * width + right])) {
      rows.push({ kind: 'added', afterNumber: right + 1, text: after[right] }); right += 1
    } else {
      rows.push({ kind: 'removed', beforeNumber: left + 1, text: before[left] }); left += 1
    }
  }
  return rows
}

function splitLines(value: string): string[] {
  const lines = value.split(/\r?\n/)
  if (lines.at(-1) === '') lines.pop()
  return lines
}
