import type { JSX } from 'react'
import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import type { AppEditionProfile } from '../../../shared/edition'
import type { AgentRuntimeStatus, AppRuntimeInfo, CourseUpdateStatus, DiagnosticExportResult, FirmwareBaselineStatus, ToolchainStatus } from '../../../shared/types'
import type { UiScale } from '../lib/ui-scale'
import { getRobotApi } from '../lib/browser-demo-api'
import { type StudentProblem, toStudentErrorMessage, toStudentProblem } from '../lib/student-errors'
import { SettingsSidebar, type SettingsCategoryId } from './settings/SettingsSidebar'
import { GeneralSettings } from './settings/GeneralSettings'
import { AiSettings } from './settings/AiSettings'
import { CourseUpdateSettings } from './settings/CourseUpdateSettings'
import { AdvancedSettings } from './settings/AdvancedSettings'
import { AppUpdateControls, useAppUpdate } from './AppUpdateProvider'

export interface DisplaySettingsProps {
  scale: UiScale
  toolchain?: ToolchainStatus
  baseline?: FirmwareBaselineStatus
  onScaleChange(scale: UiScale): void
  onClose?(): void
}

let rememberedCategory: SettingsCategoryId = 'general'

export function DisplaySettings({
  scale,
  toolchain,
  baseline,
  onScaleChange,
  onClose
}: DisplaySettingsProps): JSX.Element {
  const appUpdate = useAppUpdate()
  const [activeCategory, setActiveCategory] = useState<SettingsCategoryId>(rememberedCategory)
  const [runtime, setRuntime] = useState<AppRuntimeInfo>()
  const [diagnostic, setDiagnostic] = useState<DiagnosticExportResult>()
  const [error, setError] = useState<StudentProblem>()
  const [busy, setBusy] = useState(false)
  const [agentRuntime, setAgentRuntime] = useState<AgentRuntimeStatus>()
  const [apiKey, setApiKey] = useState('')
  const [agentError, setAgentError] = useState('')
  const [courseUpdate, setCourseUpdate] = useState<CourseUpdateStatus>()
  const [courseChecking, setCourseChecking] = useState(false)
  const [editionProfile, setEditionProfile] = useState<AppEditionProfile>()

  const handleSelectCategory = (category: SettingsCategoryId): void => {
    rememberedCategory = category
    setActiveCategory(category)
  }

  useEffect(() => {
    if (!onClose) return
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  useEffect(() => {
    void getRobotApi().getRuntimeInfo().then(setRuntime).catch((caught) => setError(toStudentProblem(caught, '设置状态读取失败')))
  }, [])

  useEffect(() => {
    void getRobotApi().getEditionProfile().then(setEditionProfile).catch(() => {})
  }, [])

  useEffect(() => {
    void getRobotApi().getAgentRuntimeStatus().then(setAgentRuntime).catch((caught) => setAgentError(toStudentErrorMessage(caught)))
  }, [])

  useEffect(() => {
    void getRobotApi().getCourseUpdateStatus?.().then(setCourseUpdate).catch(() => {})
    const unsubscribe = getRobotApi().onCourseUpdate?.((status) => {
      setCourseUpdate(status)
      if (status.kind !== 'checking' && status.kind !== 'downloading') {
        setCourseChecking(false)
      }
    })
    return () => unsubscribe?.()
  }, [])

  const handleSaveApiKey = (): void => {
    setAgentError('')
    void getRobotApi()
      .setAgentApiKey(apiKey)
      .then((value) => {
        setAgentRuntime(value)
        setApiKey('')
      })
      .catch((caught) => setAgentError(toStudentErrorMessage(caught)))
  }

  const handleClearApiKey = (): void => {
    setAgentError('')
    void getRobotApi()
      .clearAgentApiKey()
      .then(setAgentRuntime)
      .catch((caught) => setAgentError(toStudentErrorMessage(caught)))
  }

  const handleCheckCourseUpdate = (): void => {
    setCourseChecking(true)
    void getRobotApi().checkCourseUpdate?.().then((status) => {
      setCourseUpdate(status)
    }).catch((caught) => {
      setCourseUpdate({
        kind: 'error',
        message: '教学内容更新失败，继续使用当前版本',
        currentVersion: courseUpdate?.currentVersion ?? 0,
        error: caught instanceof Error ? caught.message : String(caught)
      })
    }).finally(() => {
      setCourseChecking(false)
    })
  }

  const exportDiagnostics = (): void => {
    setBusy(true)
    setError(undefined)
    void getRobotApi()
      .exportDiagnostics()
      .then(setDiagnostic)
      .catch((caught) => setError(toStudentProblem(caught, '诊断文件没有导出')))
      .finally(() => setBusy(false))
  }

  const handleOpenDataDirectory = (): void => {
    void getRobotApi()
      .openDataDirectory()
      .catch((caught) => setError(toStudentProblem(caught, '数据文件夹没有打开')))
  }

  const dialogContent = (
    <div className="settings-dialog">
      <header className="settings-dialog-header">
        <h2 className="settings-dialog-title">设置</h2>
        {onClose && (
          <button
            type="button"
            className="settings-dialog-close"
            onClick={onClose}
            aria-label="关闭设置"
          >
            <X size={18} />
          </button>
        )}
      </header>

      <div className="settings-dialog-body">
        <SettingsSidebar activeId={activeCategory} onSelect={handleSelectCategory} />

        <main className="settings-content">
          {activeCategory === 'app-update' && <div className="settings-panel">
            <div className="settings-panel-header"><h3 className="settings-panel-title">软件更新</h3></div>
            <section className="settings-section">
              <h4 className="settings-section-title">RoboHorse Studio {appUpdate.status.currentVersion}</h4>
              <p className="settings-section-desc">更新软件功能及 Windows 安装包。课程、模板与 Firmware Baseline 通过教学内容更新独立维护。</p>
              <AppUpdateControls />
            </section>
          </div>}
          {activeCategory === 'general' && (
            <GeneralSettings scale={scale} onScaleChange={onScaleChange} />
          )}

          {activeCategory === 'ai' && (
            <AiSettings
              agentRuntime={agentRuntime}
              apiKey={apiKey}
              onApiKeyChange={setApiKey}
              onSave={handleSaveApiKey}
              onClear={handleClearApiKey}
              agentError={agentError}
            />
          )}

          {activeCategory === 'courses' && (
            <CourseUpdateSettings
              editionProfile={editionProfile}
              courseUpdate={courseUpdate}
              courseChecking={courseChecking}
              onCheckUpdate={handleCheckCourseUpdate}
            />
          )}

          {activeCategory === 'advanced' && (
            <AdvancedSettings
              runtime={runtime}
              toolchain={toolchain}
              baseline={baseline}
              editionProfile={editionProfile}
              diagnostic={diagnostic}
              error={error}
              busy={busy}
              onExportDiagnostics={exportDiagnostics}
              onOpenDataDirectory={handleOpenDataDirectory}
            />
          )}
        </main>
      </div>
    </div>
  )

  if (onClose) {
    return (
      <div
        className="mcu-settings-overlay"
        role="dialog"
        aria-modal="true"
        aria-label="Studio 设置"
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose()
        }}
      >
        {dialogContent}
      </div>
    )
  }

  return (
    <div className="display-settings">
      {dialogContent}
    </div>
  )
}
