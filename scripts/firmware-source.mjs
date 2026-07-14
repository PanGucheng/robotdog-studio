import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'

const repoRoot = resolve(import.meta.dirname, '..')
const defaultRemote = 'https://github.com/PanGucheng/ch32v203-robot-dog'
const sourceRoot = resolve(process.env.ROBOTDOG_FIRMWARE_SOURCE_CACHE ?? join(repoRoot, '.firmware-sources', 'ch32v203-robot-dog'))
const worktreeRoot = resolve(process.env.ROBOTDOG_FIRMWARE_WORKTREE_ROOT ?? join(repoRoot, '.firmware-sources', 'worktrees'))
const activePath = join(repoRoot, 'resources', 'firmware-baselines', 'ch32v203-robotdog', 'active.json')

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? repoRoot,
    encoding: 'utf8',
    stdio: options.capture ? ['ignore', 'pipe', 'pipe'] : ['ignore', 'inherit', 'inherit'],
    windowsHide: true
  })
  if (result.status !== 0) {
    const detail = [result.stdout, result.stderr].filter(Boolean).join('\n').trim()
    throw new Error(`${command} ${args.join(' ')} failed${detail ? `\n${detail}` : ''}`)
  }
  return (result.stdout ?? '').trim()
}

function git(args, options = {}) {
  return run('git', args, options)
}

function readActive() {
  return existsSync(activePath) ? JSON.parse(readFileSync(activePath, 'utf8')) : null
}

function ensureSource({ fetch = false } = {}) {
  if (!existsSync(sourceRoot)) {
    mkdirSync(dirname(sourceRoot), { recursive: true })
    git(['clone', defaultRemote, sourceRoot])
  }
  if (fetch) git(['fetch', '--all', '--prune'], { cwd: sourceRoot })
}

function resolveCommit(ref) {
  return git(['rev-parse', ref], { cwd: sourceRoot, capture: true })
}

function prepareWorktree(ref) {
  ensureSource({ fetch: true })
  const commit = resolveCommit(ref)
  const short = commit.slice(0, 7)
  const target = join(worktreeRoot, short)
  if (existsSync(target)) {
    spawnSync('git', ['worktree', 'remove', '--force', target], { cwd: sourceRoot, windowsHide: true })
    rmSync(target, { recursive: true, force: true })
  }
  mkdirSync(worktreeRoot, { recursive: true })
  git(['worktree', 'add', '--detach', target, commit], { cwd: sourceRoot })
  return { commit, short, worktree: target }
}

function status() {
  const active = readActive()
  const hasSource = existsSync(sourceRoot)
  let remoteCommit = null
  if (hasSource) {
    git(['fetch', '--all', '--prune'], { cwd: sourceRoot })
    remoteCommit = resolveCommit('origin/main')
  }
  const info = {
    sourceRoot,
    remote: defaultRemote,
    branch: 'main',
    cloned: hasSource,
    activeCommit: active?.activeCommit ?? active?.source?.expectedCommit ?? null,
    remoteCommit,
    updateAvailable: Boolean(remoteCommit && active?.activeCommit && remoteCommit !== active.activeCommit)
  }
  console.log(JSON.stringify(info, null, 2))
}

function usage() {
  console.log(`Usage:
  node scripts/firmware-source.mjs status
  node scripts/firmware-source.mjs fetch
  node scripts/firmware-source.mjs prepare [--commit <ref>]

Environment:
  ROBOTDOG_FIRMWARE_SOURCE_CACHE  Override local firmware clone path
  ROBOTDOG_FIRMWARE_WORKTREE_ROOT  Override temporary worktree root`)
}

const command = process.argv[2] ?? 'status'
try {
  if (command === 'status') {
    status()
  } else if (command === 'fetch') {
    ensureSource({ fetch: true })
    console.log(JSON.stringify({ sourceRoot, remoteCommit: resolveCommit('origin/main') }, null, 2))
  } else if (command === 'prepare') {
    const index = process.argv.indexOf('--commit')
    const ref = index >= 0 ? process.argv[index + 1] : 'origin/main'
    if (!ref) throw new Error('--commit requires a ref')
    console.log(JSON.stringify(prepareWorktree(ref), null, 2))
  } else {
    usage()
    process.exitCode = 1
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
}
