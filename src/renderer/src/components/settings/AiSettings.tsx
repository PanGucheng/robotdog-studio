import type { JSX } from 'react'
import type { AgentRuntimeStatus } from '../../../../shared/types'

export interface AiSettingsProps {
  agentRuntime?: AgentRuntimeStatus
  apiKey: string
  onApiKeyChange(value: string): void
  onSave(): void
  onClear(): void
  agentError?: string
}

export function AiSettings({
  agentRuntime,
  apiKey,
  onApiKeyChange,
  onSave,
  onClear,
  agentError
}: AiSettingsProps): JSX.Element {
  const isReady = Boolean(agentRuntime?.ready)

  return (
    <div className="settings-panel">
      <div className="settings-panel-header">
        <h3 className="settings-panel-title">AI 助教</h3>
      </div>

      <section className="settings-section" aria-labelledby="ai-status-heading">
        <h4 id="ai-status-heading" className="settings-section-title">运行状态</h4>
        <div className="settings-rows">
          <div className="settings-row">
            <span className="settings-row-label">模型</span>
            <span className="settings-row-value">DeepSeek V4.1 Flash</span>
          </div>
          <div className="settings-row">
            <span className="settings-row-label">运行环境</span>
            <span className="settings-row-value">
              {agentRuntime?.adapter === 'reasonix' || agentRuntime?.adapter === 'mock'
                ? 'Reasonix ACP'
                : (agentRuntime?.adapter ?? 'Reasonix ACP')}
            </span>
          </div>
          <div className="settings-row">
            <span className="settings-row-label">状态</span>
            <div className="settings-row-value">
              <span className={`status-dot ${isReady ? 'dot-ready' : 'dot-waiting'}`} aria-hidden="true" />
              <span>{isReady ? '已就绪' : '等待配置'}</span>
            </div>
          </div>
        </div>
        {agentRuntime?.detail && (
          <p className="settings-detail-note">{agentRuntime.detail}</p>
        )}
      </section>

      <div className="settings-divider" />

      <section className="settings-section" aria-labelledby="ai-key-heading">
        <h4 id="ai-key-heading" className="settings-section-title">API Key</h4>
        <p className="settings-section-desc">密钥由 Windows 安全存储，界面不会读取已保存的明文。</p>

        <div className="settings-input-group">
          <input
            type="password"
            className="settings-text-input"
            value={apiKey}
            placeholder={agentRuntime?.apiKeyConfigured ? '已配置，输入新密钥可替换' : '请输入 API Key'}
            autoComplete="off"
            onChange={(e) => onApiKeyChange(e.target.value)}
            aria-label="DeepSeek API Key"
          />
        </div>

        {agentError && <p className="settings-error-note">{agentError}</p>}

        <div className="settings-action-row">
          <button
            type="button"
            className="settings-btn-primary"
            disabled={!apiKey.trim()}
            onClick={onSave}
          >
            保存
          </button>
          <button
            type="button"
            className="settings-btn-secondary"
            disabled={!agentRuntime?.apiKeyConfigured}
            onClick={onClear}
          >
            清除密钥
          </button>
        </div>
      </section>
    </div>
  )
}
