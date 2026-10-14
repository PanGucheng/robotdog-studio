// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { StudioDialog } from './StudioDialog'

// @ts-expect-error React testing flag
globalThis.IS_REACT_ACT_ENVIRONMENT = true
let root: Root | undefined
beforeAll(() => {
  // jsdom lacks native modal behavior; Electron smoke and desktop checks cover it.
  HTMLDialogElement.prototype.showModal = function () { this.open = true }
  HTMLDialogElement.prototype.close = function () { this.open = false }
})
afterEach(async () => { await act(async () => root?.unmount()); root = undefined; document.body.replaceChildren() })
async function mount(props: Parameters<typeof StudioDialog>[0]): Promise<HTMLDialogElement> {
  const container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  await act(async () => root!.render(createElement(StudioDialog, props)))
  return container.querySelector('dialog')!
}
const common = { title: '建议先完成前置课', description: '你可以返回课程，也可以继续学习。', confirmLabel: '仍然开始学习' }

describe('StudioDialog', () => {
  it('cancels native Escape without confirming and restores the initiating focus', async () => {
    const opener = document.createElement('button'); document.body.append(opener); opener.focus()
    const onConfirm = vi.fn(), onCancel = vi.fn()
    const dialog = await mount({ ...common, onConfirm, onCancel })
    expect(dialog.open).toBe(true)
    expect(document.activeElement?.textContent).toBe('取消')
    await act(async () => dialog.dispatchEvent(new Event('cancel', { cancelable: true })))
    expect(onCancel).toHaveBeenCalledOnce()
    expect(onConfirm).not.toHaveBeenCalled()
    await act(async () => root!.unmount()); root = undefined
    expect(document.activeElement).toBe(opener)
  })

  it('requires a nonblank project name and selects the current name for editing', async () => {
    const dialog = await mount({ ...common, input: { label: '项目名称', initialValue: '   ', maxLength: 48 }, onConfirm: vi.fn(), onCancel: vi.fn() })
    const input = dialog.querySelector('input')!
    expect(document.activeElement).toBe(input)
    expect(input.selectionEnd).toBe(input.value.length)
    expect(input.maxLength).toBe(48)
    expect(dialog.querySelector<HTMLButtonElement>('button[type=submit]')!.disabled).toBe(true)
  })

  it('prevents duplicate saves and cancellation while saving, and preserves the name after an error', async () => {
    let reject!: (error: Error) => void
    const onConfirm = vi.fn(() => new Promise<void>((_, rejectPromise) => { reject = rejectPromise }))
    const onCancel = vi.fn()
    const dialog = await mount({ ...common, input: { label: '项目名称', initialValue: '  我的实验  ' }, onConfirm, onCancel })
    const form = dialog.querySelector('form')!
    await act(async () => { form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })) })
    expect(onConfirm).toHaveBeenCalledOnce()
    expect(onConfirm).toHaveBeenCalledWith('我的实验')
    expect(dialog.querySelector('input')!.disabled).toBe(true)
    await act(async () => dialog.dispatchEvent(new Event('cancel', { cancelable: true })))
    expect(onCancel).not.toHaveBeenCalled()
    await act(async () => reject(new Error('ENOSPC: failed to save workspace')))
    expect(dialog.querySelector('[role=alert]')?.textContent).toContain('磁盘空间不足')
    expect(dialog.querySelector('input')!.value).toBe('  我的实验  ')
    expect(dialog.querySelector('input')!.disabled).toBe(false)
  })
})
