import { spawn } from 'node:child_process'
import electron from 'electron'

const child = spawn(electron, ['.'], {
  cwd: process.cwd(),
  env: { ...process.env, ROBOTDOG_SMOKE_TEST: '1' },
  windowsHide: true,
  stdio: ['ignore', 'pipe', 'pipe']
})

let output = ''
let settled = false
const append = (chunk) => {
  output += chunk.toString()
  process.stdout.write(chunk)
}
child.stdout.on('data', append)
child.stderr.on('data', append)

const timeout = setTimeout(() => {
  if (settled) return
  child.kill()
  console.error('\nElectron smoke test timed out.\n' + output)
  process.exitCode = 1
}, 30_000)

child.on('error', (error) => {
  clearTimeout(timeout)
  settled = true
  console.error(error)
  process.exitCode = 1
})

child.on('exit', (code) => {
  clearTimeout(timeout)
  settled = true
  if (code !== 0 || !output.includes('ROBOTDOG_SMOKE_OK')) {
    console.error(`\nElectron smoke test failed with exit code ${code}.\n${output}`)
    process.exitCode = 1
  }
})
