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

  it('lists student code files with App as editable and Core as read-only bridge', async () => {
    const ws = await browserDemoApi.createWorkspace({ studentDisplayName: '小明' })
    const files = await browserDemoApi.listStudentCodeFiles(ws.id)

    const expC = files.find((f) => f.path === 'App/Src/experiment.c')
    const expH = files.find((f) => f.path === 'App/Inc/experiment.h')
    const ctrlC = files.find((f) => f.path === 'Core/Src/student_control.c')
    const ctrlH = files.find((f) => f.path === 'Core/Inc/student_control.h')

    expect(expC).toBeDefined()
    expect(expC?.editable).toBe(true)
    expect(expC?.group).toBe('实验代码')

    expect(expH).toBeDefined()
    expect(expH?.editable).toBe(true)

    expect(ctrlC).toBeDefined()
    expect(ctrlC?.editable).toBe(false)
    expect(ctrlC?.group).toBe('只读接口')

    expect(ctrlH).toBeDefined()
    expect(ctrlH?.editable).toBe(false)
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
    expect(userMain?.access).toBe('read-only')
    expect(userMain?.origin).toBe('firmware-baseline')

    const coreBridge = explorer.nodes.find((n) => n.kind === 'file' && n.displayPath === 'Core/Src/student_control.c')
    expect(coreBridge?.access).toBe('read-only')

    const ponyManifest = explorer.nodes.find((n) => n.kind === 'file' && n.displayPath === 'pony.firmware.json')
    expect(ponyManifest?.access).toBe('read-only')
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

    // Writing Core/Src/student_control.c fails
    await expect(browserDemoApi.writeWorkspaceFile(ws.id, 'Core/Src/student_control.c', '/* code */')).rejects.toThrow('这个文件当前不能修改')
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
