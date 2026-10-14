// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ProjectExplorerNode, WorkspaceSummary } from '../../../shared/types'
import { browserDemoApi } from '../lib/browser-demo-api'
import { registerPendingSave } from '../lib/pending-saves'
import { StudentCodeEditor } from './StudentCodeEditor'

const update = vi.hoisted(() => ({ kind: 'idle' }))
vi.mock('./AppUpdateProvider', () => ({ useAppUpdate: () => ({ status: update }) }))
vi.mock('@monaco-editor/react', () => ({ default: ({ value, path }: { value: string; path: string }) => <pre data-editor-path={path}>{value}</pre> }))
// @ts-expect-error React test environment flag
globalThis.IS_REACT_ACT_ENVIRONMENT = true

describe('sandbox creation UI', () => {
  let root: Root
  let container: HTMLDivElement
  let nodes: ProjectExplorerNode[]
  const workspace = { id: 'ws_test', workspacePurpose: 'mcu-sandbox', state: 'ready', platform: 'wch-ch32v203', learningPath: 'mcu-foundations', headCommit: 'a'.repeat(40) } as WorkspaceSummary
  const node = (path: string, directory: boolean): ProjectExplorerNode => ({ id: path, parentId: path.includes('/') ? path.split('/').slice(0, -1).join('/') : undefined, name: path.split('/').at(-1)!, kind: directory ? 'directory' : 'file', origin: 'lesson-overlay', role: 'student-code', access: 'editable', state: 'normal', displayPath: path })
  beforeEach(() => {
    update.kind = 'idle'
    localStorage.clear()
    nodes = [node('src', true), node('src/main.c', false)]
    container = document.createElement('div'); document.body.append(container); root = createRoot(container)
    window.robotDog = { ...browserDemoApi,
      getProjectExplorer: vi.fn(async () => ({ workspaceId: workspace.id, rootLabel: 'test', baselineId: 'test', baselineCommit: 'a'.repeat(40), baselineAvailable: true, nodes: [...nodes] })),
      readProjectExplorerFile: vi.fn(async (_id, id) => ({ node: nodes.find(item => item.id === id)!, content: id === 'src/main.c' ? 'original student content' : '#pragma once\n' })),
      createWorkspaceFile: vi.fn(async (_id, parent, name) => { const path = parent ? `${parent}/${name}` : name; nodes.push(node(path, false)); return { workspace, path } }),
      createWorkspaceDirectory: vi.fn(async (_id, parent, name) => { const path = parent ? `${parent}/${name}` : name; nodes.push(node(path, true)); return { workspace, path } })
    }
  })
  afterEach(async () => { await act(async () => root.unmount()); container.remove(); delete (window as Partial<Window>).robotDog })
  async function render(busy = false, current = workspace): Promise<void> {
    await act(async () => root.render(<StudentCodeEditor workspace={current} busy={busy} explorerMode onCandidateChanged={() => {}} onReadyForReview={() => {}} onExplainCode={() => {}} onRepairStudentCode={() => {}} />))
  }
  const button = (text: string): HTMLButtonElement => [...document.querySelectorAll('button')].find(item => item.textContent === text)!
  async function openCreation(directory = false, path = 'src'): Promise<void> {
    const target = path ? [...container.querySelectorAll('[role=treeitem]')].find(item => item.getAttribute('title') === path)! : container.querySelector('.explorer-root')!
    await act(async () => target.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 30, clientY: 40 })))
    await act(async () => button(directory ? '新建文件夹' : '新建文件').click())
  }

  async function name(value: string): Promise<void> {
    const input = container.querySelector('input')!
    await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value); input.dispatchEvent(new Event('input', { bubbles: true })) })
  }
  async function submit(): Promise<void> { await act(async () => container.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))) }
  it('defaults to the current parent and opens the new file', async () => {
    await render()
    expect(container.querySelector('.sandbox-create-actions')).toBeNull()
    await openCreation()
    expect(container.querySelector('[title=src]')!.parentElement!.querySelector('.sandbox-inline-create')).not.toBeNull()
    expect(container.querySelector('[role=dialog]')).toBeNull()
    await name('helper.h'); await submit()
    expect(window.robotDog!.createWorkspaceFile).toHaveBeenCalledWith(workspace.id, 'src', 'helper.h')
    expect(container.querySelector('.student-editor-toolbar h2')!.textContent).toBe('helper.h')
    expect(container.querySelector('[data-editor-path]')!.textContent).toBe('#pragma once\n')
    expect(container.querySelector('[role=dialog]')).toBeNull()
  })
  it('creates an empty folder at the selected root without changing editor content', async () => {
    await render()
    await openCreation(true, '')
    expect(container.querySelector('select')).toBeNull()
    await name('modules'); await submit()
    expect(window.robotDog!.createWorkspaceDirectory).toHaveBeenCalledWith(workspace.id, '', 'modules')
    expect(container.querySelector('[data-editor-path]')!.textContent).toBe('original student content')
    expect([...container.querySelectorAll('[role=treeitem]')].some(item => item.textContent?.includes('modules'))).toBe(true)
  })
  it('stops creation and keeps the editor when flushing fails', async () => {
    await render()
    const unregister = registerPendingSave(async () => { throw new Error('SAVE_FAILED') })
    try {
      await openCreation()
      await name('failed.c'); await submit()
      expect(window.robotDog!.createWorkspaceFile).not.toHaveBeenCalled()
      expect(container.querySelector('.sandbox-inline-create')).not.toBeNull()
      expect(container.querySelector('[data-editor-path]')!.textContent).toBe('original student content')
      expect(container.querySelector('[role=alert]')).not.toBeNull()
    } finally { unregister() }
  })
  it('offers a directory context menu and disables creation during tasks or installation', async () => {
    await render()
    await act(async () => container.querySelector('[role=treeitem]')!.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 30, clientY: 40 })))
    expect(document.querySelectorAll('[role=menuitem]')).toHaveLength(2)
    const menu = document.querySelector<HTMLElement>('[role=menu]')!
    expect(menu.closest('.student-code-studio')).toBeNull()
    expect(menu.style.left).toBe('30px')
    expect(menu.style.top).toBe('40px')
    await act(async () => document.querySelector<HTMLElement>('.sandbox-menu-dismiss')!.click())
    await render(true)
    await act(async () => container.querySelector('[role=treeitem]')!.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true })))
    expect(document.querySelector('[role=menu]')).toBeNull()
    update.kind = 'installing'; await render(false)
    await act(async () => container.querySelector('[role=treeitem]')!.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true })))
    expect(document.querySelector('[role=menu]')).toBeNull()
    update.kind = 'idle'; await render(false, { ...workspace, activeCandidateId: 'cand_active' })
    await act(async () => container.querySelector('[role=treeitem]')!.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true })))
    expect(document.querySelector('[role=menu]')).toBeNull()
  })
  it('cancels inline creation with Escape and keeps the current editor', async () => {
    await render(); await openCreation(); await name('cancelled.c')
    await act(async () => container.querySelector('input')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })))
    expect(container.querySelector('.sandbox-inline-create')).toBeNull()
    expect(window.robotDog!.createWorkspaceFile).not.toHaveBeenCalled()
    expect(container.querySelector('[data-editor-path]')!.textContent).toBe('original student content')
  })
  it('ignores repeated Enter submissions while waiting for pending saves', async () => {
    await render(); await openCreation(); await name('once.h')
    let finish!: () => void
    const unregister = registerPendingSave(() => new Promise<void>(resolve => { finish = resolve }))
    try {
      await act(async () => { const form = container.querySelector('form')!; form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })) })
      expect(window.robotDog!.createWorkspaceFile).not.toHaveBeenCalled()
      await act(async () => finish())
      expect(window.robotDog!.createWorkspaceFile).toHaveBeenCalledTimes(1)
    } finally { unregister() }
  })

  it('clamps the portal menu using its measured screen size at the viewport edges', async () => {
    const measure = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ width: 255, height: 120 } as DOMRect)
    try {
      await render()
      await act(async () => container.querySelector('[role=treeitem]')!.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: window.innerWidth - 10, clientY: window.innerHeight - 10 })))
      const menu = document.querySelector<HTMLElement>('[role=menu]')!
      expect(menu.style.left).toBe(`${window.innerWidth - 255}px`)
      expect(menu.style.top).toBe(`${window.innerHeight - 120}px`)
      await act(async () => window.dispatchEvent(new Event('resize')))
      expect(document.querySelector('[role=menu]')).toBeNull()
    } finally { measure.mockRestore() }
  })

})
