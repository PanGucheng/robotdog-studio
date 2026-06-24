import { AlertTriangle, ChevronDown, Lightbulb, Wrench } from 'lucide-react'
import type { StudentProblem } from '../lib/student-errors'

interface ProblemCardProps {
  problem: StudentProblem
  tone?: 'warning' | 'danger'
  compact?: boolean
  primaryAction?: { label: string; onClick(): void; disabled?: boolean }
  secondaryAction?: { label: string; onClick(): void; disabled?: boolean }
}

export function ProblemCard({ problem, tone = 'warning', compact = false, primaryAction, secondaryAction }: ProblemCardProps): React.JSX.Element {
  return (
    <article className={`problem-card ${tone === 'danger' ? 'is-danger' : ''} ${compact ? 'is-compact' : ''}`} role="status">
      <div className="problem-card-head">
        <span><AlertTriangle size={compact ? 16 : 19} /></span>
        <div>
          <strong>{problem.title}</strong>
          <p>{problem.whatHappened}</p>
        </div>
      </div>
      {!compact && (
        <div className="problem-card-body">
          <div><Lightbulb size={15} /><span><b>为什么会这样</b>{problem.why}</span></div>
          <div><Wrench size={15} /><span><b>你可以怎么做</b>{problem.nextStep}</span></div>
        </div>
      )}
      {compact && <p className="problem-card-next">{problem.nextStep}</p>}
      {(primaryAction || secondaryAction || problem.technicalDetail) && (
        <div className="problem-card-actions">
          {secondaryAction && <button type="button" onClick={secondaryAction.onClick} disabled={secondaryAction.disabled}>{secondaryAction.label}</button>}
          {primaryAction && <button type="button" className="button-primary" onClick={primaryAction.onClick} disabled={primaryAction.disabled}>{primaryAction.label}</button>}
          {problem.technicalDetail && (
            <details>
              <summary><ChevronDown size={13} /> 查看技术细节</summary>
              <code>{problem.technicalDetail}</code>
            </details>
          )}
        </div>
      )}
    </article>
  )
}
