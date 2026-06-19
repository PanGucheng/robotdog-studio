# RobotDog Studio AI 安全修改闭环详细计划

## 1. 目标与边界

本阶段实现 RobotDog Studio 的核心教学闭环：

```text
学生提出需求
  → 创建隔离候选工作区
  → Reasonix 阅读并修改受控文件
  → Main 校验 Diff
  → 学生查看中文解释和代码变化
  → 候选代码编译
  → 学生确认应用
  → 正式工作区生成 Git 快照
  → 可以一键撤销
```

本阶段完全不依赖真实蓝牙、串口、IAP 或 WCH-Link。硬件操作继续使用现有模拟服务；AI 不获得烧录、串口、原始 Shell 或任意文件系统权限。

完成标准不是“能调用一次 AI”，而是 AI 失败、取消、越权、崩溃、网络断开或修改冲突时，正式学生工程始终保持可用且可恢复。

### 本阶段包含

- 学生工作区创建、打开、归档、恢复默认和历史快照。
- Git 仓库与临时 worktree 生命周期管理。
- 受控候选修改、Diff 解析、策略校验和中文解释。
- 候选代码编译、产物源码哈希绑定和应用前复核。
- Reasonix ACP 进程、会话、流式事件、权限和取消。
- DeepSeek API Key 安全存储与注入。
- AI 对话、Diff 审批、候选编译、应用和撤销界面。
- 模拟 ACP、真实 Reasonix 和异常恢复测试。

### 本阶段不包含

- AI 直接发送串口命令、烧录固件或调用 WCH-Link。
- robot-dog MCP 硬件工具。
- 多人云端协作、账号系统或云端工作区。
- 完整 IDE、自由终端或任意工程导入。
- 自动合并正式工作区中的并发修改。

## 2. 已确认的 Reasonix 接入基线

Reasonix 当前默认分支是 Go 重写的 1.x 主线，可作为 Windows 单文件二进制分发。RobotDog Studio 使用 `reasonix.exe acp`，不解析 TUI，也不依赖 `reasonix run` 的终端文本。

ACP 接入采用协议版本 1、stdio NDJSON JSON-RPC 2.0，首版需要支持：

- `initialize`
- `session/new`
- `session/load`
- `session/resume`
- `session/prompt`
- `session/cancel`
- `session/close`
- `session/update` 通知
- `session/request_permission` 往返
- 会话模型和配置选项读取

Reasonix 版本必须固定，不允许安装时自动获取“最新版”。仓库记录：

- Reasonix 版本号和 Git/Release 来源；
- `reasonix.exe` SHA-256；
- ACP 协议契约测试快照；
- MIT 许可证和第三方声明；
- 受支持配置模板版本。

升级 Reasonix 时先在独立分支运行 ACP 契约测试，再更新哈希和安装包。RobotDog Studio 自身只依赖 `ReasonixAdapter` 领域接口，避免上游字段变化扩散到 Renderer。

重要安全前提：不能把 Reasonix 自带权限或 Windows 平台沙箱视为唯一防线。即使上游允许某次编辑，候选结果仍必须经过 Main 的路径、文件类型、体积和 Diff 策略校验；Reasonix 只在临时 worktree 中运行。

参考：

- [Reasonix 当前主线 README](https://github.com/esengine/DeepSeek-Reasonix/blob/main-v2/README.md)
- [Reasonix ACP 命令实现](https://github.com/esengine/DeepSeek-Reasonix/blob/main-v2/internal/cli/acp.go)
- [Reasonix ACP v1 类型](https://github.com/esengine/DeepSeek-Reasonix/blob/main-v2/internal/acp/protocol.go)
- [Reasonix 权限、沙箱与 MCP 指南](https://github.com/esengine/DeepSeek-Reasonix/blob/main-v2/docs/GUIDE.md)

## 3. 学生工作区模型

### 3.1 存储位置

正式发布时使用：

```text
%LOCALAPPDATA%\RobotDogStudio\
├─ workspaces\
│  └─ <workspace-id>\
│     ├─ project\                 # 正式学生 Git 工作区
│     ├─ workspace.json           # 不含密钥的元数据
│     ├─ conversations\           # RobotDog Studio 会话索引
│     └─ diagnostics\             # 有上限的本地诊断
├─ candidates\
│  └─ <candidate-id>\             # 临时 Git worktree
├─ build-cache\                   # 按源码树哈希隔离
├─ templates\                     # 固件模板版本
└─ secure\                        # safeStorage 加密内容
```

开发模式允许用环境变量覆盖根目录，但 Main 必须把最终路径解析到固定开发根内。Renderer 永远不能提交绝对路径。

### 3.2 `workspace.json`

```json
{
  "schemaVersion": 1,
  "id": "ws_...",
  "name": "林同学 · 巡线基础训练",
  "studentDisplayName": "林同学",
  "templateId": "ch32v203-robotdog",
  "templateVersion": "2026.06",
  "createdAt": "...",
  "updatedAt": "...",
  "activeBranch": "main",
  "lastCheckpoint": "<git-sha>",
  "reasonixSessionId": "<opaque-id>",
  "policyProfile": "student-v1"
}
```

不存储 API Key、Reasonix 环境变量、真实姓名、串口号或本机工具链路径。

### 3.3 工作区状态

```text
creating → ready → candidate_active → applying → ready
               ↘ error / conflict / archived
```

同时只允许一个候选修改绑定到同一正式工作区。其他工作区可以存在，但首版只运行一个 Reasonix turn 和一个固件构建任务，避免课堂电脑资源争用。

### 3.4 初始化流程

1. Main 生成不可预测的 `workspaceId`。
2. 从只读版本化模板复制到临时目录。
3. 拒绝模板中的符号链接、junction、超大文件和未知设备文件。
4. 写入固定的 `robotdog.project.json`、`reasonix.toml` 和 `AGENTS.md`。
5. 初始化本地 Git 仓库，分支固定为 `main`。
6. 提交 `chore: initialize student workspace`。
7. 原子重命名到正式工作区目录。
8. 写入 `workspace.json`，向 Renderer 返回安全摘要。

中途失败时删除临时目录，不留下半初始化工作区。

## 4. Git 与候选 worktree 生命周期

### 4.1 创建候选

每次 AI 请求都创建新的候选 ID 和临时 worktree：

```text
ready
  → 确认正式工作区无未登记修改
  → 记录 baseCommit、模板版本和策略版本
  → git worktree add --detach <candidate-path> <baseCommit>
  → 写入候选元数据
  → Reasonix session/new 或 session/resume，cwd 指向 candidate-path
```

候选元数据至少包含：

- `candidateId`
- `workspaceId`
- `baseCommit`
- `baseTreeHash`
- `policyVersion`
- `reasonixSessionId`
- `createdAt`、`expiresAt`
- `state`
- 最终 Diff 哈希
- 候选构建 ID 和结果

### 4.2 候选状态机

```text
preparing
  → agent_running
  → validating
  → review_ready
  → building
  → build_passed
  → awaiting_apply
  → applying
  → applied

任意非关键阶段可进入：cancelled / rejected / failed / stale / conflict
```

### 4.3 Reasonix turn 结束后

1. 等待 ACP turn 完成，不相信模型文字中的“已经修改”。
2. 使用 Git 获取实际状态和 Diff。
3. 删除未跟踪的构建缓存和 Reasonix 临时文件；不自动删除未知源码。
4. 执行 Diff 策略校验。
5. 计算候选源码树哈希。
6. 没有实际修改时标记 `no_changes`，保留 AI 解释但不提供应用按钮。
7. 校验通过后进入 `review_ready`。

### 4.4 应用候选

应用前重新检查：

- 正式工作区 HEAD 仍等于 `baseCommit`；
- 正式工作区干净；
- 候选 Diff 哈希未变化；
- 策略版本仍相同；
- 候选构建通过且源码树哈希匹配；
- 候选未过期。

随后由 Main 在候选 worktree 创建内部候选提交，再把经过验证的提交应用到正式 `main`。推荐使用受控 `git cherry-pick`，不允许 Reasonix 自行操作正式仓库。

正式提交信息：

```text
feat(student): soften line-following turns

Candidate: <candidate-id>
Base: <base-sha>
Build: <build-id>
Policy: student-v1
```

如果任何前置条件变化，不自动合并，候选进入 `stale` 或 `conflict`，提示学生重新生成。

### 4.5 拒绝、取消和清理

- 拒绝候选：记录摘要后移除 worktree 和临时分支。
- 取消 AI：先发 `session/cancel`，等待短超时，再终止 Reasonix 子进程；之后仍扫描候选目录并清理。
- 应用成功：保留元数据和 Diff 摘要，删除候选 worktree。
- 应用失败：正式仓库必须回到操作前 HEAD；不使用 `git reset --hard` 作为常规恢复手段，而用事务前检查、受控 abort 和临时备份引用。
- 启动时运行 orphan reconciler，清理崩溃遗留的 worktree 锁和过期候选。

## 5. 文件修改策略

### 5.1 策略来源

固件模板内置只读 `robotdog.project.json`：

```json
{
  "schemaVersion": 1,
  "allowedEditGlobs": [
    "User/student_config.h",
    "User/student_line_follow.c",
    "student_actions/*.yaml"
  ],
  "deniedGlobs": [
    "Startup/**",
    "Ld/**",
    "Peripheral/**",
    "Core/**",
    "Debug/**",
    "User/main.c",
    "User/app_hal.h"
  ],
  "maxChangedFiles": 12,
  "maxPatchBytes": 524288,
  "maxSingleFileBytes": 262144
}
```

正式白名单以固件模板最终结构为准。教师模式可以选择更宽策略，但不能复用学生会话中的候选。

### 5.2 Main 侧强制校验

每个改动文件必须通过：

- Windows 大小写不敏感的规范化路径检查；
- 相对路径和目录穿越检查；
- 符号链接、junction 和 reparse point 检查；
- 允许/禁止 glob 双重判断，禁止规则优先；
- 文件类型、MIME、NUL 字节和二进制检查；
- 单文件、总 Diff、文件数量和新增行上限；
- Git mode 变化、重命名、删除和子模块检查；
- 禁止修改 `.git`、`.reasonix`、配置策略和构建脚本；
- 禁止写入密钥、令牌、绝对用户路径或可执行文件。

学生模式首版允许修改文本内容，但不允许：

- 新增可执行文件；
- 修改文件权限；
- 创建符号链接；
- 删除受控核心文件；
- 修改链接脚本、启动代码、外设库、Bootloader 或上位机配置；
- 更改 Git 配置、hooks、attributes 或 ignore 规则。

### 5.3 语义检查

对白名单文件增加轻量规则：

- 参数必须位于板卡策略允许范围；
- 舵机角度、速度和持续时间不能突破安全上限；
- C 文件至少通过预处理/编译；
- YAML 必须通过 schema 校验；
- 禁止重新定义硬件寄存器地址和 Flash 操作；
- 禁止引入动态内存、递归或无界循环时给出警告或拒绝。

语义检查不替代编译；编译通过也不替代路径安全检查。

## 6. 服务拆分

Main 新增以下服务：

### `WorkspaceService`

- 创建、列出、读取、归档和恢复工作区。
- 维护 `workspace.json`。
- 保证路径始终位于工作区根目录。
- 不直接执行任意 Git 参数。

### `GitWorkspaceService`

- 封装固定 Git 子命令和参数数组。
- 创建仓库、检查状态、读取 Diff、创建 worktree、提交、应用候选和清理。
- 返回结构化结果，不把终端文本直接传给 Renderer。
- 每次写操作前后验证仓库根和 HEAD。

### `CandidateService`

- 管理候选状态机、元数据、过期和崩溃恢复。
- 协调 Reasonix、策略校验、候选构建和应用事务。
- 保证同一工作区同时只有一个活动候选。

### `PatchPolicyService`

- 解析 Git Diff 和文件状态。
- 执行路径、文件、体积、重命名、删除和语义策略。
- 生成学生可理解的违规说明。
- 输出不可变的 `PatchValidationReport`。

### `SourceFingerprintService`

- 计算受控源码树 SHA-256。
- 排除 `.git`、构建目录和明确的缓存文件。
- 为候选、构建产物和应用提交提供同一指纹算法。

### `ReasonixProcessManager`

- 定位并校验固定 `reasonix.exe`。
- 使用参数数组启动 `reasonix.exe acp`，关闭 Shell。
- 独占 stdin/stdout ACP 通道，stderr 进入脱敏诊断缓冲。
- 注入最小环境变量和 API Key。
- 负责启动超时、心跳、取消、退出和崩溃重启。

### `AcpClient`

- NDJSON JSON-RPC 编解码。
- 请求 ID、超时、取消和未决请求表。
- ACP initialize/session 生命周期。
- `session/update` 转换成稳定领域事件。
- `session/request_permission` 交给权限策略，不直接显示原始工具参数。

### `AgentSessionService`

- 把工作区会话映射到 Reasonix session ID。
- 每个 turn 创建新候选 worktree，并用 `session/resume` 重新绑定 cwd。
- 管理学生消息、流式回复、工具摘要和最终解释。
- Reasonix 版本变化时使旧会话进入只读历史，不盲目恢复。

### `SecretStore`

- 使用 Electron `safeStorage`/Windows DPAPI 加密 DeepSeek API Key。
- Renderer 只能查询 `configured: boolean`，不能读取明文。
- API Key 只在 Reasonix 子进程环境中短时注入。
- `safeStorage` 不可用时只允许当前会话临时使用，不落盘明文。

### `AuditLogService`

- 记录工作区、候选、策略、编译、应用、撤销和错误事件。
- 不记录 API Key、完整提示词、完整源码、学生真实身份或本机绝对路径。
- 日志滚动并有总容量上限。

## 7. ACP 生命周期

### 7.1 启动

```text
校验二进制 SHA-256
  → 启动 reasonix.exe acp
  → initialize(protocolVersion=1)
  → 检查 agentInfo/version/capabilities
  → 进入 ready
```

握手失败、协议版本错误或 stdout 出现非 JSON 行时，停止进程并显示“AI 服务无法启动”，不影响工作区、编译和机器马控制。

### 7.2 会话

- 首次对话：`session/new`，`cwd` 为当前候选绝对路径。
- 后续对话：优先 `session/resume`，用新候选 cwd 重绑定；若版本或状态不兼容则新建会话，并注入经过裁剪的上下文摘要。
- 应用启动恢复：`session/load` 可重放历史，但 UI 自己保存的消息索引仍是显示真相来源。
- 用户取消：`session/cancel`，超时后终止进程。
- 工作区关闭：`session/close`，清理候选和进程资源。

每次 prompt 前注入短系统上下文：当前教学任务、允许路径、禁止行为、base commit、已有参数范围和“只修改候选工作区”。不把 API Key、绝对安装路径或其他学生工作区内容放入提示词。

### 7.3 权限映射

权限默认行为：

| 请求 | 学生模式 |
|---|---|
| 读取候选工程 | 自动允许 |
| 搜索候选工程 | 自动允许 |
| 编辑白名单文件 | 路径预检后允许本次 |
| 编辑非白名单文件 | 自动拒绝 |
| Bash/Shell | 自动拒绝 |
| 网络工具/网页 | 自动拒绝 |
| MCP 插件 | 首版全部禁用 |
| Git 写操作 | 自动拒绝，统一由 Main 执行 |
| 记忆写入 | 自动拒绝 |
| 计划审批 | 转换为学生可理解的计划卡片 |

“允许本次”不等于可以绕过 turn 结束后的完整 Diff 校验。学生界面不显示“Bash”“JSON-RPC”等术语。

### 7.4 Reasonix 配置

每个候选使用 Studio 生成的只读模板配置，不运行交互式 `reasonix setup`：

- 固定默认模型和 API base URL；
- `api_key_env = "DEEPSEEK_API_KEY"`；
- 只启用必要的读取、搜索和编辑工具；
- 禁用 Bash、外部 MCP、自由网络和 YOLO；
- workspace root 指向候选 worktree；
- 固定中文解释风格和最大步骤数；
- 项目 `AGENTS.md` 明确学生文件边界和教学语气。

配置文件本身不在候选可修改白名单中。

## 8. IPC 与共享类型

### 8.1 请求接口

- `workspace.list`
- `workspace.create`
- `workspace.get`
- `workspace.archive`
- `workspace.resetPreview`
- `workspace.resetConfirm`
- `workspace.history`
- `workspace.revertPreview`
- `workspace.revertConfirm`
- `candidate.get`
- `candidate.getDiff`
- `candidate.build`
- `candidate.apply`
- `candidate.reject`
- `agent.health`
- `agent.session.ensure`
- `agent.prompt`
- `agent.cancel`
- `agent.plan.resolve`
- `settings.apiKey.status`
- `settings.apiKey.set`
- `settings.apiKey.clear`

Renderer 只传 `workspaceId`、`candidateId`、`message`、审批枚举和内部快照 ID。不能传路径、Git 参数、Reasonix 命令、模型 URL或环境变量。

### 8.2 事件接口

- `workspace.changed`
- `candidate.changed`
- `candidate.validation`
- `candidate.buildProgress`
- `agent.event`
- `agent.permissionSummary`
- `operation.error`

### 8.3 核心共享类型

```ts
type CandidateState =
  | 'preparing' | 'agent_running' | 'validating' | 'review_ready'
  | 'building' | 'build_passed' | 'awaiting_apply' | 'applying'
  | 'applied' | 'rejected' | 'cancelled' | 'failed' | 'stale' | 'conflict'

interface WorkspaceSummary {
  id: string
  name: string
  templateVersion: string
  headCommit: string
  activeCandidateId?: string
  updatedAt: string
}

interface CandidateSnapshot {
  id: string
  workspaceId: string
  state: CandidateState
  baseCommit: string
  sourceTreeHash?: string
  diffHash?: string
  validation?: PatchValidationReport
  build?: CandidateBuildSummary
  explanation?: StudentExplanation
  error?: OperationError
}
```

所有 IPC 输入用 Zod 判别联合类型校验；错误返回稳定代码，例如 `WORKSPACE_DIRTY`、`PATCH_DENIED`、`CANDIDATE_STALE`、`AGENT_CRASHED` 和 `BUILD_MISMATCH`。

## 9. 候选编译与产物绑定

候选编译使用现有 `FirmwareBuildService` 的受控入口，但构建根指向候选 worktree，输出到：

```text
build-cache\<workspace-id>\<candidate-id>\<source-tree-hash>\
```

编译前：

1. 再次执行 Diff 策略校验。
2. 计算源码树哈希。
3. 校验工具链版本和板卡 profile。
4. 清理候选工程中任何非 Studio 管理的构建输出。

产物记录：

- `candidateId`
- `baseCommit`
- `sourceTreeHash`
- `toolchainVersion`
- `boardProfileVersion`
- ELF/HEX/BIN/MAP 哈希
- warning/error 摘要
- 编译开始和完成时间

应用候选后重新计算正式工作区源码树哈希。只有它与候选构建完全一致时，候选产物才能继续用于模拟下载；否则产物失效并要求重新编译。

编译失败不会自动让 Reasonix无限循环修复。首版提供一次明确按钮“让 AI 根据编译错误再修改”，它会创建新候选或在当前候选的新 turn 中处理结构化诊断，并仍经过完整审批。

## 10. 撤销与恢复默认

### 10.1 撤销最近修改

- 显示将撤销的 Studio 快照提交和中文摘要。
- Main 创建反向提交，不重写公开历史。
- 若工作区有活动候选，必须先拒绝或完成候选。
- 撤销后之前的固件产物全部按源码哈希重新判定。

### 10.2 恢复默认

- 先展示文件变化数量、会丢失的快照范围和新工作区预览。
- 推荐创建新的默认工作区并归档旧工作区，而不是原地删除历史。
- 教师可以从归档恢复，学生默认看不到文件路径。

### 10.3 崩溃恢复

应用启动时检查：

- 正在应用但未完成的事务；
- Git cherry-pick/merge 状态；
- 孤立 worktree 和锁；
- 已退出 Reasonix 进程对应的活动候选；
- 无元数据的候选目录；
- 源码哈希与构建产物不一致。

恢复器只执行预定义动作，并把不确定状态标记为“需要教师检查”，不自动删除正式源码。

## 11. 界面与交互

### 11.1 AI 对话区

把当前静态 `ChatPanel` 改为真实会话：

- 学生消息；
- AI 流式中文解释；
- “正在阅读巡线参数”“正在准备修改”等语义状态；
- 计划卡片；
- 候选修改卡片；
- 编译错误解释卡片；
- 取消按钮和断线恢复提示。

不向学生展示模型推理原文、绝对路径、原始 JSON-RPC、完整工具参数或 API 错误栈。

### 11.2 Diff Review

新增真正的“代码修改”工作台：

- 默认显示文件列表、改动行数和中文摘要；
- 学生模式优先显示简化 Diff；
- 教师模式可以打开 Monaco inline/side-by-side Diff；
- 明确显示允许文件、警告和拒绝原因；
- 操作按钮保持固定：`拒绝修改`、`编译候选`、`应用修改`；
- 应用按钮只有在策略和构建均通过后可用。

### 11.3 工作区管理

- 顶部项目名称可以打开工作区选择器。
- 显示模板版本、最近修改时间和当前状态。
- 提供创建训练项目、查看历史、撤销和恢复默认。
- 学生模式不显示 Git SHA；教师模式可以显示短 SHA 和诊断。

### 11.4 闭环轨道

顶部六节点由真实状态驱动：

- 连接：模拟或真实设备状态；
- 观察：取得 CCD/参数快照；
- 修改：候选 Diff 通过策略；
- 编译：候选构建通过；
- 下载：固件产物与当前源码匹配；
- 测试：运行态验证完成。

AI 失败不能把后续节点误标为完成。

## 12. 分阶段实施

### 阶段 A：工作区与 Git 基础

状态：已于 2026-06-19 完成。已通过 23 项自动测试、生产构建、Electron 预加载烟雾测试及 1280×720 浏览器演示检查。

实现：

- `WorkspaceService`、`GitWorkspaceService`、元数据 schema；
- 模板复制、Git 初始化、工作区列表和快照历史；
- 开发根目录覆盖和路径边界；
- 临时目录失败回滚；
- 工作区选择器的模拟/真实数据切换。

验收：

- 中文学生名、空格路径和 Windows 长路径可工作；
- 创建失败不留下半成品；
- Renderer 无法提交路径或 Git 参数；
- 非 Studio Git 仓库不会被误操作。

建议提交：`feat: add managed student workspaces`

### 阶段 B：候选 worktree 与 Diff 策略

状态：已于 2026-06-19 完成。已通过 31 项自动测试、生产构建和 Electron 预加载烟雾测试；参数 YAML schema 将随正式固件参数范围确定后继续加固。

实现：

- `CandidateService`、worktree 创建和清理；
- `PatchPolicyService` 与 `robotdog.project.json`；
- 结构化 Diff、源码树哈希和候选状态机；
- 候选拒绝、过期和启动恢复。

验收：

- 允许文件正常通过；
- 路径穿越、junction、二进制、超大文件和禁止目录全部拒绝；
- 候选失败不改变正式工作区；
- 崩溃后能识别并安全清理孤立候选。

建议提交：`feat: isolate and validate AI candidate changes`

### 阶段 C：模拟 ACP 与会话 UI

状态：已于 2026-06-19 完成。已通过 35 项自动测试、生产构建、Electron 预加载烟雾测试，以及 1280×720 本地流式交互检查。

实现：

- `ReasonixAdapter` 接口和 `MockReasonixAdapter`；
- ACP 领域事件、流式回复、计划、权限和取消模拟；
- 动态 ChatPanel、候选卡片和错误状态；
- Reasonix 崩溃、超时和断流场景。

验收：

- 不安装 Reasonix 也能演示完整 AI 修改闭环；
- 取消后不会继续写候选；
- 重复事件、乱序事件和未知事件不会破坏 UI；
- 学生界面不暴露内部协议术语。

建议提交：`feat: add simulated agent review workflow`

### 阶段 D：真实 Reasonix ACP

状态（2026-06-19）：已完成。源码以 Git 子模块固定到 `v1.9.1`（`f944dfb7`），Windows x64 发布包和二进制 SHA-256 记录在 `config/reasonix-runtime.json`。应用已接入 ACP、候选目录权限策略、进程校验/脱敏/超时、safeStorage 密钥设置入口和 Mock 协议夹具；真实联网提示仍需用户配置自己的 DeepSeek API Key 后人工验收。

实现：

- 固定 Reasonix 1.x 二进制、哈希和配置模板；
- NDJSON JSON-RPC 客户端；
- initialize/new/resume/load/prompt/cancel/close；
- 权限策略、stderr 脱敏、进程超时和崩溃恢复；
- DeepSeek API Key safeStorage。

验收：

- ACP 契约 fixture 和固定 Reasonix 版本集成测试通过；
- 错误 API Key、断网、限流、进程崩溃均不污染正式工作区；
- Reasonix 不能修改白名单外文件，即使模型尝试；
- stdout 非协议内容会被检测并安全失败。

建议提交：`feat: integrate pinned Reasonix ACP runtime`

### 阶段 E：Diff、候选编译与应用

实现：

- 简化 Diff 与 Monaco Diff Review；
- 候选构建、结构化诊断和 AI 二次修复入口；
- 应用前复核、候选提交、正式提交和源码哈希绑定；
- 拒绝、撤销、恢复默认和历史界面。

验收：

- 未通过策略或编译时不能应用；
- 正式 HEAD 变化后候选自动 stale；
- 应用后正式源码树与候选构建哈希一致；
- 撤销生成新提交并正确使旧产物失效。

建议提交：`feat: complete reviewed AI change pipeline`

### 阶段 F：端到端与发布加固

实现：

- Electron E2E、Reasonix fixture 进程和故障注入；
- 首次启动 API Key 引导；
- 诊断导出、日志上限和隐私脱敏；
- Reasonix 许可证、版本和 SHA-256 清单；
- Windows 11 标准用户和离线非 AI 功能测试。

验收：

- 从创建工作区到 AI 修改、编译、应用、撤销的 E2E 通过；
- 应用强制退出后能恢复到确定状态；
- 未配置 API Key 时非 AI 功能完整可用；
- 安装目录只读、中文用户名和无开发工具环境可运行。

建议提交：`test: harden AI workspace end-to-end flow`

## 13. 测试矩阵

### 工作区与 Git

- 创建、重名、归档、模板升级和恢复默认；
- dirty workspace、detached HEAD、锁文件和损坏仓库；
- 空格、中文、大小写冲突和超长路径；
- 并发创建候选和应用冲突；
- worktree 崩溃遗留与 orphan cleanup。

### Diff 安全

- `../`、绝对路径、大小写绕过和 Unicode 混淆；
- symlink、junction、reparse point 和子模块；
- 二进制、NUL、大文件、海量文件和重命名逃逸；
- 修改 `.git`、策略、构建脚本和禁止目录；
- 删除、mode change、CRLF/LF 和文件编码。

### ACP

- 分片 NDJSON、多条粘连、无效 JSON 和超大行；
- 响应乱序、重复 ID、未知 ID 和请求超时；
- initialize 版本不兼容；
- session update、permission、cancel 和 close；
- stderr 洪水、stdout 污染、崩溃和无法退出；
- API Key 错误、网络超时、429 和上游 5xx。

### 候选闭环

- 无修改、合法修改、违规修改和混合修改；
- 编译成功、warning、失败、取消和超时；
- AI 二次修复；
- Review 期间正式 HEAD 变化；
- 应用成功、cherry-pick 冲突、撤销和产物失效。

### UI

- 流式消息、取消、重试和恢复；
- 学生简化 Diff 与教师详细 Diff；
- 1366×768、键盘操作、焦点和 reduced motion；
- 错误提示给出下一步，不显示密钥或绝对路径；
- 急停和机器马控制不因 AI 面板忙碌而不可用。

## 14. 主要风险与处理

### Reasonix 上游快速变化

固定二进制和 ACP fixture；所有调用通过适配层。升级不与产品自动更新绑定。

### Windows 平台隔离不足

首版禁用 Bash、外部 MCP 和自由网络工具；Reasonix 只写临时 worktree；Main 对最终 Diff 强制复核；正式仓库只由 Main 操作。

### Git worktree 在异常退出后锁定

维护候选元数据和启动 reconciler；使用 `git worktree list --porcelain` 对账；只清理 Studio 根目录内且可证明归属的 worktree。

### AI 修改能编译但行为危险

参数范围、动作安全和禁止硬件底层修改作为独立策略；后期真机测试仍需要安全确认和动作看门狗。

### 会话恢复引用旧候选路径

每个 turn 用 `session/resume` 重新提供 cwd 和 base 上下文；恢复失败则新建会话，不复用旧进程的隐式 cwd。

### API Key 泄露

只使用 safeStorage；日志统一脱敏；不写 `.env`、Reasonix 配置、Git、诊断包或 Renderer 状态。

### 候选编译与应用后源码不一致

统一源码树哈希算法；构建、候选和正式提交三方校验；不一致时强制重新编译。

## 15. 交付物与完成定义

本阶段最终应交付：

- 可管理的学生工作区和本地 Git 历史；
- 临时 worktree 候选系统；
- 可版本化的修改策略和完整安全测试；
- Mock/Real Reasonix ACP 适配器；
- safeStorage API Key 管理；
- 动态 AI 对话与 Diff Review；
- 候选编译、应用、撤销和恢复默认；
- Reasonix 版本、许可证和 SHA-256 清单；
- Windows 11 E2E 与异常恢复报告。

只有满足以下条件才标记 MVP 3 完成：

1. Reasonix 无法直接修改正式工作区。
2. 学生不能通过提示词突破文件白名单。
3. 未通过策略和编译的候选不能应用。
4. AI 取消、崩溃、断网和限流不会污染正式工程。
5. 应用后的源码与候选构建哈希一致。
6. 每次正式修改都有本地 Git 快照并可撤销。
7. API Key 不出现在 Renderer、日志、配置或 Git 中。
8. 无 Reasonix、无网络或无 API Key 时，现有非 AI 功能仍可使用。

## 16. 开始实施前需要固定的决策

以下决策不会阻塞阶段 A–C，可在阶段 D 前确定：

- 固定的 Reasonix 1.x 版本和 Windows x64 二进制来源；
- DeepSeek 默认模型与最大单次 token/费用限制；
- 正式固件模板的最终白名单路径；
- 学生参数的合法范围和 YAML schema；
- 教师 PIN 与策略升级方式；
- 会话历史保留周期和本地磁盘上限。

推荐立即从阶段 A 开始，不等待 Reasonix 二进制、API Key 或硬件信息。
