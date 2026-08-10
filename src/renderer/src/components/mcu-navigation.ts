export type McuView =
  | { kind: 'home'; panel: 'landing' | 'free-practice' }
  | { kind: 'course-center'; courseId?: string; lessonId?: string }
  | { kind: 'lesson'; courseId: string; lessonId: string }
  | { kind: 'workspace'; workspaceId: string }

export function mcuWorkspaceId(view: McuView): string | undefined {
  return view.kind === 'workspace' ? view.workspaceId : undefined
}
