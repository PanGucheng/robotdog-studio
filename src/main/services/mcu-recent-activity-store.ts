import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { z } from 'zod'
import type { McuRecentActivity, McuRecentActivityInput } from '../../shared/types'

const idSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
const workspaceIdSchema = z.string().regex(/^ws_[a-f0-9]{24}$/)
const activitySchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('lesson'), courseId: idSchema, lessonId: idSchema, openedAt: z.string().datetime() }).strict(),
  z.object({ kind: z.literal('workspace'), workspaceId: workspaceIdSchema, openedAt: z.string().datetime() }).strict()
])

export class McuRecentActivityStore {
  private readonly path: string
  private queue = Promise.resolve()

  constructor(path: string) { this.path = resolve(path) }

  async initialize(): Promise<void> { await mkdir(dirname(this.path), { recursive: true }) }

  async list(): Promise<McuRecentActivity[]> {
    const parsed = z.array(activitySchema).safeParse(JSON.parse(await readFile(this.path, 'utf8').catch(() => '[]')))
    return parsed.success ? parsed.data.sort((left, right) => right.openedAt.localeCompare(left.openedAt)) : []
  }

  async record(activity: McuRecentActivityInput): Promise<McuRecentActivity[]> {
    let result: McuRecentActivity[] = []
    this.queue = this.queue.catch(() => undefined).then(async () => {
      const openedAt = new Date().toISOString()
      const next = activity.kind === 'lesson'
        ? activitySchema.parse({ ...activity, openedAt })
        : activitySchema.parse({ ...activity, openedAt })
      const key = activityKey(next)
      result = [next, ...(await this.list()).filter((item) => activityKey(item) !== key)].slice(0, 50)
      const temporary = `${this.path}.tmp`
      await writeFile(temporary, `${JSON.stringify(result, null, 2)}\n`, 'utf8')
      await rename(temporary, this.path)
    })
    await this.queue
    return result
  }
}

function activityKey(activity: McuRecentActivity): string {
  return activity.kind === 'lesson' ? `lesson:${activity.courseId}:${activity.lessonId}` : `workspace:${activity.workspaceId}`
}
