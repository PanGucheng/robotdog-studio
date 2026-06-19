import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { dirname, isAbsolute, join, normalize, relative, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'

const repoRoot = resolve(import.meta.dirname, '..')
const defaultFirmwareRoot = 'D:\\RobotDog\\ch32v203-robot-dog'
const firmwareRoot = resolve(process.env.ROBOTDOG_FIRMWARE_ROOT ?? defaultFirmwareRoot)
const defaultOutBase = resolve(
  process.env.ROBOTDOG_FIRMWARE_OUT ?? join(repoRoot, '.firmware-build', 'ch32v203-robot-dog')
)
const outRoot = process.env.ROBOTDOG_FIRMWARE_OUT
  ? defaultOutBase
  : join(defaultOutBase, new Date().toISOString().replace(/[:.]/g, '-'))

const toolchainBin = join(repoRoot, 'vendor', 'wch', 'Toolchain', 'RISC-V Embedded GCC12', 'bin')
const gcc = join(toolchainBin, 'riscv-wch-elf-gcc.exe')
const objcopy = join(toolchainBin, 'riscv-wch-elf-objcopy.exe')
const size = join(toolchainBin, 'riscv-wch-elf-size.exe')

const compileCommandsPath = join(firmwareRoot, 'build', 'obj', 'compile_commands.json')
const linkerScript = join(firmwareRoot, 'Ld', 'Link.ld')

function assertFile(path, label) {
  if (!existsSync(path)) {
    throw new Error(`${label} not found: ${path}`)
  }
}

function splitCommand(command) {
  const args = []
  let current = ''
  let quote = null

  for (let i = 0; i < command.length; i += 1) {
    const char = command[i]

    if ((char === '"' || char === "'") && quote === null) {
      quote = char
      continue
    }

    if (char === quote) {
      quote = null
      continue
    }

    if (/\s/.test(char) && quote === null) {
      if (current.length > 0) {
        args.push(current)
        current = ''
      }
      continue
    }

    current += char
  }

  if (current.length > 0) {
    args.push(current)
  }

  return args
}

function toSourceAbsolute(cwd, file) {
  const absolute = isAbsolute(file) ? file : join(cwd, file)
  return normalize(absolute)
}

function toObjectPath(originalOutput) {
  const normalized = normalize(originalOutput)
  const marker = normalize('build/obj/.obj/')
  const markerIndex = normalized.indexOf(marker)
  const relativeObject = markerIndex >= 0 ? normalized.slice(markerIndex + marker.length) : normalized
  return join(outRoot, 'obj', relativeObject)
}

function absolutizeProjectPaths(args) {
  return args.map((arg) => {
    if (arg.startsWith('-I') && arg.length > 2) {
      const includePath = arg.slice(2)
      return isAbsolute(includePath) ? arg : `-I${join(firmwareRoot, includePath)}`
    }

    return arg
  })
}

function run(label, command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? firmwareRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  })

  if (result.stdout) {
    process.stdout.write(result.stdout)
  }

  if (result.stderr) {
    process.stderr.write(result.stderr)
  }

  if (result.status !== 0) {
    if (result.error) {
      throw new Error(`${label} failed to start: ${result.error.message}`)
    }

    if (result.signal) {
      throw new Error(`${label} was terminated by signal ${result.signal}`)
    }

    throw new Error(`${label} failed with exit code ${result.status}`)
  }
}

assertFile(gcc, 'Bundled WCH GCC12')
assertFile(objcopy, 'Bundled WCH objcopy')
assertFile(size, 'Bundled WCH size')
assertFile(compileCommandsPath, 'Firmware compile_commands.json')
assertFile(linkerScript, 'Firmware linker script')

mkdirSync(join(outRoot, 'obj'), { recursive: true })

const compileCommands = JSON.parse(readFileSync(compileCommandsPath, 'utf8'))
const objectFiles = []

console.log(`RobotDog firmware source: ${firmwareRoot}`)
console.log(`Bundled WCH GCC12: ${gcc}`)
console.log(`Build output: ${outRoot}`)

for (const [index, entry] of compileCommands.entries()) {
  const originalArgs = splitCommand(entry.command)
  const args = absolutizeProjectPaths(originalArgs.slice(1))
  const sourceFile = toSourceAbsolute(entry.directory, entry.file)

  const outputIndex = args.indexOf('-o')
  if (outputIndex === -1 || outputIndex === args.length - 1) {
    throw new Error(`Compile command #${index + 1} does not contain a usable -o output`)
  }

  const objectPath = toObjectPath(args[outputIndex + 1])
  mkdirSync(dirname(objectPath), { recursive: true })
  args[outputIndex + 1] = objectPath

  const lastArgIndex = args.length - 1
  if (normalize(args[lastArgIndex]) === normalize(entry.file) || !isAbsolute(args[lastArgIndex])) {
    args[lastArgIndex] = sourceFile
  }

  objectFiles.push(objectPath)
  console.log(`[${index + 1}/${compileCommands.length}] ${relative(firmwareRoot, sourceFile)}`)
  run(`compile ${relative(firmwareRoot, sourceFile)}`, gcc, args, { cwd: repoRoot })
}

const elfPath = join(outRoot, 'GPIO_Toggle.elf')
const mapPath = join(outRoot, 'GPIO_Toggle.map')
const hexPath = join(outRoot, 'GPIO_Toggle.hex')
const binPath = join(outRoot, 'GPIO_Toggle.bin')

const linkArgs = [
  '-march=rv32imac',
  '-mcmodel=medlow',
  '-mabi=ilp32',
  '-nostartfiles',
  '--specs=nano.specs',
  '--specs=nosys.specs',
  '-Wl,-Bstatic',
  '-Wl,--gc-sections',
  `-Wl,-Map=${mapPath}`,
  '-T',
  linkerScript,
  '-o',
  elfPath,
  ...objectFiles
]

console.log('Linking GPIO_Toggle.elf')
run('link firmware', gcc, linkArgs, { cwd: repoRoot })

console.log('Creating GPIO_Toggle.hex')
run('create hex', objcopy, ['-O', 'ihex', elfPath, hexPath], { cwd: repoRoot })

console.log('Creating GPIO_Toggle.bin')
run('create bin', objcopy, ['-O', 'binary', elfPath, binPath], { cwd: repoRoot })

console.log('Firmware size')
run('size firmware', size, [elfPath], { cwd: repoRoot })

console.log('Firmware build completed.')
