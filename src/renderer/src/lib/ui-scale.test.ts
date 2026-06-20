import { describe, expect, it } from 'vitest'
import { recommendedUiScale } from './ui-scale'

describe('recommendedUiScale', () => {
  it.each([
    [1920, 1, 100],
    [2560, 1, 125],
    [3840, 1, 150],
    [2048, 1.25, 100],
    [2560, 1.5, 100]
  ])('chooses a readable scale for width %s and DPR %s', (width, ratio, expected) => {
    expect(recommendedUiScale(width, ratio)).toBe(expected)
  })
})
