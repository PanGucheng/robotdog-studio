import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname, extname, join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'

const repoRoot = resolve(import.meta.dirname, '..')
const baselineRoot = join(repoRoot, 'resources', 'firmware-baselines', 'ch32v203-robotdog')
const registry = JSON.parse(readFileSync(join(baselineRoot, 'active.json'), 'utf8'))
const manifestPath = join(baselineRoot, registry.manifest)
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
const firmwareRoot = resolve(process.env.ROBOTDOG_FIRMWARE_ROOT ?? manifest.source.developmentDefaultRoot)
const studentRoot = resolve(process.env.ROBOTDOG_STUDENT_OVERLAY ?? join(repoRoot, 'resources', 'workspace-templates', 'ch32v203-robotdog', '2026.06'))
const outRoot = resolve(process.env.ROBOTDOG_FIRMWARE_OUT ?? join(repoRoot, '.firmware-build', 'ch32v203-robotdog', new Date().toISOString().replace(/[:.]/g, '-')))
const toolchainBin = join(repoRoot, 'vendor', 'wch', 'Toolchain', 'RISC-V Embedded GCC12', 'bin')
const gcc = join(toolchainBin, 'riscv-wch-elf-gcc.exe')
const objcopy = join(toolchainBin, 'riscv-wch-elf-objcopy.exe')
const sizeTool = join(toolchainBin, 'riscv-wch-elf-size.exe')

function assertFile(path, label) { if (!existsSync(path) || !statSync(path).isFile()) throw new Error(`${label} not found: ${path}`) }
function sha256File(path) { return createHash('sha256').update(readFileSync(path)).digest('hex') }
function run(label, command, args, cwd = firmwareRoot) {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true })
  if (result.stdout) process.stdout.write(result.stdout)
  if (result.stderr) process.stderr.write(result.stderr)
  if (result.status !== 0) throw new Error(`${label} failed with exit code ${result.status ?? 'unknown'}`)
  return `${result.stdout ?? ''}${result.stderr ?? ''}`
}
function parseConfig(text) {
  const values = new Map()
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, '').trim()
    if (!line) continue
    const match = /^([a-z_][a-z0-9_]*)\s*:\s*(-?\d+)$/i.exec(line)
    if (!match) throw new Error(`Invalid line config: ${raw}`)
    values.set(match[1], Number(match[2]))
  }
  const turn = values.get('turn_strength'); const target = values.get('line_target')
  if (!Number.isInteger(turn) || turn < 1 || turn > 30) throw new Error('turn_strength must be 1..30')
  if (!Number.isInteger(target) || target < 0 || target > 127) throw new Error('line_target must be 0..127')
  return { turn, target }
}

assertFile(gcc, 'Bundled WCH GCC12')
assertFile(objcopy, 'Bundled WCH objcopy')
assertFile(sizeTool, 'Bundled WCH size')
for (const item of manifest.integrity) {
  const path = join(firmwareRoot, ...item.path.split('/'))
  assertFile(path, item.path)
  if (sha256File(path) !== item.sha256) throw new Error(`Provisional baseline integrity mismatch: ${item.path}`)
}
for (const source of manifest.build.sources) assertFile(join(firmwareRoot, ...source.split('/')), source)

rmSync(outRoot, { recursive: true, force: true })
mkdirSync(join(outRoot, 'obj'), { recursive: true })
const generatedInclude = join(outRoot, 'generated')
mkdirSync(generatedInclude, { recursive: true })
const config = parseConfig(readFileSync(join(studentRoot, ...manifest.studentOverlay.configInput.split('/')), 'utf8'))
writeFileSync(join(generatedInclude, 'student_config.generated.h'), [
  '#ifndef STUDENT_CONFIG_GENERATED_H', '#define STUDENT_CONFIG_GENERATED_H',
  `#define STUDENT_TURN_STRENGTH ${config.turn}U`, `#define STUDENT_LINE_TARGET ${config.target}U`, '#endif', ''
].join('\n'))

const sources = [...manifest.build.sources.map((path) => ({ path, root: firmwareRoot })), { path: manifest.studentOverlay.source, root: studentRoot }]
const includes = [generatedInclude, join(studentRoot, 'Core', 'Inc'), ...manifest.build.includeDirectories.map((path) => join(firmwareRoot, ...path.split('/')))]
const targetArgs = [`-march=${manifest.toolchain.arch}`, `-mabi=${manifest.toolchain.abi}`, `-mcmodel=${manifest.toolchain.codeModel}`]
const objects = []
console.log(`Firmware baseline: ${manifest.id} (${manifest.status}, releaseEligible=${manifest.releaseEligible})`)
console.log(`Firmware source: ${firmwareRoot}`)
console.log(`Student overlay: ${studentRoot}`)
console.log(`Output: ${outRoot}`)

for (const [index, source] of sources.entries()) {
  const input = join(source.root, ...source.path.split('/'))
  const object = join(outRoot, 'obj', `${source.path.replaceAll(/[\\/]/g, '__').replace(/\.[^.]+$/, '')}.o`)
  mkdirSync(dirname(object), { recursive: true })
  const includeArgs = includes.flatMap((path) => ['-I', path])
  const isAssembly = extname(source.path).toLowerCase() === '.s'
  const args = isAssembly
    ? ['-c', '-x', 'assembler-with-cpp', ...includeArgs, ...targetArgs, ...manifest.build.assemblerFlags, input, '-o', object]
    : ['-c', '-x', 'c', ...includeArgs, ...targetArgs, ...manifest.build.cFlags, input, '-o', object]
  console.log(`[${index + 1}/${sources.length}] ${source.path}`)
  run(`compile ${source.path}`, gcc, args)
  objects.push(object)
}

const elf = join(outRoot, manifest.artifacts.elf)
const hex = join(outRoot, manifest.artifacts.hex)
const bin = join(outRoot, manifest.artifacts.bin)
const map = join(outRoot, manifest.artifacts.map)
run('link firmware', gcc, [...targetArgs, ...manifest.build.linkFlags, `-Wl,-Map=${map}`, '-T', join(firmwareRoot, ...manifest.target.linkerScript.split('/')), '-o', elf, ...objects])
run('create hex', objcopy, ['-O', 'ihex', elf, hex])
run('create bin', objcopy, ['-O', 'binary', elf, bin])
run('size firmware', sizeTool, [elf])
const proof = {
  schemaVersion: 1, firmwareBaselineId: manifest.id, baselineCommit: manifest.source.expectedCommit,
  releaseEligible: manifest.releaseEligible, artifacts: [elf, hex, bin, map].map((path) => ({ name: path.split(/[\\/]/).at(-1), bytes: statSync(path).size, sha256: sha256File(path) })),
  completedAt: new Date().toISOString()
}
writeFileSync(join(outRoot, 'build-proof.json'), `${JSON.stringify(proof, null, 2)}\n`)
console.log('Firmware build completed with verified artifacts.')
