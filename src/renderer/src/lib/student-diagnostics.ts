import type { CandidateDiagnostic, StudentCodeFile } from '../../../shared/types'

export interface StudentDiagnosticCard {
  id: string
  diagnostic: CandidateDiagnostic
  path?: StudentCodeFile['path']
  fileLabel: string
  locationLabel: string
  severityLabel: string
  studentMessage: string
  likelyCause: string
  actionHint: string
  priority: number
}

const fileLabels: Record<StudentCodeFile['path'], string> = {
  'Core/Src/student_control.c': '控制逻辑',
  'Core/Inc/student_control.h': '参考接口',
  'student-config/line-following.yaml': '参数设置'
}

export function buildStudentDiagnosticCards(items: CandidateDiagnostic[]): StudentDiagnosticCard[] {
  return items.map((diagnostic, index) => {
    const explanation = explainDiagnosticMessage(diagnostic.message)
    return {
      id: `${diagnostic.path ?? 'unknown'}:${diagnostic.line ?? 0}:${diagnostic.column ?? 0}:${index}`,
      diagnostic,
      path: diagnostic.path,
      fileLabel: diagnostic.path ? fileLabels[diagnostic.path] : '学生代码',
      locationLabel: formatLocation(diagnostic),
      severityLabel: diagnostic.severity === 'warning' ? '提醒' : '错误',
      ...explanation
    }
  }).sort((left, right) =>
    severityWeight(left.diagnostic.severity) - severityWeight(right.diagnostic.severity)
    || left.priority - right.priority
    || lineWeight(left.diagnostic.line) - lineWeight(right.diagnostic.line)
  )
}

export function formatDiagnosticsForStudentAi(items: CandidateDiagnostic[], fallback?: string): string {
  const cards = buildStudentDiagnosticCards(items)
  if (cards.length === 0) return fallback ?? '代码没有通过检查。'
  return cards.map((card, index) => [
    `${index + 1}. ${card.fileLabel} ${card.locationLabel}`,
    `编译器原话：${card.diagnostic.message}`,
    `学生版理解：${card.studentMessage}`,
    `建议先看：${card.actionHint}`
  ].join('\n')).join('\n\n')
}

function formatLocation(item: CandidateDiagnostic): string {
  if (item.line && item.column) return `第 ${item.line} 行，第 ${item.column} 列`
  if (item.line) return `第 ${item.line} 行`
  return item.path ? '这个文件' : '代码检查'
}

function explainDiagnosticMessage(message: string): Pick<StudentDiagnosticCard, 'studentMessage' | 'likelyCause' | 'actionHint' | 'priority'> {
  const text = message.toLowerCase()
  if (/expected.*;|before.*}/i.test(message)) return {
    studentMessage: '有一条语句可能没有写完整。',
    likelyCause: '最常见是少了分号，或者大括号前面的那一句还没结束。',
    actionHint: '先看这一行和上一行，检查每句代码末尾有没有分号。',
    priority: 1
  }
  if (/undeclared|not declared|implicit declaration|unknown type/i.test(message)) return {
    studentMessage: '代码里用了一个编译器不认识的名字。',
    likelyCause: '变量、函数或类型名可能拼错了，也可能还没有声明。',
    actionHint: '检查这个名字是不是和参考接口里写得完全一样，大小写也要一致。',
    priority: 2
  }
  if (/expected/i.test(message)) return {
    studentMessage: '这一行附近的符号顺序让编译器看不懂。',
    likelyCause: '可能是括号、逗号、分号或花括号的位置不对。',
    actionHint: '从标出的行往前看两三行，确认括号成对、语句完整。',
    priority: 3
  }
  if (/no such file|cannot find|include/i.test(message)) return {
    studentMessage: '代码引用了一个没有找到的文件或接口。',
    likelyCause: '可能改动了 include 行，或者文件名写错。',
    actionHint: '不要修改 include 文件名；如需恢复，可以对照原来的学生模板。',
    priority: 4
  }
  if (/stray|invalid|illegal/i.test(message)) return {
    studentMessage: '代码里出现了编译器不认识的字符或写法。',
    likelyCause: '可能混入了中文标点、奇怪符号，或复制代码时带进了不可见字符。',
    actionHint: '重新输入这一行的标点，特别检查分号、括号和引号。',
    priority: 5
  }
  if (/control reaches end|return/i.test(message)) return {
    studentMessage: '函数结束时少了应该交代的结果。',
    likelyCause: '某些函数需要返回值，但代码走到最后没有 return。',
    actionHint: '检查函数说明，如果它要求返回结果，就补上合适的 return。',
    priority: 6
  }
  if (text.includes('warning')) return {
    studentMessage: '这里暂时不是硬错误，但可能会让小马动作不符合预期。',
    likelyCause: '常见原因是变量没用上、类型不完全匹配，或某个判断永远不会发生。',
    actionHint: '先修红色错误；如果只剩提醒，再逐条检查是否真的需要这段代码。',
    priority: 20
  }
  return {
    studentMessage: '编译器在这里停下来了，需要先检查这一小段代码。',
    likelyCause: '可能是语法、变量名或接口使用方式和 C 语言规则不一致。',
    actionHint: '先从标出的行开始，和参考接口、上一行代码对照。',
    priority: 10
  }
}

function severityWeight(severity: CandidateDiagnostic['severity']): number {
  return severity === 'error' ? 0 : 1
}

function lineWeight(line?: number): number {
  return line ?? Number.MAX_SAFE_INTEGER
}
