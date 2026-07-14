import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'

const repoRoot = resolve(import.meta.dirname, '..')
const baselineRoot = join(repoRoot, 'resources', 'firmware-baselines', 'ch32v203-robotdog')
const templateRoot = join(repoRoot, 'resources', 'workspace-templates', 'ch32v203-robotdog')

function usage() {
  console.log('Usage: node scripts/firmware-promote.mjs --verification <path-to-verification.json>')
}

function copyFile(src, dst) {
  mkdirSync(dirname(dst), { recursive: true })
  writeFileSync(dst, readFileSync(src))
}

const index = process.argv.indexOf('--verification')
const verificationPath = index >= 0 ? resolve(process.argv[index + 1]) : null
if (!verificationPath) {
  usage()
  process.exit(1)
}

const verification = JSON.parse(readFileSync(verificationPath, 'utf8'))
if (verification.status !== 'passed') throw new Error('Verification report is not passed')

const short = verification.shortCommit
const snapshotDir = join(baselineRoot, 'snapshots', short)
const templateDir = join(templateRoot, short)
const overlayDir = verification.overlayBuild.overlayDir

rmSync(snapshotDir, { recursive: true, force: true })
mkdirSync(snapshotDir, { recursive: true })
writeFileSync(join(snapshotDir, 'robotdog.firmware.json'), `${JSON.stringify(verification.firmwareManifest, null, 2)}\n`)
const summary = {
  schemaVersion: 1,
  status: verification.status,
  remote: verification.remote,
  commit: verification.commit,
  shortCommit: verification.shortCommit,
  firmwareVersion: verification.firmwareManifest.firmwareVersion,
  protocolVersion: verification.firmwareManifest.protocolVersion,
  defaultBuild: summarizeBuild(verification.defaultBuild),
  overlayBuild: summarizeBuild(verification.overlayBuild),
  completedAt: verification.completedAt
}
writeFileSync(join(snapshotDir, 'verification-summary.json'), `${JSON.stringify(summary, null, 2)}\n`)

rmSync(templateDir, { recursive: true, force: true })
for (const path of [
  'Core/Inc/student_control.h',
  'Core/Src/student_control.c',
  'student-config/line-following.yaml',
  'README.md'
]) {
  copyFile(join(overlayDir, ...path.split('/')), join(templateDir, ...path.split('/')))
}

const active = {
  schemaVersion: 2,
  name: 'ch32v203-robotdog',
  mode: 'development-live-remote',
  remote: {
    url: verification.remote,
    branch: 'main'
  },
  activeCommit: verification.commit,
  shortCommit: verification.shortCommit,
  firmwareVersion: verification.firmwareManifest.firmwareVersion,
  protocolVersion: verification.firmwareManifest.protocolVersion,
  verifiedFirmwareManifest: relative(baselineRoot, join(snapshotDir, 'robotdog.firmware.json')).replaceAll('\\', '/'),
  verificationReport: relative(baselineRoot, join(snapshotDir, 'verification-summary.json')).replaceAll('\\', '/'),
  studentTemplate: relative(repoRoot, templateDir).replaceAll('\\', '/'),
  build: {
    type: 'cmake',
    preset: 'robotdog-wch-gcc12',
    toolchain: verification.firmwareManifest.build.toolchain,
    outputDir: '.firmware-build/ch32v203-robotdog'
  },
  artifacts: verification.firmwareManifest.artifacts,
  verification: {
    minimumFlashFreeBytes: verification.defaultBuild.size.minimumFlashFreeBytes,
    flashUsedBytes: verification.defaultBuild.size.flashUsedBytes,
    flashFreeBytes: verification.defaultBuild.size.flashFreeBytes,
    ramUsedBytes: verification.defaultBuild.size.ramUsedBytes,
    lastVerifiedAt: verification.completedAt,
    promotedAt: new Date().toISOString()
  }
}
writeFileSync(join(baselineRoot, 'active.json'), `${JSON.stringify(active, null, 2)}\n`)
console.log(`Promoted firmware baseline ${verification.shortCommit}`)
console.log(`Template: ${templateDir}`)

function summarizeBuild(build) {
  const artifacts = {}
  for (const [key, value] of Object.entries(build.artifacts ?? {})) {
    artifacts[key] = { bytes: value.bytes, sha256: value.sha256 }
  }
  return {
    size: {
      flashUsedBytes: build.size.flashUsedBytes,
      flashTotalBytes: build.size.flashTotalBytes,
      flashFreeBytes: build.size.flashFreeBytes,
      minimumFlashFreeBytes: build.size.minimumFlashFreeBytes,
      ramUsedBytes: build.size.ramUsedBytes,
      ramTotalBytes: build.size.ramTotalBytes,
      status: build.size.status
    },
    artifacts
  }
}
