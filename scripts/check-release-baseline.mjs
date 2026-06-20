import { readFile } from 'node:fs/promises'
import { isAbsolute, join, resolve } from 'node:path'

const root = process.cwd()
const baselineRoot = join(root, 'resources', 'firmware-baselines', 'ch32v203-robotdog')
const registry = JSON.parse(await readFile(join(baselineRoot, 'active.json'), 'utf8'))
if (typeof registry.manifest !== 'string' || isAbsolute(registry.manifest) || registry.manifest.split(/[\\/]/).includes('..')) throw new Error('固件基线登记路径不安全')
const manifestPath = resolve(baselineRoot, registry.manifest)
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
const failures = []
if (manifest.status !== 'release') failures.push(`status=${manifest.status}`)
if (manifest.releaseEligible !== true) failures.push('releaseEligible=false')
if (manifest.target?.memory?.confirmed !== true) failures.push('芯片 Flash/RAM 尚未确认')
if (!Array.isArray(manifest.integrity) || manifest.integrity.length === 0) failures.push('缺少 SDK 完整性清单')
if (failures.length > 0) {
  console.error('正式 Windows 包已被发布门禁阻止：')
  for (const failure of failures) console.error(`- ${failure}`)
  console.error('当前仍可运行 package:win:test 生成带醒目标记的临时功能测试包。')
  process.exit(2)
}
console.log(`正式固件基线门禁通过：${manifest.id}`)
