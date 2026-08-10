# RobotDog Studio MCU 实验工作台整体重构具体实施方案

更新日期：2026-08-10

状态：代码实施完成，待项目所有者人工界面与真实硬件验收

代码基线：`main@1e974dad75fa32fa11ba1615f92b8d32579b0f3f`

适用发行版：`mcu-foundations`

产品依据：[RobotDog Studio MCU 实验工作台整体重构开放式实施计划](./RobotDog%20Studio%20MCU%20实验工作台整体重构开放式实施计划.md)

## 1. 文档目的

本文把开放式计划收敛成可直接执行的工程方案。实施者应按照本文确定的组件边界、状态归属、事件规则、迁移顺序和验收标准完成开发，不再重新选择工作台的信息架构。

本轮重构只改变学生看见和操作现有能力的方式，不重写 Candidate、CourseProgress、Firmware Build、WCH-Link、Flash、Lecture 或 AI 的可信状态机。

最终产品必须稳定表达五个角色：

```text
Project Explorer  工程里有什么
Code Surface      在哪里编写、检查和验证代码
Lab Guide         当前实验要做什么
Bottom Panel      代码和程序刚刚发生了什么
Floating AI       遇到问题时向谁求助
```

## 2. 已核实的代码现状

### 2.1 当前 Renderer 结构

基线代码已经具备完整工程树、Monaco、Candidate、Diff、Firmware Build、Flash、课程步骤和 AI 对话能力，但仍通过互斥工具模型组织：

```text
McuWorkbench
├─ StudentCodeEditor
│  ├─ Project Explorer
│  ├─ Code Toolbar
│  ├─ Monaco
│  └─ Compiler Help Card
├─ Tool Rail
│  ├─ course
│  ├─ run
│  └─ assistant
└─ Tool Panel
   ├─ McuCourseTool
   ├─ McuBuildRunTool
   └─ ChatPanel
```

`McuWorkbench.tsx` 当前持有：

- `activeTool: 'course' | 'run' | 'assistant'`；
- `toolPanelOpen`、`toolWidth` 和对应 localStorage；
- Candidate 就绪时自动切换到 `run`；
- 代码解释时自动切换到 `assistant`；
- Tool Rail 和单一右侧 Tool Panel。

这正是本轮需要移除的产品模型。

### 2.2 可直接复用的能力

| 能力 | 当前事实来源 | 重构策略 |
| --- | --- | --- |
| 工程树与文件读取 | `ProjectExplorerService`、`StudentCodeEditor` | 原样复用权限与读取接口 |
| 自动保存草稿 | `writeManualDraft` | 保留 550ms 防抖与切文件前保存 |
| Candidate Validate/Build | `CandidateService` | 保留状态机，迁移展示位置 |
| Diff/Apply/Reject | `DiffReview`、Candidate API | 保留明确确认，不自动 Apply |
| Firmware Build | `FirmwareBuildService` | 保留单任务模型，补充可选展示字段 |
| Firmware 有效性 | `FirmwareBuildProof` 与 Workspace identity | 继续由 proof 判断，不创建 Renderer-only truth |
| Flash | WCH-Link/USB 现有服务 | 保留设备检查、取消、错误与导航守卫 |
| 课程步骤 | `CourseProgressSnapshot` | 继续作为唯一实验进度真相 |
| Lecture Reference | Course Lecture API | 保留安全模型和阅读进度隔离 |
| Course Lecture AI 历史 | `CourseLectureHistoryService`、`listCourseLectureHistory(courseId, lessonId)` | 按 Course/Lesson/Version 独立保存，不并入 Workspace Agent 历史 |
| Workspace AI 历史 | `AgentSessionService`、`listAgentHistory(workspaceId)` | 按 Workspace 独立保存，复用可信课程上下文与 Candidate 流程 |

### 2.3 当前需要修正的作用域问题

`App.tsx` 持有全局单任务快照。新界面不得把其他工作区的后台任务误显示为当前工作区任务：

- `candidate.workspaceId` 不匹配时，当前 Code Surface 不消费该 Candidate；
- `build.workspaceId` 不匹配时，当前 Bottom Panel 不显示为本项目正在构建；
- `agentTurn.workspaceId` 不匹配时，当前 AI 浮窗不进入 running 状态；
- 后台 Build 完成后只刷新对应工作区的 CourseProgress，只有该工作区仍是当前视图时才写入当前页面状态；
- Firmware Update、Recovery、WCH-Link 写入继续使用现有全局单任务与导航守卫。

## 3. 冻结的边界

### 3.1 必须完成

- 课程实验始终拥有可见或可立即恢复的 Lab Guide；
- Sandbox 与 Lab 共用同一个开发工作流，Sandbox 仅不渲染 Lab Guide；
- Bottom Panel 只能位于中央 Code Surface 下方；
- Tool Rail 和 `activeTool` 最终删除；
- Candidate、Build、Output、Flash 和 AI 都靠近代码；
- AI 打开时 Explorer、Code Surface、Bottom Panel 和 Lab Guide 不卸载；
- Floating AI 只统一视觉外壳，Workspace AI 与 Course Lecture Q&A 的历史、权限和作用域必须隔离；
- 保存草稿、检查 Candidate、Apply、生成 Firmware、Flash 保持五个不同动作；
- 高缩放和窄窗口不恢复互斥工具页面。

### 3.2 明确不做

- 通用 Terminal、Shell、命令执行；
- 多聊天窗口、多 Agent、多 Firmware Build 并发；
- 通用 Dock Manager、插件系统、自由布局设计器；
- 串口终端、调试器、断点、Watch、寄存器；
- 多编辑器、Split Editor、通用文件搜索；
- Candidate、Flash 或 Build 状态机重写；
- 修改 LessonLearningProgress 与 CourseProgress 的合同；
- 把 UI preference 写入学生 Git 或工作区 Metadata。

## 4. 视觉与交互方向

### 4.1 主题、受众和单一任务

- 主题：CH32V203 RobotDog 嵌入式实验台；
- 受众：正在学习 C 语言工程、编译链接和单片机烧录流程的大学低年级学生；
- 单一任务：让学生持续对照“任务—代码—编译结果”，并在需要时召唤 AI。

### 4.2 颜色、字体与主题边界

继续复用当前 RobotDog MCU 的浅色、青蓝工业实验台主题和既有 semantic token。本轮信息架构重构不得顺带更换整体主题，不得引入深色 Monaco 代码画布，也不得复制一套仅供新组件使用的近似色：

| 令牌 | 色值 | 用途 |
| --- | --- | --- |
| `--navy` | `#10243A` | 标题、结构文本和高对比信息 |
| `--canvas` | `#F6F8FB` | 工作台浅色画布 |
| `--panel` | `#FFFFFF` | Explorer、Guide、Panel 与浮窗表面 |
| `--sensor` | `#00A8C6` | 当前文件、活动 Tab、定位与交互反馈 |
| `--amber` | `#F3A712` | 构建中、待处理与警告 |
| `--green` | `#16A36A` | 保存、检查、构建和连接通过 |
| `--red` | `#D92D20` | 阻断问题、失败和危险动作 |

Monaco 继续使用现有 `robotdog-track` 主题：`base: 'vs'`、`editor.background: '#FFFFFF'`、`editor.foreground: '#17384A'`，以及既有 selection、line highlight、cursor 和语法色。Bottom Panel、Lab Guide、Floating AI 和构建信号带优先直接消费现有 token；确需补充 running/passed/failed 变体时，也从 `--amber`、`--green`、`--red` 派生，不改变编辑器明暗关系。

若后续认为需要调整整体主题，必须另立视觉改版任务并单独验收，不在本轮信息架构重构中实施。

字体固定为：

- 标题与结构：`Bahnschrift`, `Microsoft YaHei UI`, sans-serif；
- 正文与控件：`Microsoft YaHei UI`, sans-serif；
- 代码、路径、版本和数值：`Cascadia Mono`, `Consolas`, monospace。

### 4.3 布局签名

本工作台只保留一个识别性元素：**构建信号带**。

它位于 Code Surface 底部，只横跨中央代码区域。展开时是 Bottom Panel 顶部的状态线，收起时成为 32px 状态条的上边界。信号颜色只表达可信状态：青色表示选中、琥珀表示运行、绿色表示通过、红色表示失败。

构建信号带来自单片机实验台的信号和编译反馈，而不是装饰。旧方案中的 Tool Rail 不再作为视觉签名，其他区域保持克制，避免把工作台做成仪表盘堆叠。

### 4.4 目标线框

课程实验：

```text
┌──────────────────────────────────────────────────────────────────────┐
│ Top Bar                                                              │
├──────────────┬───────────────────────────────────┬───────────────────┤
│ Project      │ Code Action Bar                   │ Lab Guide         │
│ Explorer     ├───────────────────────────────────┤ Current Step      │
│              │ Monaco + Diff Layer               │                   │
│              │                                   │                   │
│              ├═══════════════════════════════════┤                   │
│              │ Problems | Build | Output         │                   │
│              │ Bottom Panel                      │                   │
└──────────────┴───────────────────────────────────┴───────────────────┘
                                                          ○ AI
```

Sandbox：

```text
┌──────────────┬───────────────────────────────────────────────────────┐
│ Explorer     │ Code Action Bar                                       │
│              ├───────────────────────────────────────────────────────┤
│              │ Monaco + Diff Layer                                   │
│              ├═══════════════════════════════════════════════════════┤
│              │ Problems | Build | Output                             │
└──────────────┴───────────────────────────────────────────────────────┘
                                                             ○ AI
```

## 5. 目标组件架构

### 5.1 组件树

```text
McuWorkbench
├─ McuDevelopmentArea
│  └─ StudentCodeEditor
│     ├─ ProjectExplorerPane
│     └─ CodeSurface
│        ├─ CodeActionBar
│        ├─ EditorStage
│        │  ├─ MonacoEditor             // 始终 mounted
│        │  └─ DiffReview?              // 可见时作为覆盖层
│        └─ McuBottomPanel
├─ McuLabGuide?                 // 仅 mcu-lesson-attempt
└─ McuFloatingAssistant
   └─ AssistantShell
      ├─ WorkspaceAssistantView         // listAgentHistory(workspaceId)
      └─ CourseLectureQaView            // listCourseLectureHistory(courseId, lessonId)
```

外层 `McuWorkbench` 使用两列 Grid：`minmax(0, 1fr) + Lab Guide`。第一列内部的 `StudentCodeEditor` 再使用 `Explorer + Code Surface` 两列。这样视觉上是三列，但 Bottom Panel 天然只属于 Code Surface。

### 5.2 `McuWorkbench` 职责

`McuWorkbench` 只负责工作区级编排：

- 判断 Lab 或 Sandbox；
- 保存 Explorer、Guide、Bottom Panel 和 AI 的 UI preference；
- 组合当前工作区 Candidate、Build、CourseProgress 和 Agent 视图模型；
- 处理文件定位、Diff 展示、Bottom Panel 自动事件和 AI domain 路由；
- 处理 Guide/Explorer 宽度拖动与响应式状态；
- 保持 Monaco 组件实例不因 Guide、Panel 或 AI 状态变化而卸载。

删除：

- `McuToolId`；
- `activeTool`；
- `toolButtons`；
- `toolPanelOpen`；
- `robotdog.mcu-tool.*`、`robotdog.mcu-tool-panel-open`；
- Tool Rail 和 Tool Panel DOM。

### 5.3 `StudentCodeEditor` 职责

继续负责：

- Project Explorer 数据加载与受控文件读取；
- 当前文件、展开目录、文件内容和权限；
- Monaco 实例、marker、焦点和定位；
- 手动 Candidate 创建、自动保存、Validate、Candidate Build；
- 切换文件前保存最新草稿；
- 选中代码的只读 AI 请求。

重构后：

- `.student-editor-main` 固定为 `Action Bar / Editor Stage / Bottom Panel` 三行；
- Bottom Panel 通过明确的组件插槽放在 `.student-editor-main` 内，而不是放在 `StudentCodeEditor` 外层；
- Editor Stage 内的 Monaco host 从首次挂载到离开 Workspace 前始终存在；Diff 只在视觉上覆盖 Editor Stage，不得以条件分支替换或卸载 Monaco；
- 打开/关闭 Diff 不得销毁 Monaco editor、model、undo stack 或 view state，也不得通过改变 React `key` 强制重建；
- 删除 `compiler-help-card`、`editor-feedback` 中重复的完整诊断展示；
- Candidate 失败只设置状态并通知 Workbench，Problems 成为唯一结构化诊断区；
- 不再在失败后自动请求 AI，学生点击“让 AI 解释”才发起只读请求。

### 5.4 新组件

建议新增：

```text
src/renderer/src/components/McuBottomPanel.tsx
src/renderer/src/components/McuFloatingAssistant.tsx
src/renderer/src/components/McuLabGuide.tsx
src/renderer/src/components/mcu-workspace-model.ts
```

`mcu-workspace-model.ts` 只包含纯函数和类型：

- Bottom Panel reducer；
- Candidate/Firmware problem 聚合；
- Firmware proof 是否属于当前工作区；
- Code Action Bar 状态推导；
- AI 几何钳制与吸附；
- localStorage 解析、版本检查和默认值；
- 后台任务作用域判断。

纯函数必须与 React 分离，便于在不依赖屏幕环境的情况下完整测试。

### 5.5 旧组件处理

- `McuCourseTool.tsx` 的课程、回答、观察和 Lecture 能力迁移到 `McuLabGuide.tsx`；迁移测试通过后删除旧文件。
- `McuBuildRunTool.tsx` 的 Candidate、Build、内存、设备和 Flash 展示分别迁入 Code Action Bar 与 Bottom Panel；迁移测试通过后删除旧文件。
- `ChatPanel.tsx` 保留，修改紧凑模式中“去构建与运行查看”的旧文案，改为“在代码下方查看修改和构建状态”。
- `DiffReview.tsx` 保留，不改变 Apply/Reject 合同。

## 6. UI 状态模型与持久化

### 6.1 Bottom Panel reducer

```ts
type BottomPanelTab = 'problems' | 'build' | 'output'

interface BottomPanelUiState {
  open: boolean
  tab: BottomPanelTab
  height: number
}

type BottomPanelAction =
  | { type: 'USER_OPEN'; tab?: BottomPanelTab }
  | { type: 'USER_CLOSE' }
  | { type: 'USER_SELECT_TAB'; tab: BottomPanelTab }
  | { type: 'USER_RESIZE'; height: number; surfaceHeight: number }
  | { type: 'CANDIDATE_FAILED' }
  | { type: 'FIRMWARE_STARTED' }
  | { type: 'FIRMWARE_FAILED' }
  | { type: 'FIRMWARE_COMPLETED' }
  | { type: 'RESTORE'; value: unknown; surfaceHeight: number }
```

Reducer 固定规则：

| 事件 | 结果 |
| --- | --- |
| Candidate 失败 | `open=true, tab='problems'` |
| Firmware 开始 | `open=true, tab='build'` |
| Firmware 失败 | `open=true, tab='problems'` |
| Firmware 成功 | `open=true, tab='build'`，不自动关闭 |
| 用户查看 Output | 只改 Tab，不影响 Build |
| 用户收起 | `open=false`，后台任务继续 |
| 恢复非法数据 | 使用默认值并按当前高度重新钳制 |

默认高度 240px，最小 160px。动态最大高度为：

```ts
maxPanelHeight = Math.max(160, surfaceHeight - actionBarHeight - collapsedStatusHeight - 220)
```

其中 220px 是 Monaco 必须保留的最小工作高度。窗口变化、UI Scale 变化和 Guide/Explorer 调整后重新计算。

### 6.2 Lab Guide 状态

```ts
type LabGuideView =
  | { kind: 'current' }
  | { kind: 'overview'; highlightedStepId?: string }
  | { kind: 'reference'; sectionId?: string }
```

默认 `current`。完整任务与讲义都是 Guide 的内部子视图，不改变当前文件、Candidate、Panel 或 AI 状态。

### 6.3 Floating AI 状态

```ts
interface FloatingAiPlacement {
  edge: 'left' | 'right'
  yRatio: number
}

type AssistantDomain = 'workspace' | 'lecture'

interface FloatingAiUiState {
  open: boolean
  placement: FloatingAiPlacement
  activeDomain: AssistantDomain
  unread: Record<AssistantDomain, boolean>
}

type PersistedFloatingAiPreference = Pick<FloatingAiUiState, 'open' | 'placement'>
```

`activeDomain` 和 `unread` 只属于运行期，不写入 localStorage：进入 Workspace 默认是 `workspace`，Lecture 入口显式切到 `lecture`，Header 的“返回实验 AI”切回 `workspace`。两个 domain 各自保留当前会话内的草稿、滚动位置和加载状态，但不共享或拼接事件数组。

首次进入工作区默认关闭，仅显示圆形按钮。返回同一工作区时恢复展开状态和位置。新的 Workspace Agent terminal event 在浮窗关闭时只更新 Workspace domain 的 `unread`；Lecture Q&A 可维护独立未读提示。历史内容始终从各自 Main 服务读取，不写入 UI preference。

### 6.4 localStorage 键

所有新增键带 `v1` 版本：

```text
robotdog.mcu.workspace-ui.v1.<workspaceId>
robotdog.mcu.bottom-panel.v1.<workspaceId>
robotdog.mcu.lab-guide.v1.<workspaceId>
robotdog.mcu.ai.v1.<workspaceId>
```

`workspace-ui` 保存 Explorer/Guide 宽度和 Explorer 是否折叠；其余键分别保存对应 UI preference。`mcu.ai` 只保存 `open + placement`，不保存当前 domain、未读或任何历史内容。

解析要求：

- 只接受预期对象、枚举、有限数字和布尔值；
- `height`、`width`、`yRatio` 每次读取和 resize 后重新钳制；
- JSON 损坏、版本未知或工作区类型不匹配时回退默认；
- 旧 Tool Rail 键不迁移，旧界面删除时一并清理；
- 不保存 Candidate、Build、CourseProgress、Firmware proof 或硬件状态。

当前文件继续使用已有 `robotdog.mcu-last-file.<workspaceId>`。此外，本轮必须增加仅存在于当前应用运行期的 Monaco view-state registry：

```ts
type MonacoSessionViewStateRegistry = Map<WorkspaceId, Map<ProjectPath, ICodeEditorViewState>>
```

- registry 必须位于 Workspace 页面生命周期之上，例如由 `App` 级 `useRef` 或等价的 session service 持有，不能只放在即将卸载的 `StudentCodeEditor` 内；
- 切换文件、打开 Diff 前和从 Workspace 返回 Lesson 前调用 `editor.saveViewState()`，按 `workspaceId + projectPath` 保存；
- 再次进入同一 Workspace 并打开文件后，在 model 就绪时调用 `editor.restoreViewState()`，随后 `layout()`；
- 至少恢复 cursor、selection、scroll 和折叠等 `ICodeEditorViewState` 所含上下文；
- 删除工作区时清理对应 registry；损坏或无法恢复时安全回退到 Monaco 默认位置；
- 本轮不要求应用完全退出后继续恢复 cursor/scroll，因此不把 `ICodeEditorViewState` 写入 localStorage；跨应用重启仍只保证恢复当前文件。

## 7. Code Surface 详细行为

### 7.1 Code Action Bar

Action Bar 每次只突出一个下一步动作，不堆叠完整流水线按钮。

| 状态 | 摘要 | 主动作 | 次动作 |
| --- | --- | --- | --- |
| 只读项目原稿 | 当前文件、权限 | 开始编写 | 解释选中代码 |
| 草稿保存中 | 正在保存草稿 | 无 | 放弃草稿 |
| 草稿已保存 | 草稿已保存 | 检查代码 | 放弃草稿 |
| Candidate 失败 | 代码检查失败 · N 个问题 | 查看问题 | 重新检查、让 AI 解释 |
| Diff 打开 | 修改确认 | 保存到项目 | 放弃修改、返回代码 |
| 已 Apply | ✓ 修改已保存到项目 | 生成完整程序 | 查看构建、撤回上次保存（符合现有条件时） |
| Firmware 有效 | 程序已生成 | 烧录到开发板 | 查看构建 |
| Firmware 过期 | 代码已变化，需要重新生成 | 生成完整程序 | 查看上次构建 |

`busy` 只能禁用会启动或修改可信状态的动作；打开 Panel、Guide、AI、切换 Tab 和查看日志不因无关后台任务统一禁用。

Candidate 通过是“自动进入 Diff”的转换事件，不是一个带“查看修改”按钮的稳定 Action Bar 状态。`生成完整程序` 明确调用 `startFirmwareBuild()`；`查看构建` 只打开 Bottom Panel 的 Build Tab，二者不得共用含混文案或 handler。

### 7.2 Candidate 流程

```text
开始编写
→ openManualDraft
→ 自动保存 writeManualDraft
→ validateCandidate
→ buildCandidate
→ 失败：Problems
→ 成功：DiffReview
→ 明确 Apply 或 Reject
```

具体规则：

- 检查前必须等待当前 save 完成；
- `no_changes` 继续自动收好草稿，不进入 Diff；
- Candidate diagnostics 继续设置 Monaco markers；
- Candidate 失败定位第一条具有有效路径的问题，但不自动请求 AI；
- Candidate 成功自动打开 Diff，不自动 Apply；
- Diff 中的 Apply/Reject 仍调用现有 API；
- Apply 后 Workspace head 变化，旧 Firmware proof 立即显示过期；
- AI Candidate 与 Manual Candidate 共用同一 Diff/Build/Apply 流程。

### 7.3 Diff

Diff 显示在 Code Surface 的 Editor Stage：

```text
Code Surface
├─ Action Bar       保持可见
├─ Editor Stage
│  ├─ Monaco        始终 mounted，保留 editor/model/view state
│  └─ Diff Layer    需要时覆盖并在视觉上替代 Monaco
└─ Bottom Panel     保持可见
```

实现上 `.editor-stage` 使用相对定位，Monaco host 保持原尺寸和实例；`DiffReview` 作为 `position: absolute; inset: 0` 的 layer 覆盖。Diff 打开时 Monaco 失去交互和可访问树焦点，但不得卸载、销毁 model 或清空 undo stack；关闭时移除 Diff layer，恢复打开前保存的 view state，调用 `layout()` 并按来源恢复焦点。

Diff 可以视觉替代 Monaco，但不能生命周期替代 Monaco。Diff 不使用全屏页面、不进入 Lab Guide、不覆盖 Explorer、Action Bar 或 Bottom Panel。

## 8. Bottom Panel 详细方案

### 8.1 视图模型

Renderer 通过纯函数构建：

```ts
interface WorkspaceProblem {
  id: string
  source: 'candidate' | 'firmware' | 'linker' | 'safety'
  severity: 'error' | 'warning'
  message: string
  path?: string
  line?: number
  column?: number
}

interface BottomPanelModel {
  problems: WorkspaceProblem[]
  buildBelongsToWorkspace: boolean
  artifactCurrent: boolean
  statusTone: 'idle' | 'running' | 'passed' | 'failed' | 'stale'
  statusSummary: string
}
```

Candidate 与 Firmware 问题按来源分别转换，不在 Renderer 中修改原始快照。

### 8.2 Problems

排序规则：

1. 当前 Candidate error；
2. 当前 Firmware error；
3. warning；
4. 没有路径的 linker/safety 问题。

列表项显示来源、路径/行列和学生可读消息。点击行为：

- 有可见工程路径：关闭 Diff，打开文件，定位行号并 focus Monaco；
- 只有 linker/safety 信息：保持当前文件，仅选中问题；
- “让 AI 解释”：使用现有只读 diagnostic request，并打开统一 AI 浮窗；
- 不提供自动 Apply、自动修复或自动 Flash。

空状态文案固定为“当前没有需要处理的问题”。

### 8.3 Build

Build Tab 按可信快照显示：

- `preparing`：准备固件基线与教学覆盖层；
- `compiling`：`completedFiles / totalFiles` 和 `currentFile`；
- `linking`：生成 ELF/MAP；
- `packaging`：生成 HEX/BIN、读取 size、写入 proof；
- `completed`：ELF/HEX/BIN/MAP、Flash/RAM、Workspace commit；
- `failed`：失败阶段、主要问题和重新生成；
- proof 不匹配：明确“程序已过期，需要重新生成”。

Flash/RAM 使用现有公式：

```text
Flash = text + data
RAM   = data + bss
```

容量来自当前 Firmware baseline，不在 Renderer 写死。Build proof 必须同时匹配：

- `workspaceId`；
- `workspaceCommit`；
- `firmwareBaselineId`；
- `baselineCommit`。

任一不匹配即 stale，不能显示可烧录。

### 8.4 Output

Output 只显示 Studio 管理的只读日志：

- 按到达顺序展示；
- 保留错误、警告、成功的语义颜色；
- 使用等宽字体和可复制文本；
- 构建过程中自动滚动到底部，用户向上滚动后暂停跟随；
- 不提供输入框、命令提示符、Shell 名称或任意执行入口。

第一版继续沿用 `FirmwareBuildSnapshot.logs` 的 200 行上限，不建立通用日志数据库。

### 8.5 收起状态与拖动

收起条示例：

```text
✕ 2 个问题 · Candidate 检查失败                       ↑
● 正在生成程序 · 18 / 28                              ↑
✓ 程序生成完成 · Flash 23 KB · RAM 4 KB               ↑
```

拖动条：

- 使用 Pointer Events；
- `pointerdown` 记录起始高度；
- `pointermove` 只更新 Panel height；
- `pointerup` 清理 document listener 并持久化；
- 支持键盘调整：焦点位于 separator 时，方向键每次 16px，Shift+方向键每次 48px；
- separator 使用 `role="separator"`、`aria-orientation="horizontal"` 和当前值属性；
- `prefers-reduced-motion` 下不做高度过渡动画。

## 9. Firmware Main 的最小扩展

### 9.1 共享类型

只允许向 `FirmwareBuildSnapshot` 增加可选字段：

```ts
export type FirmwareBuildStage =
  | 'preparing'
  | 'compiling'
  | 'linking'
  | 'packaging'

export interface FirmwareBuildSnapshot {
  // 现有字段保持不变
  stage?: FirmwareBuildStage
  diagnostics?: CandidateDiagnostic[]
}
```

可选字段保证旧快照和演示 API 仍然可读取。不得改变既有状态枚举、事件 channel 或 Preload 方法签名。

### 9.2 FirmwareBuildService

Main 在以下节点更新 `stage`：

| 节点 | stage |
| --- | --- |
| 校验基线、工作区、工具链、缓存 | `preparing` |
| 遍历源文件调用 GCC | `compiling` |
| 设置 ELF 并调用 linker | `linking` |
| objcopy、size、proof、publish | `packaging` |

失败时从已脱敏日志生成最多 20 条 `CandidateDiagnostic`：

- 识别 `.c/.h/.S` 的行列、error、fatal error、warning；
- 路径只保留 Project Explorer 可见的工程相对路径；
- linker `undefined reference` 生成无路径 error；
- 内存容量、基线和安全校验失败生成无路径 safety error；
- 解析不到结构化诊断时使用 `snapshot.error` 作为单条 fallback；
- 绝不把真实磁盘路径写入 Snapshot。

Candidate 编译解析器与 Firmware 解析器共享无 Node 依赖的纯解析函数，避免两套正则逐渐分叉。

### 9.3 IPC 与兼容

- `firmware:build:event` 继续发送原 Snapshot；
- Preload 继续透传；
- Browser demo snapshot 为可选字段提供合理模拟值；
- 缓存 proof 读取时缺少新字段仍可成功恢复；
- Main 仍只允许一个 active Firmware Build。

## 10. Lab Guide 详细方案

### 10.1 Current Step

默认视图固定显示：

- 第 N/M 步和总进度；
- Step title 与 instruction；
- `fileTarget`；
- `lectureSectionId`；
- 当前 Step 的 Question 或 Observation；
- 当前 Firmware proof 是否需要重新生成；
- “定位代码”“回顾相关知识”“问 AI 这一步”“查看全部任务”。

“问 AI 这一步”只打开浮窗并预填：

```text
请帮我理解当前实验步骤，并给我一个可以先亲自检查的小提示。
```

不自动发送。学生发送后，Main 已有 Course context builder 提供可信 current Step、Teaching Focus 和权限边界。

### 10.2 Overview

Overview 在 Guide 内替换 Current Step，显示：

- 全部步骤与完成状态；
- 自动步骤不可手动完成；
- 普通步骤可按现有 CourseProgress contract 更新；
- 完成条件及 passed/failed；
- 返回按钮恢复 Current Step；
- 定位某步骤后切回 Current Step，并突出被定位步骤。

Overview 不离开 Workspace、不卸载 Monaco、不改变当前文件、不关闭 AI。

### 10.3 Question 与 Observation

- Question 继续写入 `CourseProgressUpdate.kind='answer'`；
- Observation 继续写入 `kind='observation'`；
- 输入为空时不可保存；
- AI 可以解释但不得填入 textarea、保存或标记完成；
- hardware-observation 不展示 AI 推断的真实现象；
- 保存成功后以返回的 CourseProgress 刷新 Guide，不建立本地完成真相。

### 10.4 Lecture Reference

Reference 使用 Guide 内部子视图：

- 根据 `lectureSectionId` 定位；
- 保留现有文档 digest、资源安全、字号、章节和滚动位置；
- 返回后恢复 Current Step；
- 阅读 Reference 不写 LessonLearningProgress；
- Reference 中的 `codeTarget` 继续定位 Workspace 文件；
- 选文问答仍调用 `askCourseLecture`，随后打开同一个 Floating AI 外壳并切换到“课程知识问答”；
- 课程回答只从 `listCourseLectureHistory(courseId, lessonId)` 读取，并继续按 `contentVersion + documentDigest` 隔离当前版本与旧版本；
- Lecture answer 不写入或拼接到 `listAgentHistory(workspaceId)`，也不能创建 Candidate；
- 专注阅读不再覆盖 Explorer 和整个 Code Surface，只允许 Guide 扩展为贴边阅读 Drawer。

## 11. Floating AI 详细方案

### 11.1 统一外壳与 domain 路由

Renderer 内部统一使用：

```ts
type FloatingAssistantIntent =
  | { kind: 'workspace-open'; draft?: string }
  | { kind: 'workspace-step'; draft: string }
  | { kind: 'workspace-selection'; request: StudentCodeExplanationRequest }
  | { kind: 'workspace-diagnostic'; request: StudentCodeExplanationRequest }
  | { kind: 'lecture-answer'; courseId: string; lessonId: string }
```

处理规则：

| Intent | 行为 |
| --- | --- |
| `workspace-open` | 切到 Workspace Assistant，打开并 focus 输入框 |
| `workspace-step` | 切到 Workspace Assistant，打开、预填，不自动发送 |
| `workspace-selection` | 调用现有只读解释 API，切到 Workspace Assistant 并显示进度 |
| `workspace-diagnostic` | 调用现有只读诊断解释 API，切到 Workspace Assistant 并显示进度 |
| `lecture-answer` | 切到 Course Lecture Q&A，读取该 Course/Lesson 的讲义历史并定位最新回答 |

一个 `McuFloatingAssistant` 视觉外壳不等于一个历史数据域。内部数据合同冻结为：

| 子状态 | 历史 API 与主键 | 能力边界 |
| --- | --- | --- |
| Workspace Assistant | `listAgentHistory(workspaceId)` | 工程级问答；保留 current Step、Teaching Focus、权限上下文；可按现有安全流程进入 Candidate |
| Course Lecture Q&A | `listCourseLectureHistory(courseId, lessonId)`，并尊重 `contentVersion + documentDigest` | 可信讲义问答；explanation only；不得进入 Candidate、Apply、Build 或 Flash |

实现不得把两组 `AgentEvent[]` concat、复制或回写到另一历史服务。Floating shell 可以共享窗口、按钮、Markdown renderer 和事件卡片组件，但必须使用两个独立 history adapter。Lecture 回答完成后显示“返回实验 AI”，切回时恢复原 Workspace history、草稿和滚动位置。

### 11.2 Button 拖动与吸附

圆形按钮：

- 直径 52px；
- 默认右下安全边缘，距离 Workspace 边界 16px；
- 只允许在 Workspace 有效矩形内拖动；
- pointer 位移小于 6px 视为 click；
- 位移达到 6px 后进入 drag，释放时不触发 click；
- 松手比较到左右安全边缘的距离并吸附最近边；
- `yRatio` 按可用垂直范围计算并钳制到 `[0, 1]`；
- resize、UI Scale 或 Guide Drawer 状态变化后重新计算绝对位置；
- 无效持久化恢复默认。

按钮不能停在代码中央，因为最终位置只有 `left` 或 `right` 两条安全边。Top Bar 不属于 Workspace 可拖动矩形，因此不会遮挡急停。模态 Dialog 使用更高 z-index 和 `aria-modal`，AI 不得覆盖确认内容。

纯几何函数签名：

```ts
clampFloatingPoint(point, workspaceRect, buttonSize, margin): Point
snapFloatingPlacement(point, workspaceRect, buttonSize, margin): FloatingAiPlacement
resolveFloatingPoint(placement, workspaceRect, buttonSize, margin): Point
isPointerDrag(start, current, threshold = 6): boolean
```

### 11.3 Chat Window

- 桌面宽度 380px，高度 `min(620px, workspaceHeight - 32px)`；
- 固定贴在按钮所属边缘，不允许任意拖动；
- Header 显示 AI 助教、当前子状态（“实验 AI”或“课程知识问答”）、对应上下文摘要和最小化/关闭；
- Course Lecture Q&A 显示“返回实验 AI”，切换只改变可见 domain，不迁移历史事件；
- 关闭只改变 `open`，不调用 `cancelAgent`；
- 用户显式点击“停止”才取消当前 Agent turn；
- 运行中最小化后继续接收事件；
- 回答完成后按钮显示 unread 点；
- Candidate notice 文案指向 Code Surface/Bottom Panel，不再提旧右侧工具。

窄窗口下 Chat Window 退化为右侧 Drawer，宽度 `min(380px, 100% - 48px)`，仍不卸载其他区域。

### 11.4 可访问性

- Button 使用 `aria-label="打开 AI 助教"`，unread 使用可读状态文本；
- Drawer/Window 使用有名称的 `role="dialog"`，但非 modal，不锁定整个页面焦点；
- 打开时 focus 输入框，关闭后 focus 返回圆形按钮；
- Escape 仅最小化 AI，不取消任务；
- keyboard 用户可以通过“移动到左侧/右侧”菜单替代拖动；
- `prefers-reduced-motion` 下禁用吸附动画。

## 12. Build、Flash 与 CourseProgress

### 12.1 Firmware 状态

当前工作区只消费 `build.workspaceId === workspace.id` 的运行/失败快照。

如果全局 Build 属于其他工作区：

- 当前 Build Tab 显示“另一个项目正在生成程序”；
- 使用 `mcuWorkspaces` 根据 ID 显示项目名称；
- 当前项目的生成按钮禁用，原因明确为单任务限制；
- 不把其他项目日志、问题或进度混入当前 Panel；
- 任务完成后当前项目恢复可生成。

### 12.2 CourseProgress 刷新

`App.tsx` 使用当前工作区 ref 或按 ID 存储的进度，避免事件 listener 捕获初始 render 的旧 `workspaces/currentWorkspaceId`：

```text
Build/Candidate/Flash event(workspaceId)
→ Main 已按现有规则记录 Course operation
→ Renderer getCourseProgress(workspaceId)
→ 若 workspaceId 仍是当前工作区，更新当前 Guide
→ 否则只更新完成课次索引或延迟到进入该工作区时读取
```

源码 Apply/Undo 后仍由 Main 将旧 Firmware operation 标记 stale。Guide 和 Bottom Panel 都读取返回的 CourseProgress/Proof，不自行伪造 stale。

### 12.3 Flash

Flash 入口只在 Firmware proof 当前有效时出现，可放在 Code Action Bar 与 Build Tab，但两处调用同一现有 handler。

必须保留：

- WCH-Link probe/target ready；
- USB update 现有检查；
- workspace/proof/artifact identity；
- 可取消状态；
- 失败日志；
- Navigation Guard；
- 学生的明确点击动作。

AI 不拥有 Flash handler，也不能通过 Assistant Intent 触发 Flash。

烧录期间 Bottom Panel Build Tab 显示当前写入方式、设备、进度和取消动作。Output 可显示 WCH-Link 技术日志，但不把日志误标为 Firmware compile output。

## 13. 响应式与缩放

使用 `.mcu-workbench-shell` 容器查询，断点按有效 CSS 像素计算，因此自然覆盖系统窗口尺寸和 100%–175% UI Scale。

| 有效宽度 | Explorer | Code Surface | Lab Guide | AI |
| --- | --- | --- | --- | --- |
| `>=1180px` | 220–340px，可拖动 | `minmax(560px, 1fr)` | 340–440px，可拖动 | 贴边浮窗 |
| `900–1179px` | 默认 220px | 至少 480px | 固定 300–340px | 贴边浮窗 |
| `720–899px` | 折叠为 44px 入口，可临时展开 | 至少 416px | 260px 常驻 | 贴边浮窗 |
| `<720px` | 44px 入口/临时 Drawer | 占满主宽度 | 独立 Guide Drawer | 独立 AI Drawer |

规则：

- Guide Drawer 和 AI Drawer 有各自按钮，不是三选一 Tool Rail；
- 打开 Drawer 只覆盖，不卸载 Monaco；
- Guide Drawer 默认优先级高于 AI，二者同时打开时 AI 自动最小化但任务继续；
- Bottom Panel 默认高度在 `<900px` 时为 190px；
- Action Bar 在窄宽度只保留状态摘要与主动作，次动作进入明确的更多菜单；
- Explorer 展开、Guide Drawer、AI Drawer 不改变 Bottom Panel 的水平边界；
- `prefers-reduced-motion` 下取消 Drawer 与吸附动画；
- 所有 focus ring 在 100%–175% 下保持可见。

## 14. 分阶段实施步骤

### 阶段 0：基线与回归夹具

实施：

- 同步最新 `origin/main` 并记录新 HEAD；
- 运行现有 typecheck、unit tests、课程校验和两套 smoke；
- 为 `mcu-workspace-model` 建立纯函数测试夹具；
- 为 Lab 与 Sandbox 建立最小 Workspace、Candidate、Build、CourseProgress fixture；
- 不修改 Main 状态机。

完成条件：基线命令全部通过，fixture 能表达成功、失败、stale 和其他工作区后台任务。

回滚边界：只有测试与 fixture，没有产品行为变化。

### 阶段 1：持久布局骨架

实施：

- 把 `McuWorkbench` 改为 Development Area + Lab Guide 外层 Grid；
- 保留 `StudentCodeEditor` 内部 Explorer + Editor Grid；
- 课程实验渲染占位 Guide，Sandbox 不渲染；
- 保留旧 Build/AI 组件为隐藏迁移路径，不删除 Tool Rail 状态；
- 建立新的 Guide/Explorer 宽度和响应式容器规则。
- 在 Workspace 页面生命周期之上建立按 `workspaceId + projectPath` 分区的 Monaco session view-state registry；

完成条件：Lab 显示三列、Sandbox 显示两列，文件切换正常；Workspace → Lesson → 同一 Workspace 往返后恢复当前文件、cursor、selection 与 scroll；Guide 宽度变化不影响 Explorer 高度。

回滚边界：可以恢复旧 McuWorkbench render，不涉及 Main/IPC。

### 阶段 2：Code Surface 与 Bottom Panel 骨架

实施：

- 将 `.student-editor-main` 拆为 Action Bar、Editor Stage、Panel；
- Monaco host 常驻 Editor Stage，DiffReview 仅作为可见覆盖层，增加实例/model/view-state 不重建测试；
- 新增 Panel reducer、状态条、三个 Tab、resize 和 localStorage；
- 先使用现有快照只读展示，不删除旧 Build Tool；
- 调整 Diff layer 只占 Editor Stage；
- 使用现有 semantic token 实现构建信号带，不改变浅色 Monaco 主题。

完成条件：Panel 展开/收起/resize 只改变 Monaco 高度，Explorer 和 Guide 全高不变；打开/关闭 Diff 前后 Monaco editor 与 model identity 不变，undo/view state 可继续使用。

回滚边界：旧 Build Tool 仍可作为数据对照。

### 阶段 3：Candidate 接入

实施：

- 把 Candidate diagnostics、markers、Action Bar 状态接入 Problems；
- Candidate 失败自动打开 Problems 并定位第一条有效问题；
- 删除 StudentCodeEditor 的重复 compiler help card；
- 将 AI diagnostic 改为显式点击；
- Candidate 成功继续打开 Diff，Apply/Reject 不变。

完成条件：Manual 与 AI Candidate 的 Validate/Build/Problems/Diff/Apply 全流程通过，失败不会自动调用 AI。

回滚边界：Candidate API 和 Main metadata 未改，可恢复旧展示。

### 阶段 4：Firmware、Output 与 Flash 接入

实施：

- 增加可选 `stage/diagnostics`；
- Main 生成脱敏结构化 Firmware diagnostics；
- Build Tab 接入 progress、artifacts、size、proof、stale；
- Output 接入只读日志；
- Flash/WCH-Link/USB 状态和动作迁入 Build Tab；
- 加入其他工作区后台 Build 归属显示。

完成条件：Build start/progress/complete/failed/cancelled/stale、Output、Flash 和导航守卫回归通过。

回滚边界：字段可选、channel 不变，旧 Renderer 可忽略新字段。

### 阶段 5：Floating AI

实施：

- 新增浮动按钮、几何函数、吸附、持久化和 unread；
- 用 ChatPanel 构建贴边 Window/Drawer；
- 统一普通、Step、selection、diagnostic、lecture 的外壳打开入口；
- 建立 Workspace Assistant 与 Course Lecture Q&A 两个独立 history adapter 和明确的 domain 切换；
- 修正 running 与 event history 的 workspace scope；
- 更新 ChatPanel 旧文案。

完成条件：关闭不取消、后台回答保留；Workspace 入口只读取 `listAgentHistory(workspaceId)`，Lecture 入口只读取 `listCourseLectureHistory(courseId, lessonId)`，两组历史不拼接；按钮不会停在代码中央或超出 Workspace。

回滚边界：Agent Main 与 API 不变，可临时恢复旧 Assistant Tool 展示。

### 阶段 6：Lab Guide 与 Lecture Reference

实施：

- 迁移 Current Step、Overview、Question、Observation；
- 迁移 Lecture Reference、选文问答和 codeTarget；
- 接入 Firmware stale 与 CourseProgress；
- “问 AI 这一步”使用预填而非自动发送；
- 完成 Guide 子视图和持久化。

完成条件：Current Step 默认常驻，Overview/Reference 返回后状态恢复，CourseProgress 与 LessonLearningProgress 无串写。

回滚边界：CourseProgress/Main API 不变，旧 McuCourseTool 仍保留到本阶段验收完成。

### 阶段 7：作用域、响应式与可访问性

实施：

- 修复 Build/Candidate/Agent/CourseProgress 的 workspace scope；
- 完成四档容器响应式；
- 完成键盘 resize、focus 恢复、Escape、reduced motion；
- 校正所有 localStorage 非法值和窗口 resize；
- 保证 Dialog z-index 高于 AI。

完成条件：自动作用域测试通过；项目所有者完成人工尺寸/缩放交互验收。

回滚边界：响应式 CSS 与纯 UI state 可独立回滚，不影响可信任务。

### 阶段 8：清理旧架构

仅在阶段 1–7 全部完成后：

- 删除 Tool Rail DOM、`activeTool`、`toolPanelOpen` 和旧 localStorage；
- 删除 `McuBuildRunTool`、`McuCourseTool` 与重复 CSS；
- 删除 StudentCodeEditor 的重复 diagnostics UI；
- 删除指向“右侧构建与运行”的旧文案；
- 更新相关架构文档和实施记录。

完成条件：源码中不再存在 `activeTool = course | run | assistant` 产品状态；新工作流没有依赖隐藏 fallback。

回滚边界：本阶段前保留最后一个可工作的迁移提交；清理提交自身必须可独立 revert。

## 15. 自动测试方案

### 15.1 纯 Renderer 模型

为 `mcu-workspace-model.ts` 覆盖：

- Bottom Panel 默认、restore、非法 restore；
- Candidate/Firmware 自动 Tab 行为；
- 用户收起不改变 Build state；
- 高度 min/max 与 resize 后重新钳制；
- Candidate/Firmware/Linker/Safety problem 聚合与排序；
- proof 四项 identity 的 current/stale；
- 其他 workspace Build/Agent 不驱动当前 UI；
- Floating AI clamp、6px click/drag、left/right snap、resize 恢复；
- Assistant intent 到 Workspace/Lecture domain 的路由和历史 selector 隔离；
- localStorage 版本与损坏值回退；
- Lab Guide current/overview/reference 恢复。

### 15.2 组件行为

使用 jsdom 与 React `act`，不依赖截图：

- Lab 渲染 Explorer + Code Surface + Guide；
- Sandbox 不渲染 Guide；
- Bottom Panel DOM 位于 `.student-editor-main`，不位于 Workbench 根底部；
- Candidate 失败打开 Problems，点击问题调用文件定位；
- Build 开始/失败/成功切换正确 Tab；
- 打开/关闭 Diff 时 Monaco editor/model identity 不变，原 undo 与 view state 可继续使用；
- Workspace → Lesson → 同一 Workspace 往返后恢复当前文件、cursor、selection、scroll；
- AI close 不调用 cancel；
- Step action 只预填不发送；
- selection/diagnostic 打开同一 Floating AI 的 Workspace domain；
- Lecture answer 打开同一 Floating AI 的 Course Lecture Q&A domain，两组事件数组不拼接；
- Question/Observation 只调用对应 CourseProgress update；
- Lecture Reference 不写 LessonLearningProgress。

### 15.3 Main 与共享类型

- Firmware stage 按 preparing/compiling/linking/packaging 变化；
- GCC error 解析文件、行、列和 severity；
- linker error 生成无路径诊断；
- 真实磁盘路径完全脱敏；
- 缓存构建兼容缺少新字段的旧 proof；
- Build cancel、单 active Build、artifact identity 不变；
- `listAgentHistory(workspaceId)` 与 `listCourseLectureHistory(courseId, lessonId)` 继续使用独立存储；
- Course Lecture history 的 `contentVersion + documentDigest` 过滤和旧版本查看行为不变；
- Candidate、CourseProgress、Agent prompt、Lecture 和 WCH-Link 现有测试全量回归。

### 15.4 默认回归命令

```text
npm run typecheck
npm test
npm run courses:validate
npm run smoke:electron:mcu
npm run smoke:electron:fun
```

不运行 Windows 安装包构建，除非另有发布任务明确要求。

## 16. 项目所有者人工验收

以下项目不由自动工具代替，由项目所有者人工完成。

### 16.1 尺寸与缩放

至少覆盖：

```text
1920×1080 · 100% / 125% / 150% / 175%
1366×768  · 100% / 125% / 150% / 175%
当前最小窗口 · 100% / 125% / 150% / 175%
```

检查：

- Monaco 实际可编辑面积；
- 打开/关闭 Diff 后 cursor、selection、scroll、undo 和当前 Monaco model 不丢失；
- Workspace → Lesson → 同一 Workspace 往返后恢复当前文件和运行期 Monaco view state；
- Explorer 文件树与展开 Drawer；
- Guide Current Step、Overview、Reference；
- Bottom Panel Tab、resize、收起条；
- AI button、吸附、Window/Drawer；
- Dialog、急停、Flash 动作不被遮挡；
- focus ring、键盘操作与 reduced motion。

### 16.2 课程实验完整路径

```text
进入 Lab
→ Current Step 可见
→ 定位代码
→ 开始编写并自动保存
→ Candidate 失败
→ Problems 自动展开并定位
→ 主动让 AI 解释
→ 修正并重新检查
→ Diff
→ Apply
→ Firmware Build
→ Build/Output/Flash-RAM
→ Flash
→ 记录实际观察
→ Course Step 推进
```

确认每一步都没有隐藏合并保存、检查、Apply、Build 或 Flash。

### 16.3 AI

- 默认圆形按钮；
- click/drag 区分正确；
- 吸附和 resize 校正正确；
- 打开后代码与 Guide 不消失；
- Step 只预填；
- selection、Problems 进入 Workspace Assistant 历史；
- Lecture 进入同一浮窗的“课程知识问答”，且不会出现在 Workspace Assistant 历史；
- 在“课程知识问答”与“实验 AI”间切换后，两侧各自历史、草稿和滚动位置恢复；
- 关闭不取消；
- 后台完成显示 unread；
- AI 不自动回答 Question、填写 Observation、Apply 或 Flash。

### 16.4 Sandbox

- 只有 Explorer + Code Surface；
- Code Surface 扩展到右侧；
- Candidate、Diff、Bottom Panel、Build、Output、Flash、AI 与 Lab 共用相同实现；
- 不出现空 Lab Guide 或课程 Tool。

### 16.5 真实硬件

- 无有效 proof 不能 Flash；
- WCH-Link probe、写入、取消、失败和完成；
- USB 更新现有路径；
- Flash 期间离开 Workspace 被阻止；
- hardware-observation 只能由学生保存真实观察；
- UI 不声称未发生的硬件结果。

## 17. 完成定义

只有同时满足以下条件才可宣布重构完成：

1. Lab 与 Sandbox 共用同一 Code Surface；
2. Lab Guide 默认呈现 Current Step，且不再与 AI/Build 互斥；
3. Bottom Panel 只覆盖中央代码区域；
4. Candidate、Firmware、Output 和 Flash 全部接入新工作流；
5. Diff/Apply、安全权限和 proof 合同没有改变；
6. AI 是同一浮动外壳且关闭不取消；Workspace Assistant 与 Course Lecture Q&A 的历史、权限和作用域严格隔离；
7. 后台任务严格按 workspace scope 展示；
8. Tool Rail、`activeTool`、旧 Build/Course Tool 和重复 CSS 已删除；
9. 自动回归命令全部通过；
10. 项目所有者完成人工尺寸、交互和真实硬件复核；
11. 文档记录自动测试结果、人工待验项和硬件待验项。

最终学生路径应稳定成为：

```text
右边看当前任务
→ 中央写代码
→ 下方看编译和程序结果
→ 随时召唤 AI
→ 修正
→ 检查
→ 确认修改
→ 生成程序
→ 烧录
→ 观察
```

不再回到：

```text
实验任务 ↔ 构建与运行 ↔ AI 助教
```

## 18. 实施完成后的汇报模板

完成代码实施后必须汇报：

1. 最终 Workspace DOM 与信息架构；
2. Tool Rail、`activeTool` 和旧 localStorage 的删除情况；
3. Lab Guide Current/Overview/Reference 的实现；
4. Code Action Bar、常驻 Monaco/Diff Layer、Bottom Panel 的边界与运行期 view-state 恢复；
5. Problems/Build/Output 的数据来源；
6. Candidate Validate/Build/Diff/Apply 的接入；
7. Firmware stage、diagnostics、proof 与 stale 的接入；
8. Flash/WCH-Link/USB 与导航守卫；
9. Floating AI 的拖动、吸附、统一外壳，以及 Workspace/Lecture 双历史隔离；
10. workspace scope 修正；
11. Sandbox 复用；
12. 删除的旧组件、状态、CSS 和文案；
13. 保留的兼容路径；
14. 自动测试命令与结果；
15. 项目所有者仍需人工复核的界面项目；
16. 仍需真实硬件复核的项目。

## 19. 2026-08-10 实施记录

本次已经按照阶段顺序完成 Renderer 工作台重构与 Firmware Main 的向后兼容扩展：

- Lab 使用 Development Area + Lab Guide，Sandbox 复用同一 Development Area 且不渲染 Guide；
- Tool Rail、`activeTool`、旧工具区 localStorage 和 `McuBuildRunTool` 已删除；
- Code Surface 包含 Action Bar、常驻 Monaco/Diff Layer 和只压缩中央编辑区的 Bottom Panel；
- Candidate 失败进入 Problems，成功自动进入 Diff；失败不自动请求 AI；
- Firmware Snapshot 已增加可选 `stage` 与 `diagnostics`，现有 IPC/Preload 签名不变；
- Problems、Build、Output、Flash/WCH-Link/USB 已迁入 Bottom Panel；
- Floating AI 使用 52px 可拖动吸附按钮，并保留 Workspace Assistant 与 Course Lecture Q&A 两套独立历史；
- Lab Guide 已提供 Current、Overview、Reference 三个持久化子视图；
- Workspace → Lesson → Workspace 的运行期 Monaco view state 通过会话注册表恢复；
- Candidate、Build、Agent 与 CourseProgress 的当前页面消费已按 `workspaceId` 约束；
- 主题继续使用当前浅色 `robotdog-track` Monaco 和既有 semantic token，没有实施深色主题改版。

自动验证结果：

```text
npm run typecheck             PASS
npm test                      PASS · 34 files / 162 tests，另有 1 项既有条件测试跳过
npm run courses:validate      PASS · courses=1 lessons=3 lectures=2
npm run smoke:electron:mcu    PASS · firmwareState=completed / artifacts=elf,hex,bin,map
npm run smoke:electron:fun    PASS · firmwareState=completed / artifacts=elf,hex,bin,map
```

未运行安装包构建。

以下项目仍明确由项目所有者人工完成，不由本次自动工具替代：

- 1920×1080、1366×768、最小窗口与 100%–175% 缩放；
- Candidate、Diff、Apply、Build、Flash、AI、Question/Observation 和 Sandbox 的完整界面交互；
- WCH-Link、USB 下载、导航守卫和真实硬件观察。
