import { readFile, readdir, stat } from 'node:fs/promises'
import { join } from 'node:path'

export const tiPackagePolicy = JSON.parse(await readFile(new URL('../resources/toolchains/ti-mspm0/package-policy.json', import.meta.url), 'utf8'))

export function tiResourceFilter(tool) {
  return ['**/*', ...(tiPackagePolicy.excluded[tool] ?? []).flatMap(path => [`!${path}`, `!${path}/**/*`])]
}

export async function verifyTiPackageResources(root) {
  for (const path of tiPackagePolicy.required) {
    if (!await stat(join(root, path)).then(info => info.isFile(), () => false)) throw new Error(`TI package required resource missing: ${path}`)
  }
  for (const [tool, paths] of Object.entries(tiPackagePolicy.excluded)) {
    for (const path of paths) {
      if (await stat(join(root, tool, path)).then(() => true, () => false)) throw new Error(`TI package excluded resource returned: ${tool}/${path}`)
    }
  }
  console.log('TI_PACKAGE_RESOURCE_POLICY_OK')
}

export async function measureTiResources(sources) {
  const result = {}
  for (const [tool, root] of Object.entries(sources)) result[tool] = await measure(root)
  return result
}

async function measure(root) {
  let files = 0, bytes = 0
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const path = join(root, entry.name)
    if (entry.isDirectory()) {
      const child = await measure(path)
      files += child.files; bytes += child.bytes
    } else if (entry.isFile()) { files++; bytes += (await stat(path)).size }
  }
  return { files, bytes }
}
