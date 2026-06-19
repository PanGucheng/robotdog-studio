# RobotDog Studio 执行计划

## 1. 项目目标与已确认决策

RobotDog Studio 是面向中小学机器马巡线教学与比赛的 Windows 11 桌面上位机。核心闭环为：学生提出需求，AI 生成受控修改，用户查看 Diff，系统编译并在安全确认后烧录，随后通过串口控制机器马并图形化展示 CCD、状态和日志。

已确认的产品决策：

- 产品名使用 **RobotDog Studio**。
- 上位机仓库与 CH32V203 固件仓库分开开发；本仓库交付下位机适配协议和模拟环境，不直接修改固件。
- 下位机最终把命令、状态、CCD 数据统一到一个串口；首版不实现双串口自动配对。
- 首个正式版本提供 Windows 11 x64 完整离线安装包。
- GCC 与 OpenOCD 均使用沁恒定制版本。当前已按完整版路线将 WCH GCC12 与 OpenOCD 集成到 `vendor/wch`，后续打包时作为离线资源随安装包分发；正式发布前补齐版本、来源、许可证和 SHA-256 清单。
- Git 提交按可独立验证的里程碑进行；可由 Codex 主动提交，但未经明确要求不推送远端。

当前固件现状需要特别记录：工程使用 MounRiver/Eclipse `.cproject`，没有 Makefile 或 CMake 命令行入口；动作和命令主要位于 `User/main.c`；命令应答走 USART3，而 `printf`、状态和 CCD 默认走 USART1。上位机当前通过固件工程已有的 `build/obj/compile_commands.json` 和内置 WCH GCC12 完成无硬件命令行编译；长期仍建议下位机提供稳定 CMake/Make 构建入口。

## 2. 最终技术栈

- Electron、React、TypeScript、Vite，使用 `electron-vite` 管理 Main、Preload 和 Renderer。
- pnpm 管理依赖并提交锁文件。
- Tailwind CSS + shadcn/ui/Radix UI 构建界面。
- Zustand 管理应用状态，Zod 校验 IPC 请求、响应和配置。
- `serialport` 访问串口，ECharts 显示 CCD，xterm.js 显示日志，Monaco Diff Editor 显示代码修改。
- Vitest 负责单元和服务集成测试，Playwright Electron 负责端到端测试。
- electron-builder + NSIS 生成离线安装包。

选择 React 而不是 Vue，原因是 Monaco、xterm、ECharts、Electron 工具链以及 AI 对话组件在 React 生态中的组合成本更低，更适合后期扩展教学平台。

## 3. 工程结构

```text
RobotDog_Studio/
├─ package.json
├─ pnpm-lock.yaml
├─ electron-builder.yml
├─ electron.vite.config.ts
├─ src/
│  ├─ main/
│  │  ├─ ipc/
│  │  ├─ services/
│  │  ├─ adapters/
│  │  ├─ security/
│  │  └─ index.ts
│  ├─ preload/
│  │  └─ index.ts
│  ├─ renderer/
│  │  ├─ app/
│  │  ├─ features/
│  │  │  ├─ onboarding/
│  │  │  ├─ chat/
│  │  │  ├─ robot/
│  │  │  ├─ ccd/
│  │  │  ├─ firmware/
│  │  │  ├─ diff/
│  │  │  └─ settings/
│  │  ├─ components/
│  │  └─ stores/
│  └─ shared/
│     ├─ ipc/
│     ├─ schemas/
│     └─ types/
├─ resources/
│  ├─ board-profiles/
│  ├─ firmware-template/
│  └─ fonts/
├─ vendor/
│  └─ wch/
│     ├─ Toolchain/RISC-V Embedded GCC12/
│     └─ OpenOCD/OpenOCD/
├─ docs/
│  ├─ architecture.md
│  ├─ firmware-integration.md
│  ├─ serial-protocol-v1.md
│  └─ release.md
└─ tests/
   ├─ unit/
   ├─ integration/
   ├─ e2e/
   └─ hardware/
```

运行时学生工作区位于 `%LOCALAPPDATA%\RobotDogStudio\workspaces\<student-id>`，不写入只读安装目录。每个工作区初始化为本地 Git 仓库，用于恢复默认、AI 候选修改、检查点和回退。

## 4. Electron 进程与 IPC

Renderer 只负责界面；Main 持有串口、文件、进程、构建、烧录、工作区、安全策略和 Reasonix 生命周期；Preload 仅暴露经过验证的窄接口。启用 `contextIsolation`，关闭 `nodeIntegration`，不向 Renderer 暴露 `ipcRenderer`、文件系统、Shell 或任意命令执行能力。

主要请求接口：

- `app.health.get`
- `robot.ports.list/connect/disconnect`
- `robot.command.execute`
- `robot.ccd.capture/start/stop`
- `firmware.build/cancelBuild/flash`
- `agent.session.create/send/cancel`
- `agent.approval.resolve`
- `workspace.list/create/reset/getDiff/applyCandidate/revert`
- `settings.get/update/setApiKey/getApiKeyStatus`

主要事件接口：

- `robot.status/log/telemetry`
- `build.progress`
- `flash.progress`
- `agent.event`
- `operation.error`

Renderer 只传 `workspaceId`、`artifactId` 和联合类型命令，不传任意工程路径、可执行文件、OpenOCD 参数或 HEX 路径。共享类型至少包含 `RobotCommand`、`CcdFrame`、`OperationState`、`BuildArtifact`、`ServiceResult<T>` 和 `AgentEvent`。

## 5. 串口服务与下位机协议

串口服务使用单实例状态机：

```text
disconnected → scanning → connecting → handshaking → ready → error
```

- 默认 115200、8N1，记忆最后成功端口和 VID/PID。
- 普通命令串行等待应答；停止命令使用独立高优先级队列。
- 正确处理数据分片、粘包、噪声、超时、断线和重连。
- `LegacySerialAdapter` 兼容当前 `test`、`status`、`action ...`、`ccd ...` 文本命令。
- `RdsProtocolAdapter` 对接未来统一串口协议。
- 退出应用、断开串口和 Windows 休眠前尝试发送停止命令。
- CCD 更新限制为约 10–20 FPS，并使用有上限的日志环形缓存。

下位机统一协议使用带版本、序号和类型的 ASCII 行，例如：

```text
@RDS1 RES 42 OK action=walk
@RDS1 EVT STATUS state=idle action=none
@RDS1 DATA 43 CCD valid=1 center=70 threshold=120 pixels=...
```

`docs/serial-protocol-v1.md` 需要定义握手、能力查询、应答关联、CCD 128 点格式、异步状态、错误码和兼容策略。连接旧固件且无法取得 CCD 时，界面显示明确的固件能力提示，不伪造真实数据。

## 6. 编译服务

- 下位机开发者提供稳定的命令行构建入口、`robotdog.project.json`、输出文件约定和兼容版本号。
- 推荐下位机增加 CMake 工程；上位机使用沁恒 GCC 和固定 Ninja/CMake 版本完成构建。
- 开发模式优先使用 `vendor/wch` 的内置工具链；后续可在设置中加入外部工具链覆盖能力。
- 发布模式从 Electron `extraResources` 中的 `toolchains/wch` 使用固定工具链，不依赖系统 PATH。
- Main 使用可执行文件与参数数组启动进程，不通过 Shell 拼接命令。
- 构建目录固定为工作区 `.rds/build` 或 Studio 管理的 `.firmware-build/<project>/<timestamp>`，输出 ELF、HEX、BIN、MAP、size 信息和结构化 GCC diagnostics。
- 支持取消、清理、原始日志和面向学生的中文错误解释。
- 每个产物绑定源码树哈希；工作区变化后旧产物立即失效。

在下位机尚未交付命令行构建适配前，复用 `compile_commands.json` 驱动内置 GCC12 编译固定测试固件，不把 `.cproject` 解析器作为长期方案。

## 7. 烧录服务

- 使用只读 `board-profile.json` 定义沁恒 OpenOCD 可执行文件、WCH-Link 配置、目标芯片和允许参数。
- 开发模式优先使用 `vendor/wch/OpenOCD` 并运行版本、配置和探针检查。
- 发布模式从 Electron `extraResources` 中的 `toolchains/wch/OpenOCD` 启动固定版本，不使用系统同名程序。
- 固定流程为：检查产物 → 软件急停 → 安全确认 → 探测 WCH-Link → 烧录 → 校验 → 复位 → 串口重连。
- Renderer 不能修改 OpenOCD 命令和参数。
- 写入 Flash 进入关键阶段后禁用强制取消，避免中途终止损坏固件。
- 只允许烧录与当前工作区源码哈希匹配的产物。
- WCH-Link 驱动单独检测；确认许可后可附带官方离线安装包，否则提供本地安装包导入和安装指导。

## 8. Reasonix 集成

Reasonix 使用固定版本的 ACP stdio JSON-RPC 接口，不解析 `reasonix run` 的终端文本。

- Main 为活动工作区启动 `reasonix.exe acp` 子进程。
- 通过 ACP 管理会话、流式回复、审批、取消和崩溃恢复。
- DeepSeek API Key 使用 Electron `safeStorage`/Windows DPAPI 加密，只通过子进程环境变量注入，并从日志中脱敏。
- Reasonix 首版只允许读取和编辑候选工作区，禁用 Bash、烧录和原始串口工具。
- 每次 AI 请求在临时 Git worktree 中运行，结束后生成候选 Diff。
- 候选修改通过校验后可先编译；用户确认后再应用到正式工作区并创建本地快照提交。
- AI 运行期间正式工作区发生变化时不自动合并，标记冲突并重新生成。
- 后续 robot-dog MCP 仅暴露语义工具，硬件调用仍由 Main 的安全服务和界面审批控制。

## 9. 安全策略

- 学生模式只接受结构化命令，不开放原始串口输入、Shell 或路径选择。
- 运动命令默认获得 3 秒租约，超时由 Main 自动发送停止；协议文档同时要求固件实现独立动作看门狗。
- 软件急停始终可见，点击后取消运动队列并优先发送停止命令；界面注明它不能替代物理断电急停。
- 舵机限制 ID、角度、变化速率和单次变化幅度，危险变化需要教师确认。
- AI Diff 必须通过路径规范化、目录穿越、符号链接、二进制、文件体积和白名单检查。
- 教师模式通过本机 PIN 解锁；开发者模式才显示原始工具和诊断信息。
- API Key、学生信息和本机绝对路径不能进入普通日志或诊断导出。

## 10. UI 设计与组件拆分

主界面采用固定顶部状态区、中央双栏和固定底部控制栏：

```text
┌ 项目 / 学生 / 连接—观察—修改—编译—下载—测试 / 软件急停 ┐
├ AI 对话 42% ─────────┬ 工作台 Tabs 58% ──────────────┤
│ 提问、解释、审批卡片 │ 参数 / CCD / 日志 / Diff / 设置 │
├──────────────────────┴───────────────────────────────┤
└ 连接 检测 开始 停止 前后左右 站立 编译 下载 ─────────┘
```

视觉方向是“比赛维修站仪表台”，默认浅色，适合教室投影和比赛现场：

- 背景 `#F6F8FB`
- 主色 `#10243A`
- CCD/连接色 `#00A8C6`
- 提醒色 `#F3A712`
- 成功色 `#16A36A`
- 急停色 `#D92D20`

顶部“巡线闭环轨道”显示连接、观察、修改、编译、下载、测试六个节点的实时状态，作为产品的标志性视觉元素。急停独立固定在右上角。

主要页面与组件：首次启动向导、StudioShell、ChatPanel、ParameterPanel、CcdChart、LogConsole、DiffReview、WorkspaceManager 和 Settings。最低适配 1366×768；窗口过窄时右侧工作台可收起，但停止和急停不能隐藏。

## 11. MVP 开发顺序

### 阶段 0：工程底座

- 初始化 Electron/React、IPC 契约、错误模型、模拟串口和模拟工具进程。
- 编写架构、统一串口协议、构建产物和固件看门狗文档。
- 完成首次启动向导和 Studio 静态骨架。

### MVP 1：串口控制

- 串口扫描、连接、PONG 握手、动作控制、软件急停和日志。
- 兼容当前固件的 USART3 命令，CCD 先使用模拟数据。
- 验收：急停点击后 100ms 内写入停止命令；连续运动 3 秒后自动停止；断线不自动恢复运动。

### MVP 2：编译与无硬件下载预检

- 接入内置 WCH GCC12/OpenOCD、结构化构建诊断、产物管理、WCH-Link 探测预检和模拟下载流程。
- 在下位机交付正式构建接口前使用 `D:\RobotDog\ch32v203-robot-dog` 固定测试工程验证。
- 验收：无硬件、无 MounRiver 环境时，软件界面可以完成工具链检测、固件编译、产物展示和模拟下载；硬件回来后再完成真实校验烧录验收。

### MVP 3：Reasonix

- ACP 会话、流式对话、候选 worktree、Diff 审批、候选编译和快照提交。
- AI 默认使用中小学生能理解的中文解释。
- 验收：禁止文件修改被拦截；取消、Reasonix 崩溃和网络失败不污染正式工作区。

### MVP 4：教学模式与正式发布

- 学生、教师、开发者模式，本地 PIN，诊断导出和恢复默认。
- 完成安装包签名、第三方许可清单、干净机器测试和硬件回归。
- robot-dog MCP 在该阶段之后实现，不阻塞第一版核心闭环。

## 12. 测试与验收

- IPC：非法参数、目录穿越、符号链接逃逸和任意命令注入。
- 串口：分片、粘包、噪声、超时、重连、CCD 非法长度和急停抢占。
- 构建：成功、warning、错误、取消、空格路径和中文路径。
- 烧录：前置检查、校验失败、设备拔出和关键阶段禁止取消。
- Reasonix：模拟 ACP、审批、取消、崩溃、越权 Diff 和工作区冲突。
- E2E：首次启动、聊天、Diff、编译、下载的完整模拟流程。
- 真机：Windows 11 标准用户、完全离线、中文用户名、未安装开发工具的干净机器。

## 13. 打包发布与主要风险

- electron-builder 输出 `RobotDogStudio Setup.exe`，默认按用户安装。
- 应用代码进入 ASAR；`serialport` 原生模块、Reasonix、沁恒 GCC/OpenOCD、CMake/Ninja 和板卡配置放入 `extraResources`。
- 固定 Electron ABI，并在 Windows CI 中执行 native module rebuild 和安装后冒烟测试。
- 所有二进制记录版本、SHA-256、来源和许可证，正式发布期间禁止自动漂移。
- Windows 正式版进行代码签名和时间戳签名，降低 SmartScreen 拦截。
- 第一版不做静默自动更新，采用签名安装包覆盖升级，并保留学生工作区。

主要风险及处理方式：

- 固件没有命令行构建入口：以下位机 CMake/产物契约作为 MVP 2 真机接入门槛。
- 当前命令和 CCD 分属两路 UART：要求下位机统一单串口；首版不承担双口自动配对。
- 沁恒工具链安装路径和版本差异：先支持设置页探测本机路径，发布时固定用户提供的官方离线包。
- Reasonix 上游变化：固定版本，使用 ACP 适配层和协议契约测试。
- `serialport` 原生模块打包失败：固定 Electron 版本并在干净 Windows CI 中测试安装包。
- WCH-Link 驱动或工具链不可再分发：发布前完成许可确认；必要时支持从老师提供的官方离线安装包导入。
- OpenOCD 配置差异：每种板卡使用独立只读 board profile，不允许自由拼接参数。
- CCD 数据淹没界面：Main 限频、批量传输，Renderer 丢弃过期帧。
- 软件急停受串口和供电影响：固件必须实现动作看门狗，比赛设备仍应保留物理断电开关。
