import { ArrowUp, Bot, CheckCircle2, Sparkles } from 'lucide-react'

export function ChatPanel(): React.JSX.Element {
  return (
    <section className="chat-panel">
      <div className="section-heading">
        <div>
          <span className="eyebrow">AI 助教</span>
          <h2>把想法说给小马听</h2>
        </div>
        <span className="model-chip"><Sparkles size={14} /> 教学模式</span>
      </div>

      <div className="conversation">
        <div className="message student-message">小马转弯太猛了，温柔一点。</div>
        <div className="message assistant-message">
          <span className="assistant-mark"><Bot size={16} /></span>
          <div>
            <p>我会先检查转弯幅度，再给你一份可以撤销的修改。</p>
            <div className="change-card">
              <span className="change-status"><CheckCircle2 size={15} /> 演示建议</span>
              <strong>大转弯幅度：24° → 18°</strong>
              <small>转弯会更平稳，但遇到急弯时需要更早开始调整。</small>
              <div className="change-actions">
                <button type="button">查看修改</button>
                <button type="button" className="button-primary">准备编译</button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="prompt-box">
        <textarea aria-label="告诉 AI 你希望机器马做什么" placeholder="例如：检测一下黑线，或者让转弯更平稳…" rows={3} />
        <div className="prompt-footer">
          <span>Enter 发送 · Shift+Enter 换行</span>
          <button type="button" aria-label="发送消息"><ArrowUp size={18} /></button>
        </div>
      </div>
    </section>
  )
}
