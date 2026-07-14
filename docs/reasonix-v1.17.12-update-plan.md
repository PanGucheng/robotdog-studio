# Reasonix v1.17.12 升级计划

> 目标：评估并规划 RobotDog Studio 从当前固定的 Reasonix v1.9.1 升级到 Reasonix CLI v1.17.12。  
> 当前项目状态：`third_party/reasonix` 固定在 `desktop-v1.9.1` / `f944dfb7`，应用内置 `resources/tools/reasonix-v1.9.1`。  
> 推荐目标：Reasonix CLI `v1.17.12`，不是 Reasonix Desktop `desktop-v1.17.12`。  
> 当前日期：2026-07-14。

## 1. 结论

建议升级，但不要直接在 `main` 上替换。Reasonix 从 v1.9.1 到 v1.17.12 跨度较大，包含大量 ACP、权限、交付模式、会话、性能和 Windows 体验修复。对 RobotDog Studio 这种依赖 ACP 的受控 AI 修改闭环来说，升级有价值。

但升级必须走独立分支和完整验收，因为新版本的 ACP 协议新增了不少能力字段。它们看起来向后兼容，但不能假设所有交互都完全无差异。

推荐分支：

```text
codex/update-reasonix-v1.17.12
```

推荐目标包：

```text
Reasonix CLI v1.17.12
asset: reasonix-windows-amd64.zip
sha256: 65aad1d45002d3716756ec6e51786e6730517231acdcae2b821480cbcbe8d0d5
```

不要使用：

```text
Reasonix Desktop v1.17.12 / Reasonix-windows-amd64.zip
```

原因：Desktop 包中的 `Reasonix.exe` 是桌面应用入口，不适合作为 RobotDog Studio 内嵌的 ACP CLI runtime。实测 Desktop zip 执行 `--version` / `acp --help` 没有正常 CLI 输出；而 CLI release 的 `reasonix.exe` 可以正常输出 `reasonix v1.17.12` 和 `acp --help`。

## 2. 当前接入方式

RobotDog Studio 当前这样固定 Reasonix：

- 子模块：`third_party/reasonix`
- 内置二进制：`resources/tools/reasonix-v1.9.1/bin/reasonix.exe`
- Main 进程固定：
  - `reasonixVersion = 'v1.9.1'`
  - `binarySha256 = '6bb152f4bd6362ee441e6ed3f8917aa6350d646b3f7c0097bb0f5cf8ee66acf5'`
  - `binaryPath = resources/tools/reasonix-v1.9.1/bin/reasonix.exe`
- 打包脚本固定：
  - `resources/tools/reasonix-v1.9.1/bin`

当前 RobotDog Studio 只依赖 ACP 基础能力：

- `initialize`
- `session/list`
- `session/new`
- `session/resume`
- `session/prompt`
- `session/close`
- `session/cancel`
- `session/update`
- `session/request_permission`

应用本身仍负责：

- 候选工作区隔离；
- 路径白名单；
- Diff 校验；
- 编译预检；
- 应用修改事务；
- API Key 存储和脱敏。

这个安全边界升级后必须保持不变。

## 3. 已验证的新版本事实

已检查远端：

```text
Reasonix CLI v1.17.12
publishedAt: 2026-07-13T09:49:22Z
tag: v1.17.12
```

Windows CLI 包：

```text
reasonix-windows-amd64.zip
sha256: 65aad1d45002d3716756ec6e51786e6730517231acdcae2b821480cbcbe8d0d5
```

本机临时验证：

```powershell
reasonix.exe --version
# reasonix v1.17.12

reasonix.exe acp --help
# Usage of acp:
#   -model string
#   -profile string
#       runtime profile: economy | balanced | delivery
```

最小 ACP 验证通过：

- `initialize` 返回 `agentInfo.version = v1.17.12`
- `session/list` 返回空会话列表
- 无 stderr 错误

说明 v1.17.12 的基础 ACP server 能被当前 JSON-RPC 客户端启动和握手。

## 4. 值得利用的新能力

### 4.1 ACP runtime profile

v1.17.12 的 `reasonix.exe acp` 新增：

```text
-profile economy | balanced | delivery
```

建议接入方式：

| RobotDog Studio 场景 | 推荐 profile | 原因 |
|---|---|---|
| 解释选中代码、解释编译错误 | `economy` | 低成本、低风险，通常不需要复杂改动 |
| 普通 AI 修改学生代码 | `balanced` | 默认平衡模式，适合课堂常规修改 |
| 编译失败后让 AI 修复、复杂多步修改 | `delivery` | 更重视完成度和验证，适合较复杂任务 |

第一阶段可以先全部使用默认 `balanced`，只把 `profile` 作为配置项留好。第二阶段再根据任务类型动态选择。

需要改动：

- `ReasonixProcessManager.start(...)` 增加可选 `profile` 参数；
- 启动参数从：

```ts
['acp']
```

改为：

```ts
['acp', '-profile', profile]
```

验收：

- `economy/balanced/delivery` 都能启动；
- 错误 profile 被拒绝；
- UI 和日志能显示当前 profile。

### 4.2 ACP plan updates

新协议中出现 `plan` update，用于表达 agent 当前任务列表。

对 RobotDog Studio 很有价值，因为当前学生看到 AI 工作过程仍偏抽象。可以把 plan 映射成学生友好的步骤条，例如：

```text
1. 读取学生代码
2. 修改转弯强度
3. 检查 YAML 参数
4. 等待你确认
```

建议接入：

- 在 `ReasonixAcpAdapter` 中识别 `sessionUpdate === 'plan'`；
- 将 plan entry 转为现有 `activity` 或新增 `agent_plan` 事件；
- Renderer 显示为简短步骤，不显示过长技术文本；
- 状态只展示 `pending / in_progress / completed`。

收益：

- 小学生更容易理解 AI 正在做什么；
- 教师更容易判断 AI 是否跑偏；
- 可以减少“AI 一直在转圈”的焦虑。

### 4.3 tool call locations

新协议中 `tool_call` 增加 `locations`，可包含文件路径和行号。

对本项目很有用：

- AI 正在读/改哪个文件；
- 权限审批卡片可显示更具体位置；
- 后续可以点击跳转代码编辑器。

建议接入：

- `PermissionParams.toolCall` 增加 `locations?: Array<{ path?: string; line?: number }>`；
- 只显示允许范围内的相对路径；
- 不显示本机绝对路径；
- 对学生显示为：

```text
AI 想查看 Core/Src/student_control.c 第 18 行附近
```

安全边界：

- locations 仅用于显示，不能作为授权依据；
- 授权仍以 Main 侧白名单和 Diff 校验为准。

### 4.4 session modes

新协议里出现 session mode：

- `SessionModeState`
- `session/set_mode`
- `currentMode`

可能可以用于：

- 学生解释模式；
- 学生修改模式；
- 编译修复模式；
- 教师诊断模式。

但第一阶段不建议使用。原因：

- 需要确认 Reasonix 实际暴露哪些 mode；
- 需要看 mode 对权限和行为的影响；
- 当前 RobotDog Studio 已经通过提示词和候选策略实现模式边界。

建议第二阶段再评估。

### 4.5 client filesystem capabilities

新协议支持客户端提供：

- `fs/read_text_file`
- `fs/write_text_file`

这些能力可以让 agent 读取客户端未保存的编辑器缓冲区，理论上很强。

但 RobotDog Studio 第一阶段不要启用。

原因：

- 当前安全模型依赖“Reasonix 只在候选 worktree 里读写文件”；
- 引入 fs proxy 后，权限边界会更复杂；
- 学生代码编辑器已有 Main 侧保存/候选机制；
- 未保存缓冲区直接暴露给 AI 容易造成上下文和审批混乱。

结论：

```text
第一阶段不声明 clientCapabilities.fs
```

以后如果要接，也只能做 read-only，并且只允许学生白名单文件。

### 4.6 provider manager / setup

v1.17.12 改进了 `reasonix setup`，变成 provider manager。

RobotDog Studio 当前已经自己管理 DeepSeek API Key，并生成 `reasonix.toml`：

```toml
default_model = "deepseek-flash"
api_key_env = "DEEPSEEK_API_KEY"
```

因此第一阶段不需要把 `reasonix setup` 暴露给学生。

可考虑的后续用途：

- 教师诊断页；
- 高级设置页；
- 多模型 provider 管理。

学生默认界面不应出现 provider manager。

### 4.7 delivery / evidence hardening

v1.17.12 的 release 里有大量：

- delivery readiness；
- evidence classifier；
- sign-off verification；
- file-writing test-runner flags；
- streaming liveness；
- review protocol hardening。

这些对通用代码代理很重要。对 RobotDog Studio 的启发是：

- 复杂修复任务可以尝试 `delivery` profile；
- AI 修复编译错误时，可以让 Reasonix 更重视“验证后再结束”；
- 但最终判断仍必须由 RobotDog Studio 自己的编译、Diff、路径策略完成。

## 5. 不建议立刻接入的能力

第一阶段不要接：

1. Desktop 包和 Desktop UI；
2. Reasonix 自带 setup 界面；
3. ACP fs/write_text_file；
4. 外部 MCP；
5. 让 Reasonix 直接跑构建脚本；
6. 让 Reasonix 直接操作正式工作区；
7. 自动根据 Reasonix 的 delivery 判定跳过上位机审核。

一句话：Reasonix 可以更聪明，但不能更自由。

## 6. 升级实施步骤

### 阶段 A：准备升级分支

```powershell
git switch -c codex/update-reasonix-v1.17.12
```

检查当前状态：

```powershell
git status --short
git submodule status third_party/reasonix
```

### 阶段 B：更新子模块

推荐把子模块固定到 CLI tag：

```powershell
git -C third_party/reasonix fetch --tags origin
git -C third_party/reasonix checkout v1.17.12
git add third_party/reasonix
```

说明：

- 当前项目以前记录的是 `desktop-v1.9.1`；
- 新内嵌 runtime 应以 CLI release 为准；
- 如果后续需要对照 Desktop release，可在文档里记录 `desktop-v1.17.12`，但内嵌二进制不要取 Desktop 包。

### 阶段 C：替换内置二进制

下载：

```powershell
gh release download v1.17.12 `
  --repo esengine/DeepSeek-Reasonix `
  --pattern reasonix-windows-amd64.zip `
  --pattern SHA256SUMS `
  --dir resources/tools/reasonix-v1.17.12
```

解压：

```powershell
Expand-Archive resources/tools/reasonix-v1.17.12/reasonix-windows-amd64.zip `
  -DestinationPath resources/tools/reasonix-v1.17.12/bin
```

校验：

```powershell
Get-FileHash resources/tools/reasonix-v1.17.12/reasonix-windows-amd64.zip -Algorithm SHA256
resources/tools/reasonix-v1.17.12/bin/reasonix.exe --version
resources/tools/reasonix-v1.17.12/bin/reasonix.exe acp --help
```

预期：

```text
reasonix v1.17.12
```

### 阶段 D：更新 RobotDog Studio runtime 配置

修改：

- `src/main/index.ts`
  - `reasonixVersion = 'v1.17.12'`
  - `binarySha256 = <reasonix.exe sha256>`
  - `binaryPath = join(staticRoot, 'tools', 'reasonix-v1.17.12', 'bin', 'reasonix.exe')`

- `scripts/package-windows.mjs`
  - `resources/tools/reasonix-v1.17.12/bin`

- `README.md`
  - Reasonix v1.9.1 → v1.17.12

- `docs/ai-workspace-reasonix-plan.md`
  - 更新阶段 D 状态和固定版本说明

可选新增：

- `config/reasonix-runtime.json`
  - 将版本、路径和哈希从代码中抽出来，避免以后每次升级都改 `index.ts`。

### 阶段 E：兼容 ACP 新字段

最低要求：

- 当前适配器必须继续忽略未知 update；
- 不能因为 v1.17.12 返回 `modes`、`configOptions`、`agentCapabilities` 之类字段而失败。

建议增强：

1. `UpdateParams` 支持：

```ts
sessionUpdate: 'plan'
```

2. `PermissionParams.toolCall` 支持：

```ts
locations?: Array<{ path?: string; line?: number }>
```

3. `ReasonixProcessManager.start` 支持：

```ts
profile?: 'economy' | 'balanced' | 'delivery'
```

4. 默认 profile：

```text
balanced
```

5. 解释类任务后续可切 `economy`；
6. 编译修复任务后续可切 `delivery`。

第一阶段不声明：

```json
clientCapabilities.fs
```

### 阶段 F：测试

必须跑：

```powershell
npm run typecheck
npm test
npm run smoke:electron
```

必须人工验收：

1. 配置 DeepSeek API Key；
2. 新建学生工作区；
3. 连续两轮对话，确认上下文没有丢；
4. 让 AI 修改 `turn_strength`；
5. 查看审批卡片；
6. 查看 Markdown 输出；
7. 生成候选 Diff；
8. 运行学生代码预检；
9. 应用修改；
10. 故意写错 C 代码，让 AI 解释编译错误；
11. 取消一次运行中的 AI turn；
12. 重启应用，确认会话历史和候选状态可恢复。

建议额外测试：

```text
economy / balanced / delivery 三种 profile 启动是否正常
```

## 7. 回滚方案

升级失败时回滚：

1. `src/main/index.ts` 恢复 v1.9.1；
2. `scripts/package-windows.mjs` 恢复 v1.9.1；
3. 子模块恢复 `f944dfb7`；
4. 删除或保留未引用的 `resources/tools/reasonix-v1.17.12`；
5. 跑 `npm run smoke:electron`。

只要保留 v1.9.1 目录，回滚很简单。

## 8. 推荐的验收门槛

升级 PR 合并到 main 前必须满足：

- `reasonix.exe --version` 输出 `reasonix v1.17.12`；
- 内置 binary SHA-256 校验通过；
- `npm run typecheck` 通过；
- `npm test` 通过；
- `npm run smoke:electron` 通过；
- 真实 API Key 下至少完成一次 AI 修改闭环；
- 权限审批仍由 RobotDog Studio 接管；
- Reasonix 不能修改白名单外文件；
- 候选 Diff、编译预检和应用事务仍然工作；
- Windows 打包脚本引用新 runtime。

## 9. 是否值得现在做

建议排序：

1. 当前固件动态基线接入已经完成，Reasonix 升级可以作为下一项独立任务。
2. 如果接下来要继续打磨 AI 对话体验、上下文、审批、编译错误解释，建议尽快升级到 v1.17.12。
3. 如果近期重点是蓝牙/WCH-Link/固件烧录，则可以先保持 v1.9.1，等硬件通道稳定后升级。

我的建议：现在可以做，但必须单独分支，不要夹在固件接入或 UI 大改里一起做。

## 10. 后续可转化为 Issue 的任务

建议在 GitHub 中建立：

```text
[AI] Upgrade embedded Reasonix CLI to v1.17.12
[AI] Surface Reasonix plan updates in student-friendly UI
[AI] Add Reasonix runtime profile selection
[AI] Show ACP tool locations in permission/activity cards
```

这些任务可以拆开做，先升级 runtime，再逐步吃新能力。
