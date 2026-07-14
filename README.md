# RobotDog Studio

RobotDog Studio 是面向中小学机器马巡线教学与比赛的 Electron 桌面上位机。项目目前已完成安全桌面底座、三通道模拟链路，以及 Reasonix 驱动的受控 AI 修改闭环。

重开 Codex 对话继续开发时，优先阅读 [开发交接文档](./docs/development-handoff-2026-07-14.md)，其中记录了当前仓库状态、活动固件基线、打包验证结果、WCH-Link 驱动现状和下一步开发顺序。

## 本地开发

需要 Node.js 24 与 Corepack。仓库固定使用 pnpm 11.8.0：

```powershell
corepack prepare pnpm@11.8.0 --activate
corepack pnpm install
corepack pnpm reasonix:prepare
corepack pnpm dev
```

验证命令：

```powershell
corepack pnpm typecheck
corepack pnpm test
corepack pnpm build
```

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
- PR 合并前至少运行 `npm run reasonix:prepare`、`npm run typecheck`、`npm test` 和 `npm run build`；
- 不提交真实 API Key、`.env`、本地工作区或临时构建产物；
- 下位机整改任务优先参考 [下位机固件必需改动清单](./docs/firmware-required-changes-brief.md)；
- 历史发布计划和已完成阶段计划已归档到 [docs/archive](./docs/archive/README.md)。

## 内置 WCH 固件工具链

RobotDog Studio 按完整版设计交付，用户无需安装 MounRiver Studio 即可编译 CH32V203 固件。

当前内置的 Windows 命令行工具链位于：

```text
vendor/wch/
├─ Toolchain/RISC-V Embedded GCC12
└─ OpenOCD/OpenOCD
```

使用内置 GCC12 验证 `D:\RobotDog\ch32v203-robot-dog` 固件工程：

```powershell
npm run firmware:build:ch32v203
```

默认读取 `D:\RobotDog\ch32v203-robot-dog`，构建产物输出到 `.firmware-build/ch32v203-robot-dog/<timestamp>/`，包括：

- `RobotDog.elf`
- `RobotDog.hex`
- `RobotDog.bin`
- `RobotDog.map`
- `build-proof.json`

可以通过环境变量覆盖路径：

```powershell
$env:ROBOTDOG_FIRMWARE_ROOT='D:\path\to\firmware'
$env:ROBOTDOG_FIRMWARE_OUT='D:\path\to\output'
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
- 固定 Reasonix v1.17.12 ACP 运行时、连续会话和 Markdown 对话；Reasonix profile 由任务类型自动选择，不暴露给学生界面。
- 内置面向小学高年级学生的版本化工程提示词；允许的候选文件修改自动执行，整轮结束统一查看一次 Diff。
- 100%/125%/150%/175% 界面缩放、2K/4K 自动推荐和按缩放后空间重排的高 DPI 工作台。
- AI 只修改隔离候选工作区；Main 进程再次执行白名单、路径、Diff 和源码树校验。
- 候选修改可查看 Diff，使用内置 WCH GCC 预检学生 C 代码并校验巡线 YAML；构建证明与源码树、Diff 哈希绑定。
- 通过预检的候选可原子应用到正式工作区并创建 Git 检查点；历史可见，撤销使用新的 Revert 提交，不改写历史。
- 应用中断、候选篡改、构建失败和提交失败均有恢复路径，重启后会对账候选状态。

候选预检当前编译学生可编辑的 C 单元并校验参数文件；完整固件生成、Windows 离线测试包和 WCH-Link 烧录页已进入联调阶段。当前开发入口见 [开发交接文档](./docs/development-handoff-2026-07-14.md)，历史三通道设计与 AI 修改闭环计划已归档到 [docs/archive](./docs/archive/README.md)。

交付下位机开发者的具体改造接口与验收要求见 [下位机固件修改要求](./docs/firmware-developer-modification-requirements.md)。

## 重要安全说明

当前版本处于模拟阶段，界面中的急停是软件急停。真实硬件必须同时实现下位机动作看门狗，并保留物理断电手段。
