const friendlyErrors: Array<[RegExp, string]> = [
  [/CANDIDATE_DIFF_NOT_READY/i, '修改内容还在准备中，请稍等片刻。'],
  [/CANDIDATE_NOT_APPLICABLE/i, '这份修改已经失效或已保存过。请回到当前对话，重新打开最新的“修改确认”。'],
  [/CANDIDATE_(STALE|CONFLICT)/i, '代码在修改期间发生了变化。你的草稿仍然保留，请重新检查后再统一保存。'],
  [/WORKSPACE.*NOT_FOUND/i, '没有找到这次练习。它可能已被移动，请新建一个对话后再试。'],
  [/BASELINE.*(INVALID|MISMATCH)|固件基线.*(不完整|不一致)/i, '临时 SDK 和登记版本不一致，已停止编译以保护项目。请让教师检查 SDK 设置。'],
  [/TOOLCHAIN|gcc|objcopy|openocd/i, '程序翻译工具没有准备好。请在“设置”中查看工具状态，学生代码不会因此丢失。'],
  [/ENOENT|no such file/i, '需要的文件没有找到。草稿没有丢失，请让教师检查项目或工具安装位置。'],
  [/blocked: the user declined|declined this tool call/i, '这次修改没有获得同意，所以没有写入草稿。你可以调整要求后重新发送。'],
  [/API.?KEY|401|unauthorized/i, 'AI 助教的连接信息无效，请让教师在 AI 设置中重新配置。'],
  [/network|ECONN|timeout|timed out/i, '网络连接暂时不可用。已经完成的草稿仍在本机，可以稍后重试。']
]

export function toStudentErrorMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error)
  const match = friendlyErrors.find(([pattern]) => pattern.test(raw))
  return match?.[1] ?? `操作没有完成：${raw}`
}
