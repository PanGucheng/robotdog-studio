import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'

const repoRoot = resolve(import.meta.dirname, '..')
const remote = 'https://github.com/PanGucheng/ch32v203-robot-dog'
const sourceRoot = resolve(process.env.ROBOTDOG_FIRMWARE_SOURCE_CACHE ?? join(repoRoot, '.firmware-sources', 'ch32v203-robot-dog'))
const worktreeRoot = resolve(process.env.ROBOTDOG_FIRMWARE_WORKTREE_ROOT ?? join(repoRoot, '.firmware-sources', 'worktrees'))
const buildRoot = resolve(process.env.ROBOTDOG_FIRMWARE_BUILD_ROOT ?? join(repoRoot, '.firmware-build', 'ch32v203-robotdog'))
const toolchainRoot = resolve(process.env.ROBOTDOG_TOOLCHAIN_ROOT ?? join(repoRoot, 'vendor', 'wch', 'Toolchain', 'RISC-V Embedded GCC12'))
const defaultTemplateRoot = join(repoRoot, 'resources', 'workspace-templates', 'ch32v203-robotdog')

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? repoRoot,
    encoding: 'utf8',
    stdio: options.capture ? ['ignore', 'pipe', 'pipe'] : ['ignore', 'pipe', 'pipe'],
    windowsHide: true
  })
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`
  if (!options.quiet && output) process.stdout.write(output)
  if (result.status !== 0) throw new Error(`${options.label ?? command} failed with exit code ${result.status ?? 'unknown'}\n${output}`)
  return output.trim()
}

function git(args, options = {}) {
  return run('git', args, options)
}

function sha256(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex')
}

function assertFile(path, label) {
  if (!existsSync(path) || !statSync(path).isFile()) throw new Error(`${label} not found: ${path}`)
}

function ensureSource() {
  if (!existsSync(sourceRoot)) {
    mkdirSync(dirname(sourceRoot), { recursive: true })
    git(['clone', remote, sourceRoot])
  }
  git(['fetch', '--all', '--prune'], { cwd: sourceRoot })
}

function resolveCommit(ref) {
  return git(['rev-parse', ref], { cwd: sourceRoot, capture: true, quiet: true })
}

function prepareWorktree(ref) {
  ensureSource()
  const commit = resolveCommit(ref)
  const short = commit.slice(0, 7)
  const worktree = join(worktreeRoot, short)
  if (existsSync(worktree)) {
    spawnSync('git', ['worktree', 'remove', '--force', worktree], { cwd: sourceRoot, windowsHide: true })
    rmSync(worktree, { recursive: true, force: true })
  }
  mkdirSync(worktreeRoot, { recursive: true })
  git(['worktree', 'add', '--detach', worktree, commit], { cwd: sourceRoot })
  return { commit, short, worktree }
}

function readManifest(worktree, commit) {
  const manifestPath = join(worktree, 'robotdog.firmware.json')
  assertFile(manifestPath, 'robotdog.firmware.json')
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  const baseline = manifest.baselineCommit
  if (typeof baseline !== 'string' || !/^[0-9a-f]{40}$/i.test(baseline)) {
    throw new Error('robotdog.firmware.json baselineCommit must be a 40-character git hash')
  }
  if (baseline !== commit) {
    console.warn(`Warning: manifest baselineCommit ${baseline} differs from verified commit ${commit}`)
  }
  for (const required of [
    'CMakePresets.json',
    'Core/Inc/student_control.h',
    'Core/Src/student_control.c',
    'student-config/line-following.yaml'
  ]) assertFile(join(worktree, ...required.split('/')), required)
  return { manifest, manifestPath }
}

function parseSize(path) {
  const text = readFileSync(path, 'utf8')
  const values = Object.fromEntries([...text.matchAll(/^([a-z_]+)=([0-9A-Z]+)$/gmi)].map((match) => [match[1], match[2]]))
  return {
    text,
    flashUsedBytes: Number(values.flash_used_bytes),
    flashTotalBytes: Number(values.flash_total_bytes),
    flashFreeBytes: Number(values.flash_free_bytes),
    minimumFlashFreeBytes: Number(values.minimum_flash_free_bytes),
    ramUsedBytes: Number(values.ram_used_bytes),
    ramTotalBytes: Number(values.ram_total_bytes),
    status: values.status
  }
}

function build(worktree, outDir, overlay) {
  rmSync(outDir, { recursive: true, force: true })
  mkdirSync(outDir, { recursive: true })
  const buildDir = overlay ? 'build/robotdog-wch-gcc12-overlay' : 'build/robotdog-wch-gcc12'
  const args = [
    '-S', '.',
    '-B', buildDir,
    '-G', 'Ninja',
    '-DCMAKE_BUILD_TYPE=Release',
    `-DCMAKE_TOOLCHAIN_FILE=${join(worktree, 'cmake', 'robotdog-wch-gcc12.cmake').replaceAll('\\', '/')}`,
    `-DROBOTDOG_TOOLCHAIN_ROOT=${toolchainRoot.replaceAll('\\', '/')}`,
    `-DROBOTDOG_OUTPUT_DIR=${outDir.replaceAll('\\', '/')}`
  ]
  if (overlay) args.push(`-DROBOTDOG_STUDENT_OVERLAY=${overlay.replaceAll('\\', '/')}`)
  run('cmake', args, { cwd: worktree, label: overlay ? 'configure overlay firmware' : 'configure firmware' })
  run('cmake', ['--build', buildDir], { cwd: worktree, label: overlay ? 'build overlay firmware' : 'build firmware' })
}

function copyOverlayFromWorktree(worktree, target) {
  rmSync(target, { recursive: true, force: true })
  mkdirSync(join(target, 'Core', 'Inc'), { recursive: true })
  mkdirSync(join(target, 'Core', 'Src'), { recursive: true })
  mkdirSync(join(target, 'student-config'), { recursive: true })
  for (const path of [
    'Core/Inc/student_control.h',
    'Core/Src/student_control.c',
    'student-config/line-following.yaml'
  ]) {
    const src = join(worktree, ...path.split('/'))
    const dst = join(target, ...path.split('/'))
    mkdirSync(dirname(dst), { recursive: true })
    writeFileSync(dst, readFileSync(src))
  }
  writeFileSync(join(target, 'README.md'), [
    '# CH32V203 RobotDog Student Template',
    '',
    'This template was generated from the verified firmware baseline candidate.',
    '',
    'Editable files:',
    '',
    '- `Core/Src/student_control.c`',
    '- `Core/Inc/student_control.h`',
    '- `student-config/line-following.yaml`',
    ''
  ].join('\n'))
}

function artifactInfo(outDir, manifest) {
  const artifacts = {}
  for (const [key, name] of Object.entries(manifest.artifacts ?? {})) {
    const path = join(outDir, name)
    if (existsSync(path) && statSync(path).isFile()) {
      artifacts[key] = { path, bytes: statSync(path).size, sha256: sha256(path) }
    }
  }
  return artifacts
}

function main() {
  const commitIndex = process.argv.indexOf('--commit')
  const ref = commitIndex >= 0 ? process.argv[commitIndex + 1] : 'origin/main'
  const keep = process.argv.includes('--keep-worktree')
  if (!ref) throw new Error('--commit requires a ref')

  const prepared = prepareWorktree(ref)
  const { manifest } = readManifest(prepared.worktree, prepared.commit)
  const verifyRoot = join(buildRoot, prepared.short)
  const defaultOut = join(verifyRoot, 'default')
  const overlayDir = join(verifyRoot, 'overlay-template')
  const overlayOut = join(verifyRoot, 'overlay')

  build(prepared.worktree, defaultOut)
  const defaultSize = parseSize(join(defaultOut, manifest.artifacts.size))
  if (defaultSize.status !== 'PASS') throw new Error(`Default firmware size check failed: ${defaultSize.status}`)

  copyOverlayFromWorktree(prepared.worktree, overlayDir)
  build(prepared.worktree, overlayOut, overlayDir)
  const overlaySize = parseSize(join(overlayOut, manifest.artifacts.size))
  if (overlaySize.status !== 'PASS') throw new Error(`Overlay firmware size check failed: ${overlaySize.status}`)

  const report = {
    schemaVersion: 1,
    status: 'passed',
    remote,
    commit: prepared.commit,
    shortCommit: prepared.short,
    worktree: keep ? prepared.worktree : null,
    firmwareManifest: manifest,
    defaultBuild: { outputDir: defaultOut, size: defaultSize, artifacts: artifactInfo(defaultOut, manifest) },
    overlayBuild: { overlayDir, outputDir: overlayOut, size: overlaySize, artifacts: artifactInfo(overlayOut, manifest) },
    completedAt: new Date().toISOString()
  }
  const reportPath = join(verifyRoot, 'verification.json')
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`)
  console.log(`Firmware verification passed: ${reportPath}`)
  if (!keep) {
    spawnSync('git', ['worktree', 'remove', '--force', prepared.worktree], { cwd: sourceRoot, windowsHide: true })
    rmSync(prepared.worktree, { recursive: true, force: true })
  }
}

try {
  main()
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
}
