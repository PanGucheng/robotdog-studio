// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { createElement, act } from 'react'
import { createRoot } from 'react-dom/client'
import { DisplaySettings } from './DisplaySettings'

// @ts-expect-error React testing flag
globalThis.IS_REACT_ACT_ENVIRONMENT = true

describe('DisplaySettings', () => {
  let container: HTMLDivElement

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
  })

  afterEach(() => {
    document.body.removeChild(container)
  })

  it('renders default General tab without obsolete instructional cards', async () => {
    const onScaleChange = vi.fn()
    const onClose = vi.fn()

    const root = createRoot(container)
    await act(async () => {
      root.render(
        createElement(DisplaySettings, {
          scale: 125,
          onScaleChange,
          onClose
        })
      )
    })

    // Header & Sidebar
    expect(container.textContent).toContain('设置')
    expect(container.textContent).toContain('常规')
    expect(container.textContent).toContain('AI 助教')
    expect(container.textContent).toContain('课程与更新')
    expect(container.textContent).toContain('高级')

    // General section
    expect(container.textContent).toContain('界面缩放')
    expect(container.textContent).toContain('100%')
    expect(container.textContent).toContain('125%')
    expect(container.textContent).toContain('150%')
    expect(container.textContent).toContain('175%')
    expect(container.textContent).toContain('推荐用于 27 英寸 2K 屏幕')

    // Must NOT contain removed concepts
    expect(container.textContent).not.toContain('学习步骤')
    expect(container.textContent).not.toContain('文字优先')
    expect(container.textContent).not.toContain('教师诊断')
    expect(container.textContent).not.toContain('临时 SDK 基线')
  })

  it('calls onScaleChange when a scale button is clicked', async () => {
    const onScaleChange = vi.fn()
    const root = createRoot(container)

    await act(async () => {
      root.render(
        createElement(DisplaySettings, {
          scale: 125,
          onScaleChange,
          onClose: vi.fn()
        })
      )
    })

    const scaleBtns = container.querySelectorAll<HTMLButtonElement>('.scale-btn')
    expect(scaleBtns.length).toBe(4)

    // Click 150%
    await act(async () => {
      scaleBtns[2]?.click()
    })
    expect(onScaleChange).toHaveBeenCalledWith(150)
  })

  it('navigates to AI tab and renders clean model and key configuration', async () => {
    const root = createRoot(container)
    await act(async () => {
      root.render(
        createElement(DisplaySettings, {
          scale: 125,
          onScaleChange: vi.fn(),
          onClose: vi.fn()
        })
      )
    })

    const navItems = container.querySelectorAll<HTMLButtonElement>('.settings-nav-item')
    // Click AI 助教
    await act(async () => {
      navItems[1]?.click()
    })

    expect(container.textContent).toContain('DeepSeek V4.1 Flash')
    expect(container.textContent).toContain('Reasonix ACP')
    expect(container.textContent).toContain('API Key')
    expect(container.textContent).toContain('密钥由 Windows 安全存储')

    const keyInput = container.querySelector<HTMLInputElement>('input[type="password"]')
    expect(keyInput).not.toBeNull()
  })

  it('navigates to Course & Updates tab and renders update info', async () => {
    const root = createRoot(container)
    await act(async () => {
      root.render(
        createElement(DisplaySettings, {
          scale: 125,
          onScaleChange: vi.fn(),
          onClose: vi.fn()
        })
      )
    })

    const navItems = container.querySelectorAll<HTMLButtonElement>('.settings-nav-item')
    // Click 课程与更新
    await act(async () => {
      navItems[2]?.click()
    })

    expect(container.textContent).toContain('教学内容')
    expect(container.textContent).toContain('教学内容版本')
    expect(container.textContent).toContain('更新状态')
    expect(container.textContent).toContain('检查教学内容更新')
  })

  it('navigates to Advanced tab and renders diagnostics and dev environment without teacher wording', async () => {
    const root = createRoot(container)
    await act(async () => {
      root.render(
        createElement(DisplaySettings, {
          scale: 125,
          onScaleChange: vi.fn(),
          onClose: vi.fn(),
          baseline: {
            id: 'ch32v203-rhs',
            label: 'CH32V203 RHS provisional',
            sourceRoot: '',
            expectedCommit: '',
            status: 'provisional',
            readyForTesting: true,
            releaseEligible: false,
            verifiedFiles: [],
            errors: [],
            warnings: [],
            memory: { flashBytes: 0, ramBytes: 0, confirmed: false }
          }
        })
      )
    })

    const navItems = container.querySelectorAll<HTMLButtonElement>('.settings-nav-item')
    // Click 高级
    await act(async () => {
      navItems[3]?.click()
    })

    // "教师诊断" must be replaced by "诊断与数据"
    expect(container.textContent).toContain('诊断与数据')
    expect(container.textContent).not.toContain('教师诊断')

    expect(container.textContent).toContain('本机工作区')
    expect(container.textContent).toContain('数据位置')
    expect(container.textContent).toContain('导出诊断文件')
    expect(container.textContent).toContain('打开数据文件夹')

    // Development environment
    expect(container.textContent).toContain('开发环境')
    expect(container.textContent).toContain('程序翻译工具')
    expect(container.textContent).toContain('固件基线')
    // Must NOT contain provisional or 临时 SDK in user label
    expect(container.textContent).not.toContain('临时 SDK 基线')
  })

  it('handles close button click, Escape key, and backdrop click', async () => {
    const onClose = vi.fn()
    const root = createRoot(container)

    await act(async () => {
      root.render(
        createElement(DisplaySettings, {
          scale: 125,
          onScaleChange: vi.fn(),
          onClose
        })
      )
    })

    const closeBtn = container.querySelector<HTMLButtonElement>('.settings-dialog-close')
    expect(closeBtn).not.toBeNull()

    // 1. Click close button
    await act(async () => {
      closeBtn?.click()
    })
    expect(onClose).toHaveBeenCalledTimes(1)

    // 2. Press Escape key
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    })
    expect(onClose).toHaveBeenCalledTimes(2)

    // 3. Click backdrop overlay
    const overlay = container.querySelector<HTMLDivElement>('.mcu-settings-overlay')
    await act(async () => {
      overlay?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(onClose).toHaveBeenCalledTimes(3)
  })
})
