# RobotDog Studio

RobotDog Studio 是共用一套核心能力、分别面向中小学巡线教学和大学单片机入门的 Electron 桌面上位机。当前产品演进以 [双发行版教学改造总纲](./docs/dual-edition-teaching-plan.md) 为准；单片机课程框架见[课程框架详细实施计划](./docs/mcu-course-framework-implementation-plan.md)，大学生版界面见[代码优先工作台计划与实施记录](./docs/mcu-code-first-workbench-redesign-plan.md)，课程讲义见[讲义系统实施计划](./docs/mcu-lecture-system-implementation-plan.md)与[讲义格式规范](./docs/robotdog-lecture-markdown-v1.md)。两个发行版来自同一仓库，但使用独立安装身份和数据目录。

重开 Codex 对话继续开发时，先阅读双发行版总纲，再阅读 [开发交接文档](./docs/development-handoff-2026-07-14.md)。交接文档记录的是 2026-07-14 时点的实现状态，其中单发行版产品描述已由新总纲取代。

## 本地开发

需要 Node.js 24 与 Corepack。仓库固定使用 pnpm 11.8.0：

```powershell
corepack prepare pnpm@11.8.0 --activate
corepack pnpm install
corepack pnpm reasonix:prepare
corepack pnpm dev:fun
corepack pnpm dev:mcu
```

频繁验证单片机版界面时，可在仓库根目录双击 `start-mcu-dev.cmd`。开发窗口会直接启动，Renderer 修改通常会热更新，Main/Preload 修改会由 electron-vite 自动重启；无需重新打包或解压。

验证命令：

```powershell
corepack pnpm check
```

`check` 会依次校验 MCU 课程资源、运行测试，并完成类型检查和生产构建。
需要定位单项问题时，仍可分别运行 `courses:validate`、`typecheck`、`test`
和 `build`。

日常界面调整和缺陷修复默认只运行类型检查、自动化测试以及必要的开发模式点击验证；不主动生成 ZIP 或安装包。只有项目所有者明确提出打包、测试分发物或发布验收时，才执行下列 Windows 打包命令。

## Windows 打包

两个便携测试包（ZIP，解压即用）：

```powershell
npm run package:win:fun:test
npm run package:win:mcu:test
```

两个 NSIS 安装器测试包（安装器提权安装，自动安装 WCH-Link 驱动）：

```powershell
npm run package:win:fun:nsis:test
npm run package:win:mcu:nsis:test
```

旧命令 `package:win:test` 和 `package:win:nsis:test` 保留为趣味巡线版兼容入口。NSIS 安装器为 per-machine 管理员安装，安装过程中自动调用 pnputil 安装 WCH-Link 驱动。应用以普通权限运行，不自行请求管理员权限。更多打包说明见 [Windows 打包与 SDK 切换](./docs/windows-packaging-and-baseline-switch.md)，实际点击与硬件验收见 [双发行版人工验收清单](./docs/dual-edition-manual-acceptance.md)。

## GitHub 协作开发

本仓库当前定位为私有协作开发仓库，用于上位机、下位机、AI 修改闭环、固件构建与硬件联调的共同开发。新协作者建议使用 recursive clone，确保 Reasonix 子模块同步：

```powershell
git clone --recurse-submodules <repo-url>
cd robotdog-studio
corepack prepare pnpm@11.8.0 --activate
corepack pnpm install
corepack pnpm reasonix:prepare
corepack pnpm dev
```

如果已经普通 clone：

```powershell
git submodule update --init --recursive
```

协作约定：

- `main` 分支保持可构建；
- 新功能优先使用 `codex/`、`ui/`、`firmware/`、`docs/`、`release/` 前缀分支；
- PR 合并前至少运行 `npm run reasonix:prepare` 和 `npm run check`；
- 不提交真实 API Key、`.env`、本地工作区或临时构建产物；
- 下位机整改任务优先参考 [下位机固件必需改动清单](./docs/firmware-required-changes-brief.md)；
- 历史发布计划和已完成阶段计划已归档到 [docs/archive](./docs/archive/README.md)。

## MCU 固件与内置 WCH 工具链

RobotDog Studio 按完整版设计交付，用户无需安装 MounRiver Studio 即可编译 CH32V203 固件。

当前内置的 Windows 命令行工具链位于：

```text
vendor/wch/
├─ Toolchain/RISC-V Embedded GCC12
└─ OpenOCD/OpenOCD
```

大学单片机版当前使用仓库内的
[`firmware/ch32v203-baseline`](./firmware/ch32v203-baseline) 作为 RHS 机器马
固件基线。它面向 CH32V203C8T6，使用 `RHS_` 新接口，默认启动不驱动舵机、
蜂鸣器、串口、OLED 或 CCD。构建方式：

```powershell
$env:RHS_TOOLCHAIN_ROOT = (Resolve-Path 'vendor/wch/Toolchain/RISC-V Embedded GCC12').Path
cmake --preset wch-gcc12 -S firmware/ch32v203-baseline
cmake --build firmware/ch32v203-baseline/build/release
```

固件目录内会生成以下固定产物：

- `RHSFirmwareBaseline.elf`
- `RHSFirmwareBaseline.hex`
- `RHSFirmwareBaseline.bin`
- `RHSFirmwareBaseline.map`

趣味巡线版仍使用独立的历史固件基线。维护该发行版时，可用以下命令拉取、
核验并构建其锁定提交：

```powershell
npm run firmware:source:prepare
npm run firmware:build:ch32v203
```

## 当前能力

- Electron Main、Preload、Renderer 三进程隔离。
- Main 侧动作白名单与 3 秒运动安全时限。
- 浏览器和 Electron 共用的模拟设备体验。
- CCD 128 点曲线、阈值、中心和偏差展示。
- 连接、动作、检测黑线和软件急停交互。
- 无线运行态与有线下载口的独立状态、USB 插拔模拟和完整升级向导。
- 固件升级预检、停机、IAP 握手、擦写、校验、重启、无线重连及失败可重试模型。
- IAP 二进制帧、CRC32 流解析、固件 SHA-256/板型/Flash 区域校验和稳定设备身份注册。
- 教师模式完整恢复模拟；学生下载与教师恢复互斥，关键写入阶段禁止强制取消。
- 蓝牙运行态协议、板载有线 IAP 与 WCH-Link 教师恢复的三通道方案，以及内置 WCH GCC12/OpenOCD 和命令行构建适配。
- 固定 Reasonix v1.17.12 ACP 运行时、`deepseek-v4-flash` 模型、连续会话和 Markdown 对话；Reasonix 工作模式由任务类型自动选择，不改变模型，也不暴露给学生界面。
- 内置面向小学高年级学生的版本化工程提示词；允许的候选文件修改自动执行，整轮结束统一查看一次 Diff。
- 100%/125%/150%/175% 界面缩放、2K/4K 自动推荐和按缩放后空间重排的高 DPI 工作台。
- AI 只修改隔离候选工作区；Main 进程再次执行白名单、路径、Diff 和源码树校验。
- 候选修改可查看 Diff，使用内置 WCH GCC 预检学生 C 代码并校验巡线 YAML；构建证明与源码树、Diff 哈希绑定。
- 通过预检的候选可原子应用到正式工作区并创建 Git 检查点；历史可见，撤销使用新的 Revert 提交，不改写历史。
- 应用中断、候选篡改、构建失败和提交失败均有恢复路径，重启后会对账候选状态。

大学单片机版目前提供第一课连续讲义、受控实验代码、Candidate Build、完整
RHS 固件构建和 WCH-Link 写入流程；涉及真实 LED 现象的发布状态仍以课次中的
硬件验证门禁为准。历史三通道设计与已完成阶段计划见
[docs/archive](./docs/archive/README.md)。

交付下位机开发者的具体改造接口与验收要求见 [下位机固件修改要求](./docs/firmware-developer-modification-requirements.md)。

## 重要安全说明

趣味巡线版界面中的急停是软件急停；真实运动硬件必须同时实现下位机动作
看门狗，并保留物理断电手段。RHS MCU 基线不会在 `main()` 中自动启动舵机或
蜂鸣器，新增硬件实验也应继续保持显式启用。
