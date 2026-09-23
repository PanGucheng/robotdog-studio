import { describe, expect, it } from 'vitest'
import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import { McuHome } from './McuHome'
import type { WorkspaceSummary } from '../../../shared/types'

describe('McuHome free practice filtering and Pony presentation', () => {
  const ponySandbox: WorkspaceSummary = {
    id: 'ws_pony_001',
    name: '2026-09-23 16:00 小马自由练习',
    studentDisplayName: '小明',
    learningPath: 'mcu-foundations',
    platform: 'wch-ch32v203',
    target: 'CH32V203C8T6',
    toolchainProfile: 'wch-gcc12-openocd',
    workspacePurpose: 'mcu-sandbox',
    templateId: 'ch32v203-pony',
    templateVersion: '0.2.5',
    firmwareBaselineId: 'ch32v203-pony-v25',
    baselineCommit: '797dd6a0a53277197a7c54db2bb4a37debd0a9b0',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    headCommit: '797dd6a000000000000000000000000000000000',
    state: 'ready'
  }

  const lessonAttempt: WorkspaceSummary = {
    id: 'ws_lesson_001',
    name: '流水灯实验 · 第 1 次',
    studentDisplayName: '小明',
    learningPath: 'mcu-foundations',
    platform: 'wch-ch32v203',
    target: 'CH32V203C8T6',
    toolchainProfile: 'wch-gcc12-openocd',
    workspacePurpose: 'mcu-lesson-attempt',
    templateId: 'ch32v203-mcu-lessons',
    templateVersion: '0.1.0',
    courseBinding: { courseId: 'c1', lessonId: 'l1', attemptNumber: 1, contentVersion: 1 },
    firmwareBaselineId: 'ch32v203-rhs-baseline',
    baselineCommit: '539e35a8c307843000d4bc25fb618c3143fb5b2d',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    headCommit: '539e35a000000000000000000000000000000000',
    state: 'ready'
  }

  const funProject: WorkspaceSummary = {
    id: 'ws_fun_001',
    name: '巡线趣味工程',
    studentDisplayName: '小红',
    learningPath: 'fun-line-following',
    platform: 'wch-ch32v203',
    target: 'CH32V203C8T6',
    toolchainProfile: 'wch-gcc12-openocd',
    workspacePurpose: 'fun-project',
    templateId: 'ch32v203-robotdog',
    templateVersion: '2026.06',
    firmwareBaselineId: 'ch32v203-robotdog-provisional-0858d82',
    baselineCommit: '0858d821d56daaea6e45740f5b496714fea20aca',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    headCommit: '0858d82000000000000000000000000000000000',
    state: 'ready'
  }

  it('renders only mcu-sandbox workspaces in free-practice panel and highlights Pony v2.5', () => {
    const html = renderToString(
      createElement(McuHome, {
        panel: 'free-practice',
        workspaces: [ponySandbox, lessonAttempt, funProject],
        learning: [],
        recent: [],
        busy: false,
        onNavigate: () => undefined,
        onCreateWorkspace: () => undefined
      })
    )

    // Contains the sandbox project
    expect(html).toContain('小马自由练习')
    expect(html).toContain('完整小马固件 · Pony v2.5')

    // Filtered out lesson attempt and fun project
    expect(html).not.toContain('流水灯实验')
    expect(html).not.toContain('巡线趣味工程')

    // Creation card details
    expect(html).toContain('创建自由练习工程')
    expect(html).toContain('基于 Pony v2.5 全功能小马固件')
  })

  it('renders landing panel with free practice entry pointing to Pony v2.5', () => {
    const html = renderToString(
      createElement(McuHome, {
        panel: 'landing',
        workspaces: [ponySandbox, lessonAttempt],
        learning: [],
        recent: [{ kind: 'workspace', workspaceId: ponySandbox.id, openedAt: new Date().toISOString() }],
        busy: false,
        onNavigate: () => undefined,
        onCreateWorkspace: () => undefined
      })
    )

    expect(html).toContain('FREE WORKSHOP')
    expect(html).toContain('自由练习')
    expect(html).toContain('基于 Pony v2.5 全功能小马固件')
    expect(html).toContain('小马自由练习')
  })

  it('keeps creation card enabled when busy is false, and disabled when busy is true', () => {
    const enabledHtml = renderToString(
      createElement(McuHome, {
        panel: 'free-practice',
        workspaces: [],
        learning: [],
        recent: [],
        busy: false,
        onNavigate: () => undefined,
        onCreateWorkspace: () => undefined
      })
    )
    expect(enabledHtml).toContain('class="mcu-create-free"')
    expect(enabledHtml).not.toContain('disabled=""')

    const disabledHtml = renderToString(
      createElement(McuHome, {
        panel: 'free-practice',
        workspaces: [],
        learning: [],
        recent: [],
        busy: true,
        onNavigate: () => undefined,
        onCreateWorkspace: () => undefined
      })
    )
    expect(disabledHtml).toContain('disabled=""')
  })
})
