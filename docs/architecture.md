# RoboHorse Studio 系统架构设计

更新日期：2026-09-27  
当前状态：系统架构权威事实来源（Source of Truth）

---

## 1. 系统总体定位

**RoboHorse Studio** 是一套面向机器人与嵌入式单片机教学的桌面端集成环境（IDE / 上位机）。系统围绕“**真实硬件实验 + 受控代码编辑 + 本地隔离 AI 助教 + 硬件在线烧录调试**”构建闭环。

### 品牌展示与内部兼容标识

- **用户可见品牌（UI & 展示）**：统一为 **RoboHorse Studio**（趣味巡线版、CH32 单片机入门版、TI MSPM0 教学版）。
- **内部兼容标识（保留兼容性）**：历史工程名称、`appId`、安装包内部文件名（`RobotDogStudio-*`）、本地用户数据目录（`%LOCALAPPDATA%\RobotDogStudio` / `%APPDATA%\robotdog-studio`）、工作区管理标记（`.robotdog-managed`）、IPC 通道前缀、localStorage 键以及串口协议前缀（`@RDS1`）均作为跨版本兼容性契约完整保留，不进行破坏性替换。

---

## 2. 进程架构与职责边界

系统严格遵循 Electron 多进程安全架构：

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│                           Renderer 进程 (UI 视图层)                          │
│  React 19 + TypeScript + Vite + Tailwind CSS + Monaco Editor + Lucide 图标   │
│  - 纯前端展示与用户交互，不持有 Node.js 运行时或原生操作系统权限             │
│  - 状态管理：Zustand Store                                                 │
│  - 代码编辑：Monaco Editor (C 语言高亮、诊断展示、受控只读控制)              │
│  - 讲义渲染：受控 Lecture Markdown 渲染器 (Safe AST，无任意 HTML 执行)       │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │ 仅通过经过校验的 API 暴露
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           Preload 进程 (安全桥接层)                          │
│  contextBridge.exposeInMainWorld('api', { ... })                            │
│  - 启用 contextIsolation，关闭 nodeIntegration                              │
│  - 严格限定暴露的 RPC 方法，禁止暴露 ipcRenderer、child_process 或 fs 实例  │
│  - 前端发起所有调用均经过白名单 IPC Channel                                 │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │ 双向 IPC (invoke / handle / send)
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                            Main 进程 (核心服务层)                            │
│  Node.js 运行时 + 操作系统底层集成                                          │
│  - 权限控制与安全审计 (ReasonixPermissionPolicy, WorkspaceSecurity)         │
│  - 工作区与 Git 事务管理 (WorkspaceService, CandidateService)               │
│  - 课程体系与讲义解析 (CourseService, CourseLectureParser, CourseResolver)    │
│  - 远程课程热更新 (CourseUpdateService)                                      │
│  - 固件基线与交叉编译 (FirmwareBaselineResolver, FirmwareBuildService)       │
│  - 硬件通信与下载 (SerialPort, WchLinkFlashService, TiOpenOcdService)        │
│  - AI 助教与本地模型接入 (AgentSessionService, ReasonixProcessManager)       │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. 三大教学发行版体系 (Editions)

同一套代码库构建并维护三个相互独立的发行版，在构建或启动时由 `ROBOTDOG_EDITION` 环境变量决定：

| 维度 | 趣味巡线版 (`fun-line-following`) | 单片机入门版 (`mcu-foundations`) | TI MSPM0 教学版 (`ti-mspm0-foundations`) |
| --- | --- | --- | --- |
| **目标用户** | 中小学、零基础学习者 | 电子、自动化专业大学低年级学生 | 现代 ARM Cortex-M0+ 体系课程 |
| **目标硬件** | CH32V203 四足机器马 | CH32V203 教学开发板 / 机器马 | TI LP-MSPM0G3507 开发板 |
| **主要工具链** | 内置 WCH GCC12 + OpenOCD | 内置 WCH GCC12 + OpenOCD | 托管 MSPM0 SDK + SysConfig + Arm GCC + OpenOCD |
| **学习载体** | 动作与简单参数、CCD 巡线图谱 | 裸机 C 实验、模块化驱动、课次练习 | 芯片图形化配置（SysConfig）、外设寄存器与 HAL |
| **工作区模式** | 趣味巡线工作区 | 结构化课次练习 + 自由沙盒 | TI 实验练习工程 |
| **数据隔离** | 独立用户数据与设置目录 | 独立用户数据与设置目录 | 独立用户数据与设置目录 |

---

## 4. 工作区模型与身份契约 (Workspace Identity)

每个工程工作区存储在用户数据根目录（`%LOCALAPPDATA%\RobotDogStudio\workspaces\<id>`），是一个由系统管理的独立 Git 仓库。

工作区元数据遵循 **Schema v4** 规范：
- `workspaceId`：唯一标识；
- `learningPath`：绑定的教学路径（`fun-line-following` / `mcu-foundations` / `ti-mspm0-foundations`）；
- `platform`：目标芯片平台（`ch32v203` 或 `ti-mspm0`）；
- `target`：具体芯片型号（如 `ch32v203c8t6`、`mspm0g3507`）；
- `toolchainProfile`：工具链画像标识；
- `firmwareBaselineId`：绑定的固件基线版本；
- `lessonId` / `attemptIndex`：（针对课程练习）记录课次关联与当前尝试次数。

Main 进程根据上述元数据强制校验执行权限，严禁将 TI 工具链作用于 CH32 工程，或在单片机版中加载巡线模式。

---

## 5. Main 进程核心服务架构

### 5.1 工作区与候选变更服务 (`CandidateService`)
为了保证学生项目安全，系统采用 **Git Worktree 隔离机制**：
- 正式工作区保留学生已提交的代码和稳定版本；
- 学生在草稿编辑或 AI 生成修改时，变更在隔离的临时候选目录中进行；
- 必须经过静态文件类型过滤、大小校验、路径穿越检查、C 语言语法编译后，生成 Monaco Diff；
- 只有学生点击“应用修改”后，变更才会被原子合并入工作区主分支并生成 Git 检查点，支持一键无损撤销。

### 5.2 固件基线分流器 (`FirmwareBaselineResolver`)
系统通过统一的接口解析不同工作区所依赖的底层代码与库文件：
- **`ch32v203-rhs-baseline`**：轻量教学基线，外设显式声明（Opt-in），用于单片机分步实验；
- **`ch32v203-pony-v25`**：包含舵机步态逆解、CCD 驱动与 RDS1 通信的全功能小马固件；
- **`ti-mspm0g3507`**：包含 TI DriverLib 与板级初始化的标准固件骨架。

### 5.3 课程体系与讲义解析器
- **`CourseService`**：加载课程与课次 Manifest，驱动课次目标、步骤流与完成条件判定；
- **`CourseLectureParser`**：负责将 Lecture Markdown 解析为受控 AST（严格限制标题 ID、过滤危险标签与未知语法，确保讲义安全可预测）；
- **`LessonLearningProgressStore`**：基于内容版本与 Section ID 持久化讲义阅读状态，与学生实验操作进度解耦。

### 5.4 远程课程更新服务 (`CourseUpdateService`)
- 客户端通过 HTTPS 轮询或手动检查远程 Gitee 仓库的 `update.json`；
- 支持多发行版按版本号增量拉取；
- 在用户数据目录中建立安全更新缓存（`current/`、`backup/`、`temp/`），解压后先执行合法性与发行版特征检测，采用原子目录交换并在异常时自动回滚。

### 5.5 AI 助教与安全沙箱 (`ReasonixProcessManager` & `AgentSessionService`)
- 内置针对代码生成的轻量模型运行时 Reasonix；
- **严格权限策略**：AI 仅允许修改课次 Manifest 中 `editableGlobs` 声明的白名单文件（如 `experiment.c`），禁止触碰启动汇编、链接脚本、Bootloader 或系统敏感路径；
- **只读工程注入**：讲义与基线头文件以只读上下文形式提供给 AI，确保回答贴合具体课程场景。

---

## 6. Shared 共享层架构

`src/shared/` 包含 Main、Preload 与 Renderer 共同遵守的类型定义与通信契约：
- **`types.ts`**：工作区、课程状态、编译结果、Diff 审查、设备连接与串口协议数据模型；
- **`ipc-channels.ts`**：强类型枚举的 IPC 频道映射；
- **`schemas/`**：基于 Zod 的 Manifest 校验模式与网络更新校验规则。
该层不依赖 Node.js 原生 API，也不依赖浏览器 DOM，保证在前后端双向引用时保持一致。
