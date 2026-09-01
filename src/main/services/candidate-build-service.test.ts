import { describe, expect, it } from 'vitest'
import { parseCompilerDiagnostics, PlatformCandidateBuildService, validateLineConfigText, type CandidateBuilder, type CandidateBuildInput } from './candidate-build-service'

describe('candidate line configuration preflight', () => {
  it('routes TI candidates exclusively to the TI builder and CH32 candidates to WCH', async () => {
    const calls: string[] = []
    const builder = (name: string): CandidateBuilder => ({
      async build(input) {
        calls.push(name)
        return { candidateId: input.candidateId, sourceTreeHash: input.sourceTreeHash, diffHash: input.diffHash, compiler: name, objectSha256: 'a'.repeat(64), completedAt: new Date(0).toISOString(), checks: [] }
      }
    })
    const router = new PlatformCandidateBuildService(builder('wch'), builder('ti'))
    const base = { candidateId: 'cand_test', candidateRoot: '.', sourceTreeHash: 'b'.repeat(64), diffHash: 'c'.repeat(64), learningPath: 'ti-mspm0-foundations' } as Omit<CandidateBuildInput, 'platform'>
    await router.build({ ...base, platform: 'ti-mspm0' })
    await router.build({ ...base, platform: 'wch-ch32v203' })
    expect(calls).toEqual(['ti', 'wch'])
  })

  it('accepts comments and competition-safe parameter ranges', () => {
    expect(validateLineConfigText('# 让过弯更平稳\nturn_strength: 16\nline_target: 64\n')).toBe('turn_strength=16，line_target=64')
  })

  it.each([
    'turn_strength: 0\nline_target: 64\n',
    'turn_strength: 16\nline_target: 128\n',
    'turn_strength: fast\nline_target: 64\n'
  ])('rejects invalid or unsafe values', (text) => {
    expect(() => validateLineConfigText(text)).toThrow()
  })

  it('extracts only the useful GCC location and message from a noisy build log', () => {
    const diagnostics = parseCompilerDiagnostics([
      '[候选项目]\\Core\\Src\\student_control.c: In function \'StudentControl_Update\':',
      '[候选项目]\\Core\\Src\\student_control.c:8:5: error: expected \';\' before \'}\' token',
      '    8 |     Robot_SetMotion(ROBOT_FORWARD)',
      '      |     ^~~~~~~~~~~~~~~',
      '[候选项目]\\Core\\Src\\student_control.c:11:3: warning: this \'if\' clause does not guard... [-Wmisleading-indentation]'
    ].join('\n'))

    expect(diagnostics).toEqual([
      { path: 'Core/Src/student_control.c', line: 8, column: 5, severity: 'error', message: "expected ';' before '}' token" },
      { path: 'Core/Src/student_control.c', line: 11, column: 3, severity: 'warning', message: "this 'if' clause does not guard..." }
    ])
  })

  it('supports firmware assembly paths and a caller-defined diagnostic limit', () => {
    const lines = Array.from({ length: 8 }, (_, index) => `[受保护路径]/Startup/startup_ch32v20x_D6.S:${index + 1}:2: error: firmware issue ${index + 1}`)
    const diagnostics = parseCompilerDiagnostics(lines.join('\n'), 7)
    expect(diagnostics).toHaveLength(7)
    expect(diagnostics[0]).toMatchObject({ path: 'Startup/startup_ch32v20x_D6.S', line: 1, column: 2 })
  })

  it('keeps GNU linker failures as structured diagnostics', () => {
    const diagnostics = parseCompilerDiagnostics([
      "[受保护路径]/App/Src/experiment.c:14: undefined reference to `number_limit'",
      "[受保护路径]/App/Src/number_tools.c:(.text+0x18): multiple definition of `number_limit'"
    ].join('\n'))
    expect(diagnostics).toEqual([
      { path: 'App/Src/experiment.c', line: 14, severity: 'error', message: "undefined reference to `number_limit'" },
      { path: 'App/Src/number_tools.c', line: undefined, severity: 'error', message: "multiple definition of `number_limit'" }
    ])
  })
})
