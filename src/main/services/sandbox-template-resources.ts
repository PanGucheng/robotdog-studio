import { existsSync } from 'node:fs'
import { join } from 'node:path'

// Resolve template and baseline together; older content packages may omit both.
export function resolveSandboxTemplateResources(staticRoot: string, templatesRoot: string, baselinesRoot: string, directory: string): {
  templateRoot: string
  manifestPath: string
} {
  const templateRoot = join(templatesRoot, directory)
  const manifestPath = join(baselinesRoot, directory, 'active.json')
  if (existsSync(templateRoot) && existsSync(manifestPath)) return { templateRoot, manifestPath }
  return {
    templateRoot: join(staticRoot, 'workspace-templates', directory),
    manifestPath: join(staticRoot, 'firmware-baselines', directory, 'active.json')
  }
}
