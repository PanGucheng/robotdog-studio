// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { createElement, act } from 'react'
import { createRoot } from 'react-dom/client'
import { renderToString } from 'react-dom/server'
import { BreadcrumbNav, type BreadcrumbItem } from './BreadcrumbNav'

// @ts-expect-error React testing flag
globalThis.IS_REACT_ACT_ENVIRONMENT = true

describe('BreadcrumbNav', () => {
  it('renders single current item as non-clickable text', () => {
    const items: BreadcrumbItem[] = [
      { key: 'about', label: '关于', current: true }
    ]
    const html = renderToString(createElement(BreadcrumbNav, { items }))
    expect(html).toContain('关于')
    expect(html).not.toContain('<button')
    expect(html).toContain('aria-current="page"')
  })

  it('renders two-level breadcrumb with clickable parent and current child', async () => {
    const onClick = vi.fn()
    const items: BreadcrumbItem[] = [
      { key: 'course-center', label: '课程中心', level: 'root', onClick },
      { key: 'lesson-1', label: '第一课：认识单片机', current: true }
    ]

    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)

    await act(async () => {
      root.render(createElement(BreadcrumbNav, { items }))
    })

    const buttons = container.querySelectorAll('button')
    expect(buttons.length).toBe(1)
    expect(buttons[0]?.textContent).toBe('课程中心')

    const current = container.querySelector('.is-current')
    expect(current?.textContent).toContain('第一课：认识单片机')

    await act(async () => {
      buttons[0]?.click()
    })
    expect(onClick).toHaveBeenCalledTimes(1)

    document.body.removeChild(container)
  })

  it('renders three-level course workspace breadcrumb correctly', async () => {
    const onCourseCenter = vi.fn()
    const onLesson = vi.fn()
    const items: BreadcrumbItem[] = [
      { key: 'course-center', label: '课程中心', level: 'root', onClick: onCourseCenter },
      { key: 'lesson-1', label: '第一课：认识单片机', level: 'parent', onClick: onLesson },
      { key: 'workspace', label: '实验工作台', current: true }
    ]

    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)

    await act(async () => {
      root.render(createElement(BreadcrumbNav, { items }))
    })

    const buttons = container.querySelectorAll('button')
    expect(buttons.length).toBe(2)
    expect(buttons[0]?.textContent).toBe('课程中心')
    expect(buttons[1]?.textContent).toBe('第一课：认识单片机')

    const current = container.querySelector('.breadcrumb-level-current')
    expect(current?.textContent).toContain('实验工作台')

    await act(async () => {
      buttons[1]?.click()
    })
    expect(onLesson).toHaveBeenCalledTimes(1)
    expect(onCourseCenter).not.toHaveBeenCalled()

    await act(async () => {
      buttons[0]?.click()
    })
    expect(onCourseCenter).toHaveBeenCalledTimes(1)

    document.body.removeChild(container)
  })
})
