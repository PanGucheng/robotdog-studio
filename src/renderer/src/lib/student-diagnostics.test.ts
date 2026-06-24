import { describe, expect, it } from 'vitest'
import type { CandidateDiagnostic } from '../../../shared/types'
import { buildStudentDiagnosticCards, formatDiagnosticsForStudentAi } from './student-diagnostics'

describe('student diagnostics', () => {
  it('prioritizes hard student-facing errors before warnings', () => {
    const diagnostics: CandidateDiagnostic[] = [
      { path: 'Core/Src/student_control.c', line: 30, severity: 'warning', message: 'warning: unused variable speed' },
      { path: 'Core/Src/student_control.c', line: 12, column: 5, severity: 'error', message: "expected ';' before '}' token" },
      { path: 'Core/Src/student_control.c', line: 7, severity: 'error', message: 'implicit declaration of function Student_Run' }
    ]

    const cards = buildStudentDiagnosticCards(diagnostics)

    expect(cards.map((card) => card.studentMessage)).toEqual([
      '有一条语句可能没有写完整。',
      '代码里用了一个编译器不认识的名字。',
      '这里暂时不是硬错误，但可能会让小马动作不符合预期。'
    ])
    expect(cards[0]).toMatchObject({ locationLabel: '第 12 行，第 5 列', fileLabel: '控制逻辑' })
  })

  it('formats diagnostics for AI with both compiler words and classroom hints', () => {
    const prompt = formatDiagnosticsForStudentAi([
      { path: 'student-config/line-following.yaml', line: 1, severity: 'error', message: 'expected integer' }
    ])

    expect(prompt).toContain('参数设置 第 1 行')
    expect(prompt).toContain('编译器原话：expected integer')
    expect(prompt).toContain('学生版理解：')
    expect(prompt).toContain('建议先看：')
  })
})
