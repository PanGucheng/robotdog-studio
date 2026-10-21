import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { tiPackagePolicy, verifyTiPackageResources } from './ti-package-resources.mjs'

test('reject restored SDK example trees even when required files exist', async () => {
  const root = await mkdtemp(join(tmpdir(), 'ti-resource-policy-'))
  try {
    for (const path of tiPackagePolicy.required) {
      await mkdir(dirname(join(root, path)), { recursive: true })
      await writeFile(join(root, path), 'fixture')
    }
    await verifyTiPackageResources(root)
    await mkdir(join(root, 'sdk', 'examples'))
    await assert.rejects(verifyTiPackageResources(root), /excluded resource returned: sdk\/examples/)
  } finally { await rm(root, { recursive: true, force: true }) }
})

test('reject missing hidden SysConfig metadata', async () => {
  const root = await mkdtemp(join(tmpdir(), 'ti-resource-policy-'))
  try {
    for (const path of tiPackagePolicy.required) {
      await mkdir(dirname(join(root, path)), { recursive: true })
      await writeFile(join(root, path), 'fixture')
    }
    await rm(join(root, 'sdk', 'source', 'ti', 'driverlib', '.meta', 'Common.js'))
    await assert.rejects(verifyTiPackageResources(root), /required resource missing:.*Common.js/)
  } finally { await rm(root, { recursive: true, force: true }) }
})
