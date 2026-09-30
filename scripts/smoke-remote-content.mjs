import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdtemp, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import electron from 'electron'
import { EditionContentResolver } from '../src/main/services/edition-content-resolver.ts'
import { EditionContentUpdateService } from '../src/main/services/edition-content-update-service.ts'
import { FirmwareBaselineResolver } from '../src/main/services/firmware-baseline-resolver.ts'

async function runElectronSmoke(editionId, userDataDir) {
  return new Promise((resolvePromise, rejectPromise) => {
    console.log(`\n[smoke-remote-content] Starting Electron Smoke with REMOTE content for edition: ${editionId}...`)
    const child = spawn(electron, ['.'], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        ROBOTDOG_EDITION: editionId,
        ROBOTDOG_SMOKE_TEST: '1',
        ROBOTDOG_SMOKE_USER_DATA: userDataDir
      },
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe']
    })

    let output = ''
    let settled = false

    child.stdout.on('data', (chunk) => {
      output += chunk.toString()
      process.stdout.write(chunk)
    })
    child.stderr.on('data', (chunk) => {
      output += chunk.toString()
      process.stderr.write(chunk)
    })

    const timeout = setTimeout(() => {
      if (settled) return
      settled = true
      child.kill()
      rejectPromise(new Error(`Electron smoke timed out for ${editionId}\n${output}`))
    }, 90_000)

    child.on('error', (err) => {
      if (settled) return
      clearTimeout(timeout)
      settled = true
      rejectPromise(err)
    })

    child.on('exit', (code) => {
      if (settled) return
      clearTimeout(timeout)
      settled = true
      if (code !== 0 || !output.includes('ROBOTDOG_SMOKE_OK')) {
        rejectPromise(new Error(`Electron smoke failed for ${editionId} with exit code ${code}\n${output}`))
      } else {
        console.log(`[smoke-remote-content] SUCCESS: Electron smoke passed for ${editionId} using remote content!`)
        resolvePromise(output)
      }
    })
  })
}

async function runPonyRemoteBuild(mcuCurrentDir) {
  return new Promise((resolvePromise, rejectPromise) => {
    console.log(`\n[smoke-remote-content] Running standalone Pony Smoke on remote baseline: ${mcuCurrentDir}...`)
    const child = spawn(
      process.execPath,
      [
        './node_modules/tsx/dist/cli.mjs',
        'scripts/smoke-mcu-pony-packaged.ts',
        '--resources-root',
        mcuCurrentDir
      ],
      {
        cwd: process.cwd(),
        env: process.env,
        stdio: ['ignore', 'pipe', 'pipe']
      }
    )

    let output = ''
    child.stdout.on('data', (chunk) => {
      output += chunk.toString()
      process.stdout.write(chunk)
    })
    child.stderr.on('data', (chunk) => {
      output += chunk.toString()
      process.stderr.write(chunk)
    })

    child.on('exit', (code) => {
      if (code === 0 && output.includes('PONY_PACKAGED_SMOKE_OK')) {
        console.log('[smoke-remote-content] SUCCESS: Pony packaged firmware build passed with remote content!')
        resolvePromise(output)
      } else {
        rejectPromise(new Error(`Pony remote build failed with code ${code}\n${output}`))
      }
    })
  })
}

async function main() {
  const smokeRoot = await mkdtemp(join(tmpdir(), 'robotdog-smoke-remote-content-'))
  const mcuUserData = join(smokeRoot, 'mcu-userData')
  const tiUserData = join(smokeRoot, 'ti-userData')
  const mcuContentUserData = join(mcuUserData, 'content')
  const tiContentUserData = join(tiUserData, 'content')
  const staticRoot = resolve('resources')

  console.log(`[smoke-remote-content] Temp Root: ${smokeRoot}`)

  try {
    // 1. Download real MCU content from Gitee
    console.log('[smoke-remote-content] Downloading real MCU content from Gitee...')
    const mcuResolver = new EditionContentResolver({
      staticRoot,
      userDataContentRoot: mcuContentUserData,
      editionId: 'mcu-foundations'
    })
    const mcuUpdateService = new EditionContentUpdateService({
      userDataContentRoot: mcuContentUserData,
      resolver: mcuResolver,
      appVersion: '0.1.0',
      editionId: 'mcu-foundations'
    })
    const mcuStatus = await mcuUpdateService.checkForUpdate()
    console.log(`[smoke-remote-content] MCU update status: ${mcuStatus.kind}, message: ${mcuStatus.message}`)
    if (!mcuResolver.hasValidDownloadedContent('mcu-foundations')) {
      throw new Error('MCU downloaded content is invalid!')
    }

    // 2. Download real TI content from Gitee
    console.log('[smoke-remote-content] Downloading real TI MSPM0 content from Gitee...')
    const tiResolver = new EditionContentResolver({
      staticRoot,
      userDataContentRoot: tiContentUserData,
      editionId: 'ti-mspm0-foundations'
    })
    const tiUpdateService = new EditionContentUpdateService({
      userDataContentRoot: tiContentUserData,
      resolver: tiResolver,
      appVersion: '0.1.0',
      editionId: 'ti-mspm0-foundations'
    })
    const tiStatus = await tiUpdateService.checkForUpdate()
    console.log(`[smoke-remote-content] TI update status: ${tiStatus.kind}, message: ${tiStatus.message}`)
    if (!tiResolver.hasValidDownloadedContent('ti-mspm0-foundations')) {
      throw new Error('TI downloaded content is invalid!')
    }

    const mcuCurrent = mcuResolver.getCurrentDir('mcu-foundations')
    const tiCurrent = tiResolver.getCurrentDir('ti-mspm0-foundations')
    console.log(`[smoke-remote-content] Verified MCU current root: ${mcuCurrent}`)
    console.log(`[smoke-remote-content] Verified TI current root: ${tiCurrent}`)

    // Verify published vs draft separation in downloaded remote content
    const mcuCourseJson = join(mcuCurrent, 'courses', 'ch32v203-foundations', 'course.json')
    const mcuLesson1 = join(mcuCurrent, 'courses', 'ch32v203-foundations', 'lessons', 'first-program-on-chip.json')
    const mcuLesson2 = join(mcuCurrent, 'courses', 'ch32v203-foundations', 'lessons', 'gpio-output.json')
    const mcuTemplate1 = join(mcuCurrent, 'workspace-templates', 'ch32v203-mcu-lessons', 'first-program-on-chip', 'App', 'Src', 'experiment.c')
    const mcuTemplate2 = join(mcuCurrent, 'workspace-templates', 'ch32v203-mcu-lessons', 'gpio-output')

    if (!existsSync(mcuCourseJson) || !existsSync(mcuLesson1) || !existsSync(mcuTemplate1)) {
      throw new Error('Remote MCU content is missing published Lesson 1 or its template!')
    }
    if (existsSync(mcuLesson2) || existsSync(mcuTemplate2)) {
      throw new Error('Remote MCU content illegally contains draft Lesson 2 (gpio-output)!')
    }
    console.log('[smoke-remote-content] SUCCESS: Verified remote package has Lesson 1 and excludes draft Lesson 2!')

    // 3. Verify Baselines can be loaded from downloaded directories
    const mcuBaselineResolver = new FirmwareBaselineResolver({
      staticRoot,
      firmwareBaselinesRoot: join(mcuCurrent, 'firmware-baselines'),
      isPackaged: false
    })
    const rhsService = mcuBaselineResolver.resolve('ch32v203-rhs-baseline')
    const rhsStatus = await rhsService.getStatus()
    console.log(`[smoke-remote-content] MCU RHS status ready: ${rhsStatus.readyForTesting}, errors: ${rhsStatus.errors.length}`)
    if (!rhsStatus.readyForTesting) {
      throw new Error(`RHS Baseline not ready: ${rhsStatus.errors.join('; ')}`)
    }

    const ponyService = mcuBaselineResolver.resolve('ch32v203-pony-v25')
    const ponyStatus = await ponyService.getStatus()
    console.log(`[smoke-remote-content] MCU Pony status ready: ${ponyStatus.readyForTesting}, errors: ${ponyStatus.errors.length}`)
    if (!ponyStatus.readyForTesting) {
      throw new Error(`Pony Baseline not ready: ${ponyStatus.errors.join('; ')}`)
    }

    const tiBaselineResolver = new FirmwareBaselineResolver({
      staticRoot,
      firmwareBaselinesRoot: join(tiCurrent, 'firmware-baselines'),
      isPackaged: false
    })
    const tiBaselineService = tiBaselineResolver.resolve('ti-mspm0g3507')
    const tiStatusCheck = await tiBaselineService.getStatus()
    console.log(`[smoke-remote-content] TI MSPM0 status ready: ${tiStatusCheck.readyForTesting}, errors: ${tiStatusCheck.errors.length}`)
    if (!tiStatusCheck.readyForTesting) {
      throw new Error(`TI Baseline not ready: ${tiStatusCheck.errors.join('; ')}`)
    }

    // 4. Run Electron Smoke for MCU (creates lesson attempt from remote template, builds candidate, builds RHS firmware)
    await runElectronSmoke('mcu-foundations', mcuUserData)

    // 5. Run Electron Smoke for TI (creates workspace from remote template, builds candidate with SysConfig, builds TI firmware)
    await runElectronSmoke('ti-mspm0-foundations', tiUserData)

    // 6. Run Pony firmware build using the downloaded remote content
    await runPonyRemoteBuild(mcuCurrent)

    console.log('\n======================================================')
    console.log('ALL REMOTE CONTENT BUILDS (MCU RHS, MCU Pony, TI MSPM0) PASSED!')
    console.log('======================================================\n')
  } finally {
    await rm(smokeRoot, { recursive: true, force: true }).catch(() => {})
  }
}

main().catch((err) => {
  console.error('\n[smoke-remote-content] FAILED:', err)
  process.exit(1)
})
