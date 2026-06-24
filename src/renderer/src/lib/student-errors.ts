export interface StudentProblem {
  title: string
  whatHappened: string
  why: string
  nextStep: string
  technicalDetail?: string
}

const friendlyProblems: Array<[RegExp, Omit<StudentProblem, 'technicalDetail'>]> = [
  [/CANDIDATE_DIFF_NOT_READY/i, {
    title: '修改对比还没准备好',
    whatHappened: '系统正在整理这次修改的前后对比，暂时还不能展示。',
    why: 'AI 或代码检查刚刚结束时，修改清单和安全校验需要一点时间同步。',
    nextStep: '请稍等几秒，或切到别的页面后再回到“修改确认”。正式项目没有变化。'
  }],
  [/CANDIDATE_NOT_APPLICABLE/i, {
    title: '这次修改已经不能保存',
    whatHappened: '你点到的修改已经失效、被放弃，或已经保存过一次。',
    why: '每次修改都只对应一个安全草稿。为了避免把旧代码写回项目，系统会拒绝过期修改。',
    nextStep: '回到当前对话，打开最新的“修改确认”；如果没有最新修改，请重新让 AI 生成一次。'
  }],
  [/CANDIDATE_(STALE|CONFLICT)/i, {
    title: '代码在中途发生了变化',
    whatHappened: '这次修改和当前项目版本对不上了，所以系统没有继续保存。',
    why: '可能是你同时编辑了代码、撤销了存档，或者另一个候选修改改变了同一份文件。',
    nextStep: '先保留当前草稿，再重新检查代码或重新生成修改。'
  }],
  [/WORKSPACE.*NOT_FOUND/i, {
    title: '没有找到这次练习',
    whatHappened: '系统找不到当前学生对话对应的本机工作区。',
    why: '工作区可能被移动、删除，或本机数据目录没有准备好。',
    nextStep: '请新建一个学生对话继续练习；如果要找回旧项目，请让教师检查数据文件夹。'
  }],
  [/BASELINE.*(INVALID|MISMATCH)|固件基线.*(不完整|不一致)|SDK.*(校验|不一致)/i, {
    title: '小马程序模板没有通过校验',
    whatHappened: '完整固件编译已暂停，避免用不确定的 SDK 生成程序。',
    why: '当前临时 SDK 和登记清单不一致，或缺少必要文件。',
    nextStep: '学生代码不会丢失。请让教师到“设置”检查 SDK 基线，必要时重新选择正确的固件模板。'
  }],
  [/TOOLCHAIN|gcc|objcopy|openocd|内置 WCH/i, {
    title: '程序翻译工具没有准备好',
    whatHappened: '系统还不能把代码翻译成芯片能运行的程序。',
    why: 'WCH GCC、objcopy 或 OpenOCD 可能缺失、损坏，或正在检查中。',
    nextStep: '可以继续看代码和草稿；生成程序前，请让教师在“设置”里检查工具链状态。'
  }],
  [/构建命令退出码|compile|编译|error:/i, {
    title: '代码没有通过检查',
    whatHappened: '编译器读到某处代码时停下来了。',
    why: '常见原因是少了分号、变量名写错、括号不配对，或使用了没有声明的函数。',
    nextStep: '先看标出的关键行，再点击“请 AI 解释”或“接受建议并修复草稿”。'
  }],
  [/ENOENT|no such file/i, {
    title: '需要的文件没有找到',
    whatHappened: '系统在读取项目或工具文件时没有找到目标文件。',
    why: '文件可能被移动、路径设置不对，或临时目录尚未生成完成。',
    nextStep: '草稿不会因此丢失。请重试一次；如果仍失败，请让教师检查项目和工具安装位置。'
  }],
  [/blocked: the user declined|declined this tool call/i, {
    title: '这次修改没有获得同意',
    whatHappened: 'AI 想进行的操作被拒绝了，所以没有写入草稿。',
    why: '这通常来自审批选择，或安全策略自动拦截了不合适的操作。',
    nextStep: '你可以调整要求后重新发送；如果只是误点拒绝，可以让 AI 再试一次。'
  }],
  [/API.?KEY|401|unauthorized/i, {
    title: 'AI 助教还没有连上',
    whatHappened: 'AI 服务没有接受当前连接信息。',
    why: '访问密钥可能没有配置、已经失效，或输入时复制错了。',
    nextStep: '请让教师在 AI 设置中重新保存密钥。非 AI 的代码查看、编译和模拟功能仍可使用。'
  }],
  [/network|ECONN|timeout|timed out/i, {
    title: '网络暂时没有接上',
    whatHappened: 'AI 助教或后台服务这次没有及时响应。',
    why: '可能是网络波动、服务繁忙，或请求超时。',
    nextStep: '已经保存的草稿仍在本机。稍后重试，或先使用手动编写和检查代码。'
  }]
]

export function toStudentErrorMessage(error: unknown): string {
  return toStudentProblem(error).whatHappened
}

export function toStudentProblem(error: unknown, fallbackTitle = '操作没有完成'): StudentProblem {
  const raw = error instanceof Error ? error.message : String(error)
  const match = friendlyProblems.find(([pattern]) => pattern.test(raw))
  if (match) return { ...match[1], technicalDetail: redactTechnicalDetail(raw) }
  return {
    title: fallbackTitle,
    whatHappened: '系统没有完成刚才的操作。',
    why: '这可能是项目状态、工具检查或临时文件准备过程中出现了意外情况。',
    nextStep: '请先重试一次；如果再次出现，请展开技术细节交给教师排查。',
    technicalDetail: redactTechnicalDetail(raw)
  }
}

function redactTechnicalDetail(raw: string): string {
  return raw
    .replace(/sk-[A-Za-z0-9_-]{8,}/g, 'sk-***')
    .replace(/(api[_-]?key|authorization|token)(["'=:\s]+)[^\s"',;}]+/gi, '$1$2***')
}
