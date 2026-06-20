import { describe, expect, it } from 'vitest'
import { parseCompilerDiagnostics, validateLineConfigText } from './candidate-build-service'

describe('candidate line configuration preflight', () => {
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
})
