import { isAbsolute, relative, resolve, sep } from 'node:path'

interface PermissionParams {
  toolCall?: { kind?: string; rawInput?: Record<string, unknown> }
  options?: Array<{ optionId?: string; kind?: string }>
}

export class ReasonixPermissionPolicy {
  constructor(private readonly candidateRoot: string) {}

  decide(value: unknown): { outcome: { outcome: 'selected' | 'cancelled'; optionId?: string } } {
    const params = (value ?? {}) as PermissionParams
    if (params.toolCall?.kind !== 'edit' || !this.pathsStayInside(params.toolCall.rawInput)) return { outcome: { outcome: 'cancelled' } }
    const once = params.options?.find((option) => option.kind === 'allow_once' || option.optionId === 'allow_once')
    return once?.optionId ? { outcome: { outcome: 'selected', optionId: once.optionId } } : { outcome: { outcome: 'cancelled' } }
  }

  private pathsStayInside(input?: Record<string, unknown>): boolean {
    if (!input) return false
    const paths = Object.entries(input).filter(([key, value]) => /path|file/i.test(key) && typeof value === 'string').map(([, value]) => value as string)
    if (paths.length === 0) return false
    return paths.every((path) => {
      const target = resolve(this.candidateRoot, path)
      const rel = relative(this.candidateRoot, target)
      const normalized = rel.replaceAll('\\', '/').toLowerCase()
      const denied = ['.git', '.reasonix', 'reasonix.toml', 'agents.md', 'robotdog.project.json', '.gitattributes', '.gitignore']
      return !isAbsolute(rel) && rel !== '..' && !rel.startsWith(`..${sep}`) && !denied.some((entry) => normalized === entry || normalized.startsWith(`${entry}/`))
    })
  }
}
