# RoboHorse Studio 系统架构设计

更新日期：2026-09-27  
当前状态：系统架构权威事实来源（基于实际源码核验）

---

## 1. 系统总体定位

**RoboHorse Studio** 是一套面向机器人与嵌入式单片机教学的桌面端集成环境（IDE / 上位机）。系统围绕“**真实硬件实验 + 受控代码编辑 + 本地隔离 AI 助教 + 硬件在线烧录调试**”构建闭环。

### 品牌展示与内部兼容标识

- **用户可见品牌（UI & 窗口展示）**：统一为 **RoboHorse Studio**（趣味巡线版、CH32 单片机入门版、TI MSPM0 教学版）。
- **内部技术标识与持久化兼容契约**：历史包名 `robotdog-studio`、可执行文件与安装器名 `RobotDogStudio-*`、`appId`、工作区管理标记文件 `.robotdog-managed`、串口行协议前缀 `@RDS1` 均作为兼容性契约完整保留。
- **用户数据目录与隔离机制**：
  三个教学发行版在运行时通过 `app.setPath('userData', ...)` 分别指向独立的目录，彼此物理隔离：
  - 趣味巡线版：`%APPDATA%\RobotDogStudio-Fun`
  - CH32 单片机入门版：`%APPDATA%\RobotDogStudio-MCU`
  - TI MSPM0 教学版：`%APPDATA%\RobotDogStudio-TI-MSPM0`  
  *(注：`%APPDATA%\robotdog-studio` 属于历史单版本时期的旧数据目录，仅在趣味巡线版首次启动检测到时执行一次性非破坏迁移，并非当前统一的数据存储路径。)*

---

## 2. 进程架构与职责边界

系统严格遵循 Electron 多进程安全架构：

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│                           Renderer 进程 (UI 视图层)                          │
│  React 19 + TypeScript + Vite + 原生 CSS (自定义属性变量) + Monaco Editor    │
│  - 纯前端展示与用户交互，不持有 Node.js 运行时或操作系统原生权限             │
│  - 状态管理：原生 React Hooks (useState / useMemo / useRef / useEffect)       │
│  - 样式实现：src/renderer/src/styles.css 原生 CSS 变量与现代响应式布局       │
│  - 代码编辑：Monaco Editor (C 语言语法高亮、只读锁定与编译器诊断展示)         │
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
│  - 远程课程热更新服务 (CourseUpdateService)                                  │
│  - 固件基线与交叉编译 (FirmwareBaselineResolver, FirmwareBuildService)       │
│  - 硬件通信与下载 (SerialPort, WchLinkFlashService, TiOpenOcdService)        │
│  - AI 助教与本地模型接入 (AgentSessionService, ReasonixProcessManager)       │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. 三大教学发行版体系 (Editions)

同一套代码库构建并维护三个相互独立的发行版，在构建或启动时由 `ROBOTDOG_EDITION` 环境变量决定（参见 `src/shared/edition.ts`）：

| 维度 | 趣味巡线版 (`fun-line-following`) | 单片机入门版 (`mcu-foundations`) | TI MSPM0 教学版 (`ti-mspm0-foundations`) |
| --- | --- | --- | --- |
| **目标用户** | 中小学、零基础学习者 | 电子、自动化专业大学低年级学生 | 现代 ARM Cortex-M0+ 体系课程 |
| **目标硬件** | CH32V203 机器马 | CH32V203 教学开发板 / 机器马 | TI LP-MSPM0G3507 开发板 |
| **芯片型号 (`target`)** | `CH32V203C8T6` | `CH32V203C8T6` | `MSPM0G3507` |
| **平台标识 (`platform`)** | `wch-ch32v203` | `wch-ch32v203` | `ti-mspm0` |
| **工具链画像 (`toolchainProfile`)** | `wch-gcc12-openocd` | `wch-gcc12-openocd` | `ti-mspm0-sdk-2.11-gcc9-openocd` |
| **固件基线体系** | `ch32v203-robotdog` 基线 | 课次：`ch32v203-rhs-baseline`<br>自由沙盒：`ch32v203-pony-v25` | `ti-mspm0g3507` 基线 |
| **可执行文件名** | `RobotDogStudio-Fun.exe` | `RobotDogStudio-MCU.exe` | `RobotDogStudio-TI-MSPM0.exe` |
| **用户数据目录** | `%APPDATA%\RobotDogStudio-Fun` | `%APPDATA%\RobotDogStudio-MCU` | `%APPDATA%\RobotDogStudio-TI-MSPM0` |

---

## 4. 工作区模型与身份契约 (Workspace Identity)

每个工程工作区存储在当前 Edition 的受管数据目录（`app.getPath('userData')/managed-data/workspaces/<id>`），是一个由系统管理的独立本地 Git 仓库，根目录带有 `.robotdog-managed` 标记。

工作区元数据遵循 **Schema v4** 规范（参见 `src/shared/types.ts` 中的 `WorkspaceMetadata`）：

```typescript
export interface WorkspaceMetadata {
  schemaVersion: 4
  id: string
  name: string
  studentDisplayName: string
  learningPath: 'fun-line-following' | 'mcu-foundations' | 'ti-mspm0-foundations'
  platform: 'wch-ch32v203' | 'ti-mspm0'
  target: 'CH32V203C8T6' | 'MSPM0G3507'
  toolchainProfile: 'wch-gcc12-openocd' | 'ti-mspm0-sdk-2.11-gcc9-openocd'
  workspacePurpose: 'fun-project' | 'mcu-sandbox' | 'mcu-lesson-attempt'
  templateId: string
  templateVersion: string
  courseBinding?: {
    courseId: string
    lessonId: string
    contentVersion: number
    attemptNumber: number
  }
  firmwareBaselineId: string
  baselineCommit: string
  nameCustomized: boolean
  createdAt: string
  updatedAt: string
  activeBranch: 'main'
  lastCheckpoint: string
  policyProfile: 'student-v1' | 'mcu-foundations-v1' | 'ti-mspm0-foundations-v1'
  state: WorkspaceState
  activeCandidateId?: string
}
```

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
- **`ch32v203-rhs-baseline`**：轻量教学基线，外设显式声明（Opt-in），用于单片机分步课次实验；
- **`ch32v203-pony-v25`**：包含舵机步态逆解、CCD 驱动与 RDS1 通信的全功能小马固件，用于单片机入门版的“自由练习沙盒（`mcu-sandbox`）”；
- **`ch32v203-robotdog`**：趣味巡线版的专用机器马固件基线；
- **`ti-mspm0g3507`**：包含 TI DriverLib 与板级初始化的标准固件骨架。

### 5.3 课程体系与讲义解析器
- **`CourseService`**：加载课程与课次 Manifest，驱动课次目标、步骤流与完成条件判定；
- **`CourseLectureParser`**：负责将 Lecture Markdown 解析为受控 AST（严格限制标题 ID、过滤危险标签与未知语法，确保讲义安全可预测）；
- **`LessonLearningProgressStore`**：基于内容版本与 Section ID 持久化讲义阅读状态，与学生实验操作进度解耦。

### 5.4 远程课程更新服务 (`CourseUpdateService`)
- 客户端通过 HTTPS 访问远程 Gitee 仓库的 `update.json`；
- 课程缓存存储于 `app.getPath('userData')/courses/<editionId>/`，因发行版独立的数据目录而天然物理隔离；
- 支持 tar.exe 快速解压并兜底 PowerShell `Expand-Archive`；
- **强事务原子更新机制**：解压校验通过后执行 `current -> backup`，移入新内容并写入新的 `state.json`，在执行回调成功后才清除 backup；如在置换、写 state 或重载过程中发生任何异常，自动清除损坏文件并无缝还原旧版课程与旧版 `state.json`。

### 5.5 AI 助教与安全沙箱 (`ReasonixProcessManager` & `AgentSessionService`)
- 内置针对代码生成的轻量模型运行时 Reasonix；
- **严格权限策略**：AI 仅允许修改课次 Manifest 中 `editableGlobs` 声明的白名单文件（如 `experiment.c`），禁止触碰启动汇编、链接脚本、Bootloader 或系统敏感路径；
- **只读工程注入**：讲义与基线头文件以只读上下文形式提供给 AI，确保回答贴合具体课程场景。

---

## 6. Shared 共享层架构

`src/shared/` 包含 Main、Preload 与 Renderer 共同遵守的类型定义与通信契约，不引入 Node.js 原生 API 或浏览器 DOM：

- **`channels.ts`**：强类型的 IPC 通道名称常量集合（`IPC_CHANNELS`）；
- **`edition.ts`**：发行版元数据画像（`EDITION_PROFILES`）、平台定义与默认配置；
- **`types.ts`**：工作区、候选补丁、课程、固件、调试与硬件协议核心数据类型；
- **`agent-event-history.ts`**：AI 对话流事件压缩与历史切片辅助函数；
- **`iap-protocol.ts`**：IAP 固件升级协议帧编码与校验工具。
