// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { createElement, createRef, act } from 'react'
import { createRoot } from 'react-dom/client'
import { renderToString } from 'react-dom/server'
import { AboutPage } from './AboutPage'
import { ProjectMenu } from './ProjectMenu'
import { EDITION_PROFILES } from '../../../shared/edition'

// @ts-expect-error React testing flag
globalThis.IS_REACT_ACT_ENVIRONMENT = true

describe('AboutPage static rendering', () => {
  it('renders RoboHorse Studio brand, project description, developer, and return button', () => {
    const onBack = vi.fn()
    const html = renderToString(
      createElement(AboutPage, {
        edition: EDITION_PROFILES['mcu-foundations'],
        onBack
      })
    )

    // RoboHorse Studio 存在
    expect(html).toContain('RoboHorse')
    expect(html).toContain('Studio')
    expect(html).toContain('面向机器人与单片机教学的智能实验平台')

    // 项目介绍存在
    expect(html).toContain('关于项目')
    expect(html).toContain('RoboHorse Studio 是一套面向机器人与单片机教学的桌面实验平台')

    // 开发者 存在
    expect(html).toContain('开发者')
    expect(html).toContain('潘顾诚')
    expect(html).toContain('RoboHorse Studio开发')
    expect(html).toContain('乔芃森')
    expect(html).toContain('下位机软件开发')
    expect(html).toContain('陈庭锐')
    expect(html).toContain('PCB硬件设计')
    expect(html).toContain('杨杰')
    expect(html).toContain('机械设计')
    expect(html).toContain('杨一元')
    expect(html).toContain('about-developer-avatar')
    expect(html).toContain('about-developers-grid')

    // 当前发行版存在
    expect(html).toContain('当前发行版')
    expect(html).toContain('单片机入门版')
    expect(html).toContain('CH32V203 单片机学习工作台')

    // 版本信息存在
    expect(html).toContain('软件版本')
    expect(html).toContain('RoboHorse Studio v0.1.0')

    // 返回按钮存在
    expect(html).toContain('返回')
  })

  it('renders edition information dynamically for fun-line-following edition', () => {
    const html = renderToString(
      createElement(AboutPage, {
        edition: EDITION_PROFILES['fun-line-following'],
        onBack: () => undefined
      })
    )

    expect(html).toContain('当前发行版')
    expect(html).toContain('趣味巡线版')
    expect(html).toContain('巡线教学工作台')
  })

  it('renders edition information dynamically for ti-mspm0-foundations edition', () => {
    const html = renderToString(
      createElement(AboutPage, {
        edition: EDITION_PROFILES['ti-mspm0-foundations'],
        onBack: () => undefined
      })
    )

    expect(html).toContain('当前发行版')
    expect(html).toContain('TI MSPM0 教学版')
    expect(html).toContain('MSPM0G3507 · SysConfig 单片机学习工作台')
  })
})

describe('AboutPage and ProjectMenu interactive behavior', () => {
  let container: HTMLDivElement

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
  })

  afterEach(() => {
    document.body.removeChild(container)
  })

  it('calls onBack when return button is clicked', async () => {
    const onBack = vi.fn()
    const root = createRoot(container)
    await act(async () => {
      root.render(createElement(AboutPage, { edition: EDITION_PROFILES['mcu-foundations'], onBack }))
    })

    const backButton = container.querySelector<HTMLButtonElement>('.about-back-button')
    expect(backButton).not.toBeNull()
    await act(async () => {
      backButton?.click()
    })
    expect(onBack).toHaveBeenCalledTimes(1)
  })

  it('renders ProjectMenu and triggers onSelectAbout when menu item clicked', async () => {
    const onSelectAbout = vi.fn()
    const onClose = vi.fn()
    const anchor = document.createElement('div')
    document.body.appendChild(anchor)
    const anchorRef = { current: anchor }

    const root = createRoot(container)
    await act(async () => {
      root.render(createElement(ProjectMenu, { anchorRef, onClose, onSelectAbout }))
    })

    expect(container.textContent).toContain('RoboHorse Studio')
    expect(container.textContent).toContain('关于 RoboHorse Studio')

    const item = container.querySelector<HTMLButtonElement>('.project-menu-item')
    expect(item).not.toBeNull()
    await act(async () => {
      item?.click()
    })
    expect(onSelectAbout).toHaveBeenCalledTimes(1)

    document.body.removeChild(anchor)
  })

  it('closes ProjectMenu when Escape key is pressed', async () => {
    const onClose = vi.fn()
    const anchorRef = { current: null }

    const root = createRoot(container)
    await act(async () => {
      root.render(createElement(ProjectMenu, { anchorRef, onClose, onSelectAbout: vi.fn() }))
    })

    await act(async () => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('closes ProjectMenu when clicking outside', async () => {
    const onClose = vi.fn()
    const anchor = document.createElement('div')
    document.body.appendChild(anchor)
    const anchorRef = { current: anchor }

    const root = createRoot(container)
    await act(async () => {
      root.render(createElement(ProjectMenu, { anchorRef, onClose, onSelectAbout: vi.fn() }))
    })

    const outside = document.createElement('div')
    document.body.appendChild(outside)

    await act(async () => {
      outside.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
    })
    expect(onClose).toHaveBeenCalledTimes(1)

    document.body.removeChild(anchor)
    document.body.removeChild(outside)
  })
})
