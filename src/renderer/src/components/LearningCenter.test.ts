import { describe, expect, it } from 'vitest'
import { expandStoredLearningProgress, getLearningTaskProgress, learningTasks, progressKey } from './LearningCenter'

describe('LearningCenter progress model', () => {
  it('expands old task-level progress into step-level progress', () => {
    const expanded = expandStoredLearningProgress(['ai-parameter'])
    const task = learningTasks.find((item) => item.id === 'ai-parameter')!

    expect(expanded).toEqual(task.steps.map((step) => progressKey(task.id, step.id)))
  })

  it('ignores unknown stored progress and counts only known steps', () => {
    const task = learningTasks.find((item) => item.id === 'code')!
    const firstStep = progressKey(task.id, task.steps[0].id)
    const progress = getLearningTaskProgress(task, expandStoredLearningProgress([firstStep, 'unknown-task', 'code/nope']))

    expect(progress).toEqual({ done: 1, total: 3 })
  })
})
