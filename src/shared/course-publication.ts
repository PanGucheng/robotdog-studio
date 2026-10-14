export interface CourseReleaseApproval {
  source: 'explicit-user-approval'
  date: string
  reason: string
}

// Author approval permits distribution, without claiming hardware was tested.
export function hardwarePublicationAllowed(lesson: {
  verification?: unknown
  releaseApproval?: unknown
}): boolean {
  if (lesson.verification === 'hardware-checked') return true
  if (lesson.verification !== 'author-approved') return false
  const approval = lesson.releaseApproval as Partial<CourseReleaseApproval> | undefined
  return approval?.source === 'explicit-user-approval' && typeof approval.date === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/.test(approval.date) && typeof approval.reason === 'string' &&
    approval.reason.trim().length > 0
}
