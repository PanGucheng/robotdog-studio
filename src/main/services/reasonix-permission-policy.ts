import { isAbsolute, relative, resolve, sep } from 'node:path'

interface PermissionParams {
  toolCall?: { kind?: string; title?: string; rawInput?: Record<string, unknown> }
  options?: Array<{ optionId?: string; kind?: string }>
}

export class ReasonixPermissionPolicy {
  constructor(private readonly candidateRoot: string) {}

  decide(value: unknown): { outcome: { outcome: 'selected' | 'cancelled'; optionId?: string } } {
    const params = (value ?? {}) as PermissionParams
    if (params.toolCall?.kind !== 'edit' || !this.assess(value).allowed) return { outcome: { outcome: 'cancelled' } }
    const once = params.options?.find((option) => option.kind === 'allow_once' || option.optionId === 'allow_once')
    return once?.optionId ? { outcome: { outcome: 'selected', optionId: once.optionId } } : { outcome: { outcome: 'cancelled' } }
  }

  assess(value: unknown): { allowed: boolean; paths: string[] } {
    const params = (value ?? {}) as PermissionParams
    if (params.toolCall?.kind !== 'edit') return { allowed: false, paths: [] }
    const paths = this.extractPaths(params.toolCall.rawInput, params.toolCall.title)
    return { allowed: paths.length > 0 && paths.every((path) => this.pathIsAllowed(path)), paths }
  }

  private extractPaths(input?: Record<string, unknown>, title?: string): string[] {
    const structured = Object.entries(input ?? {}).filter(([key, value]) => /path|file/i.test(key) && typeof value === 'string').map(([, value]) => value as string)
    if (structured.length > 0) return structured
    const match = /^(?:edit_file|write_file)\s+(.+)$/i.exec(title?.trim() ?? '')
    if (!match) return []
    const subject = match[1].trim().replace(/^(?:"([^"]+)"|'([^']+)')$/, '$1$2')
    return subject && !subject.includes(' -> ') ? [subject] : []
  }

  private pathIsAllowed(path: string): boolean {
    const target = resolve(this.candidateRoot, path)
    const rel = relative(this.candidateRoot, target)
    const normalized = rel.replaceAll('\\', '/').toLowerCase()
    if (isAbsolute(rel) || rel === '..' || rel.startsWith(`..${sep}`)) return false
    return /^student-config\/[^/]+\.yaml$/.test(normalized) || normalized === 'core/src/student_control.c' || normalized === 'core/inc/student_control.h'
  }
}
