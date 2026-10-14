import { beforeEach, describe, expect, it } from 'vitest'
import { browserDemoApi, setDemoEdition } from './browser-demo-api'

describe('browserDemoApi MCU Pony v2.5 workflow', () => {
  beforeEach(() => {
    setDemoEdition('mcu-foundations')
  })

  it('creates an mcu-sandbox workspace on Pony v2.5 baseline', async () => {
    const ws = await browserDemoApi.createWorkspace({
      studentDisplayName: '小明'
    })

    expect(ws.learningPath).toBe('mcu-foundations')
    expect(ws.workspacePurpose).toBe('mcu-sandbox')
    expect(ws.templateId).toBe('ch32v203-pony')
    expect(ws.templateVersion).toBe('0.2.5')
    expect(ws.firmwareBaselineId).toBe('ch32v203-pony-v25')
    expect(ws.baselineCommit).toBe('797dd6a0a53277197a7c54db2bb4a37debd0a9b0')
    expect(ws.name).toContain('小马自由练习')
  })

  it('lists all free engineering files as editable', async () => {
    const ws = await browserDemoApi.createWorkspace({ studentDisplayName: '小明' })
    const files = await browserDemoApi.listStudentCodeFiles(ws.id)

    const expC = files.find((f) => f.path === 'App/Src/experiment.c')
    const expH = files.find((f) => f.path === 'App/Inc/experiment.h')
    const ctrlC = files.find((f) => f.path === 'Core/Src/student_control.c')
    const ctrlH = files.find((f) => f.path === 'Core/Inc/student_control.h')

    expect(expC).toBeDefined()
    expect(expC?.editable).toBe(true)
    expect(expC?.group).toBe('工程文件')

    expect(expH).toBeDefined()
    expect(expH?.editable).toBe(true)

    expect(ctrlC).toBeDefined()
    expect(ctrlC?.editable).toBe(true)
    expect(ctrlC?.group).toBe('工程文件')

    expect(ctrlH).toBeDefined()
    expect(ctrlH?.editable).toBe(true)
  })

  it('builds Project Explorer tree with Pony v2.5 root label and correct file permissions', async () => {
    const ws = await browserDemoApi.createWorkspace({ studentDisplayName: '小明' })
    const explorer = await browserDemoApi.getProjectExplorer(ws.id)

    expect(explorer.rootLabel).toBe('Pony v2.5 Firmware · 797dd6a')
    expect(explorer.baselineId).toBe('ch32v203-pony-v25')

    const expNode = explorer.nodes.find((n) => n.kind === 'file' && n.displayPath === 'App/Src/experiment.c')
    expect(expNode?.access).toBe('editable')
    expect(expNode?.origin).toBe('lesson-overlay')

    const userMain = explorer.nodes.find((n) => n.kind === 'file' && n.displayPath === 'User/main.c')
    expect(userMain?.access).toBe('editable')
    expect(userMain?.origin).toBe('firmware-baseline')

    const coreBridge = explorer.nodes.find((n) => n.kind === 'file' && n.displayPath === 'Core/Src/student_control.c')
    expect(coreBridge?.access).toBe('editable')

    const ponyManifest = explorer.nodes.find((n) => n.kind === 'file' && n.displayPath === 'pony.firmware.json')
    expect(ponyManifest?.access).toBe('editable')
  })

  it('reads project explorer files including Pony specific runtime files', async () => {
    const ws = await browserDemoApi.createWorkspace({ studentDisplayName: '小明' })
    const explorer = await browserDemoApi.getProjectExplorer(ws.id)
    const runtimeNode = explorer.nodes.find((n) => n.kind === 'file' && n.displayPath === 'User/robotdog_runtime.c')!

    const file = await browserDemoApi.readProjectExplorerFile(ws.id, runtimeNode.id)
    expect(file.content).toContain('小马运行状态机')
  })

  it('simulates full firmware build outputting RobotDog artifacts with Pony proof', async () => {
    const ws = await browserDemoApi.createWorkspace({ studentDisplayName: '小明' })
    const snapshot = await browserDemoApi.startFirmwareBuild(ws.id)

    expect(snapshot.state).toBe('completed')
    expect(snapshot.artifacts.map((a) => a.name)).toEqual([
      'RobotDog.elf',
      'RobotDog.hex',
      'RobotDog.bin',
      'RobotDog.map'
    ])
    expect(snapshot.proof?.firmwareBaselineId).toBe('ch32v203-pony-v25')
    expect(snapshot.proof?.board).toBe('CH32V203C8T6 Pony v2.5')
  })

  it('resolves distinct workspace baseline status for Pony sandbox vs RHS lesson', async () => {
    const sandbox = await browserDemoApi.createWorkspace({ studentDisplayName: '小明' })
    const sandboxStatus = await browserDemoApi.getWorkspaceFirmwareBaselineStatus(sandbox.id)

    expect(sandboxStatus.id).toBe('ch32v203-pony-v25')
    expect(sandboxStatus.label).toContain('小马')
    expect(sandboxStatus.sourceRoot).toContain('v2.5_沁恒小马例程')

    // Create a lesson attempt
    const lessonWs = await browserDemoApi.createLessonAttempt({
      courseId: 'ch32v203-foundations',
      lessonId: 'studio-first-build',
      studentDisplayName: '小明'
    })
    const lessonStatus = await browserDemoApi.getWorkspaceFirmwareBaselineStatus(lessonWs.id)

    expect(lessonStatus.id).toBe('ch32v203-rhs-baseline')
    expect(lessonStatus.label).toContain('RHS')
    expect(lessonStatus.sourceRoot).toContain('ch32v203-baseline')
  })

  it('allows writing only to editable files in the Pony workspace', async () => {
    const ws = await browserDemoApi.createWorkspace({ studentDisplayName: '小明' })

    // Writing App/Src/experiment.c succeeds
    await expect(browserDemoApi.writeWorkspaceFile(ws.id, 'App/Src/experiment.c', '/* code */')).resolves.toBeDefined()

    // Free engineering files are editable; internal metadata remains protected.
    await expect(browserDemoApi.writeWorkspaceFile(ws.id, 'Core/Src/student_control.c', '/* code */')).resolves.toBeDefined()
    await expect(browserDemoApi.writeWorkspaceFile(ws.id, 'robotdog.project.json', '{}')).rejects.toThrow('这个文件当前不能修改')
  })

  it('creates and retains a demo text file and empty directory', async () => {
    const workspace = await browserDemoApi.createWorkspace({ studentDisplayName: '测试同学' })
    await browserDemoApi.createWorkspaceDirectory(workspace.id, 'App/Src', 'modules')
    const file = await browserDemoApi.createWorkspaceFile(workspace.id, 'App/Src/modules', 'helper.h')
    await browserDemoApi.writeWorkspaceFile(workspace.id, file.path, '#pragma once\nint Helper(void);\n')
    const snapshot = await browserDemoApi.getProjectExplorer(workspace.id)
    const node = snapshot.nodes.find(item => item.displayPath === file.path)!
    expect((await browserDemoApi.readProjectExplorerFile(workspace.id, node.id)).content).toContain('Helper')
    await expect(browserDemoApi.createWorkspaceFile(workspace.id, 'App/Src/modules', 'HELPER.H')).rejects.toThrow('同名')
    await browserDemoApi.createWorkspaceDirectory(workspace.id, '', 'empty')
    expect((await browserDemoApi.getProjectExplorer(workspace.id)).nodes.some(item => item.displayPath === 'empty' && item.kind === 'directory')).toBe(true)
  })

  it('preserves fun edition workspace behavior when fun edition is active', async () => {
    setDemoEdition('fun-line-following')
    const ws = await browserDemoApi.createWorkspace({ studentDisplayName: '林同学' })

    expect(ws.learningPath).toBe('fun-line-following')
    expect(ws.workspacePurpose).toBe('fun-project')
    expect(ws.templateId).toBe('ch32v203-robotdog')
    expect(ws.name).toContain('巡线练习')

    const files = await browserDemoApi.listStudentCodeFiles(ws.id)
    const ctrlC = files.find((f) => f.path === 'Core/Src/student_control.c')
    expect(ctrlC?.editable).toBe(true)
  })

  it('preserves TI edition workspace behavior when TI edition is active', async () => {
    setDemoEdition('ti-mspm0-foundations')
    const ws = await browserDemoApi.createWorkspace({ studentDisplayName: '张同学' })

    expect(ws.learningPath).toBe('ti-mspm0-foundations')
    expect(ws.platform).toBe('ti-mspm0')
    expect(ws.target).toBe('MSPM0G3507')
    expect(ws.templateId).toBe('ti-mspm0g3507-foundations')
    expect(ws.name).toContain('MSPM0 练习')
  })
})


describe('sandbox template choices in browser demonstration', () => {
  it.each([
    ['mcu-foundations', 'sdk-empty', 'App/Src/main.c'],
    ['ti-mspm0-foundations', 'sdk-empty', 'board.syscfg'],
    ['ti-mspm0-foundations', 'pony', 'src/robotdog/robotdog_runtime.c']
  ] as const)('selects %s / %s', async (edition, projectType, expectedPath) => {
    setDemoEdition(edition)
    const workspace = await browserDemoApi.createWorkspace({ studentDisplayName: '测试', projectType })
    expect(workspace.templateId).toContain(projectType)
    const files = await browserDemoApi.listStudentCodeFiles(workspace.id)
    expect(files.some(file => file.path === expectedPath)).toBe(true)
    expect(files.some(file => file.path === 'gpio_toggle_output.syscfg')).toBe(false)
  })
})
