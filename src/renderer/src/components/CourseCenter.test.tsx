// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import type { CourseDetail, CourseLesson } from '../../../shared/types'
import courseResource from '../../../../resources/courses/mcu-foundations/ch32v203-foundations/course.json'
import first from '../../../../resources/courses/mcu-foundations/ch32v203-foundations/lessons/first-program-on-chip.json'
import second from '../../../../resources/courses/mcu-foundations/ch32v203-foundations/lessons/gpio-output.json'
import { CourseCenter } from './CourseCenter'

// @ts-expect-error React testing flag
globalThis.IS_REACT_ACT_ENVIRONMENT = true
let root: Root | undefined
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () { this.open = true }
  HTMLDialogElement.prototype.close = function () { this.open = false }
})
afterEach(async () => { await act(async () => root?.unmount()); root = undefined; document.body.replaceChildren(); vi.restoreAllMocks() })
const lessons = [first, second].map((item, order) => ({ ...item, order, contentVersion: courseResource.contentVersion, progressCompatibleFrom: [], learningCompatibleFrom: [] })) as CourseLesson[]
const course: CourseDetail = { ...courseResource, status: 'published', lessonCount: 2, lessons }
async function mount(completedLessonIds: string[] = []): Promise<{ container: HTMLDivElement; open: ReturnType<typeof vi.fn> }> {
  const container = document.createElement('div'); document.body.append(container); root = createRoot(container)
  const open = vi.fn()
  await act(async () => root!.render(createElement(CourseCenter, { courses: [course], course, lesson: lessons[1], loading: false, completedLessonIds, onSelectLesson: vi.fn(), onOpenLesson: open })))
  return { container, open }
}

describe('course prerequisites dialog', () => {
  it('keeps the selected course unopened on cancel and proceeds only after explicit confirmation', async () => {
    const nativeConfirm = vi.spyOn(window, 'confirm')
    const { container, open } = await mount()
    await act(async () => container.querySelector<HTMLButtonElement>('.course-start-button')!.click())
    expect(open).not.toHaveBeenCalled()
    expect(container.querySelector('dialog')?.textContent).toContain(first.title)
    await act(async () => container.querySelector<HTMLDialogElement>('dialog')!.dispatchEvent(new Event('cancel', { cancelable: true })))
    expect(container.querySelector('dialog')).toBeNull()
    expect(open).not.toHaveBeenCalled()
    await act(async () => container.querySelector<HTMLButtonElement>('.course-start-button')!.click())
    await act(async () => container.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })))
    expect(open).toHaveBeenCalledExactlyOnceWith(second.lessonId)
    expect(nativeConfirm).not.toHaveBeenCalled()
  })

  it('opens directly after the prerequisite was completed', async () => {
    const { container, open } = await mount([first.lessonId])
    await act(async () => container.querySelector<HTMLButtonElement>('.course-start-button')!.click())
    expect(container.querySelector('dialog')).toBeNull()
    expect(open).toHaveBeenCalledExactlyOnceWith(second.lessonId)
  })
})
